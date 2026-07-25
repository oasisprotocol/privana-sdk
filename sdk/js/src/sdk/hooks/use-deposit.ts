'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useWalletClient, useWriteContract, useSendTransaction, useConfig } from 'wagmi'
import {
  getBlockNumber,
  getTransactionReceipt,
  getWalletClient,
  waitForTransactionReceipt,
} from '@wagmi/core'
import { erc20Abi, zeroAddress } from 'viem'
import { usePrivanaContext } from '../context/privana-provider'
import { useEnsureCorrectChain } from './use-ensure-correct-chain'
import { usePrivateReadRequest } from './use-private-read-request'
import { useDepositVerification, type VerificationContext } from './use-deposit-verification'
import {
  canUseBrowserStorage,
  getBrowserStorageItem,
  removeBrowserStorageItem,
  setBrowserStorageItem,
} from './browser-storage'
import {
  clampLockAmount,
  createSignedLockRequest,
  isSignedLockUsable,
  requireDepositLockOwner,
  requireServiceAddress,
  submitPendingLock,
  PostDepositLockError,
  type PostDepositLockConfig,
} from './pending-lock'
import type {
  Bytes32,
  DepositAddressResponse,
  DepositCheckResponse,
  LockFundsRequest,
  TransactionSubmissionResponse,
} from '../types'

export interface UseDepositOptions {
  onDepositAddressReceived?: (response: DepositAddressResponse) => void
  onDepositSuccess?: (txHash: string) => void
  /** `lockPending` is true when a pre-signed lock is being submitted after
   * this credit — `onLockSubmitted` or `onLockFailed` will follow. */
  onCredited?: (txHash: string, response: DepositCheckResponse, lockPending?: boolean) => void
  /** Fired when the pre-signed post-deposit lock is accepted by the API. */
  onLockSubmitted?: (response: TransactionSubmissionResponse) => void
  /**
   * Fired when the deposit credited but the pre-signed lock could not be
   * submitted. The funds sit in the user's available balance. Fresh signing
   * is safe only for failures known to precede any API attempt; otherwise
   * retry or reconcile the same signature. Falls back to `onError`.
   */
  onLockFailed?: (error: PostDepositLockError) => void
  /** Called when deposit check polling times out - deposit may still be processing */
  onCheckTimeout?: (txHash: string) => void
  onError?: (error: Error) => void
  /** Polling interval in ms for checking deposit status (default: 5000) */
  pollInterval?: number
  /** Max time to wait for deposit to be credited in ms (default: 180000 = 3 minutes) */
  pollTimeout?: number
  /** Number of block confirmations to wait before checking deposit status (default: 15) */
  confirmations?: number
}

export interface DepositParams {
  tokenId: Bytes32
  amount: bigint
  /**
   * Pre-sign a `Lock` for the deposited amount (capped by `maxAmount`) before
   * the transfer; the SDK submits it once the deposit credits.
   */
  postDepositLock?: PostDepositLockConfig
}

export interface UseDepositResult {
  depositAddress: DepositAddressResponse | null
  txHash: `0x${string}` | undefined
  isGettingAddress: boolean
  isSwitchingChain: boolean
  isSendingTransaction: boolean
  isWaitingForConfirmation: boolean
  isWaitingForProcessing: boolean
  /** True if processing timed out (deposit may still be processing in background) */
  didTimeout: boolean
  /**
   * True when an on-chain transfer succeeded but the API verification step
   * (checkDeposit or status polling) failed. The funds have already left the
   * wallet, so a fresh `deposit()` would cause a double spend. Call
   * `retryVerification()` to re-run verification against the existing txHash,
   * or `reset()` to discard local tracking (the deposit may still be credited
   * in the background).
   */
  verificationFailed: boolean
  isPending: boolean
  error: Error | null
  deposit: (params: DepositParams) => Promise<void>
  /** Re-run the API verification (sweep trigger + polling) for the existing txHash. */
  retryVerification: () => Promise<void>
  reset: () => void
}

interface PersistedDeposit {
  txHash: string
  chainId: number
  amount: string
  depositAddress: DepositAddressResponse
  signedLock?: LockFundsRequest
  savedAt: number
}

const STALE_MS = 30 * 60 * 1000

function storageKey(address: string): string {
  return `privana:pending-deposit:${address.toLowerCase()}`
}

function savePendingDeposit(address: string, data: PersistedDeposit): void {
  const stored = setBrowserStorageItem(storageKey(address), JSON.stringify(data))
  if (!stored && data.signedLock) {
    throw new Error('Unable to persist pending locked deposit for recovery')
  }
}

function loadPendingDeposit(address: string): PersistedDeposit | null {
  try {
    const raw = getBrowserStorageItem(storageKey(address))
    if (!raw) return null
    const data: PersistedDeposit = JSON.parse(raw)
    // A still-usable signed lock keeps the record alive past STALE_MS: the
    // lock's own expiry is the real deadline, and dropping the record here
    // would silently orphan a lock the user already signed.
    if (
      Date.now() - data.savedAt > STALE_MS &&
      !(data.signedLock && isSignedLockUsable(data.signedLock))
    ) {
      clearPendingDeposit(address)
      return null
    }
    return data
  } catch {
    return null
  }
}

// `onlyForTxHash` guards the deferred post-lock cleanup: a new deposit may
// have persisted its own record for this address by the time the previous
// deposit's lock submission settles, and that record must survive.
function clearPendingDeposit(address: string, onlyForTxHash?: string): void {
  if (onlyForTxHash) {
    try {
      const raw = getBrowserStorageItem(storageKey(address))
      // Records without a txHash are corrupt, not a successor's — clear them.
      const recordTxHash = raw ? (JSON.parse(raw) as PersistedDeposit).txHash : undefined
      if (recordTxHash && recordTxHash !== onlyForTxHash) return
    } catch {
      // Unreadable record — fall through and clear it.
    }
  }
  removeBrowserStorageItem(storageKey(address))
}

export function useDeposit(options: UseDepositOptions = {}): UseDepositResult {
  const { address } = useAccount()
  const { client, enabledTokens, getChainById, networkConfig, serviceAddress } = usePrivanaContext()
  const { data: walletClient } = useWalletClient()
  const queryClient = useQueryClient()
  const config = useConfig()
  const { executePrivateRead, privateReadAddress } = usePrivateReadRequest()
  const privateReadAddressRef = useRef(privateReadAddress)
  privateReadAddressRef.current = privateReadAddress

  const confirmations = options.confirmations ?? 15

  const [depositAddress, setDepositAddress] = useState<DepositAddressResponse | null>(null)
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [isSwitchingChain, setIsSwitchingChain] = useState(false)
  const [isWaitingForConfirmation, setIsWaitingForConfirmation] = useState(false)
  // Captures failures from the pre-verification phase (waitForTransactionReceipt
  // timing out, etc.) so we can OR them with the verification hook's own
  // verificationFailed when surfacing state to consumers.
  const [receiptFailed, setReceiptFailed] = useState(false)
  const [depositError, setDepositError] = useState<Error | null>(null)

  const generationRef = useRef(0)
  // Set the moment we know an on-chain transfer has been dispatched so we
  // refuse a second deposit() call that would double-spend. Cleared on
  // credit / reset.
  const verificationContextRef = useRef<VerificationContext | null>(null)

  // Use refs for callbacks to avoid stale closures in the long-running deposit flow
  const onDepositAddressReceivedRef = useRef(options.onDepositAddressReceived)
  const onDepositSuccessRef = useRef(options.onDepositSuccess)
  const onCreditedRef = useRef(options.onCredited)
  const onLockSubmittedRef = useRef(options.onLockSubmitted)
  const onLockFailedRef = useRef(options.onLockFailed)
  const onCheckTimeoutRef = useRef(options.onCheckTimeout)
  const onErrorRef = useRef(options.onError)
  useEffect(() => {
    onDepositAddressReceivedRef.current = options.onDepositAddressReceived
    onDepositSuccessRef.current = options.onDepositSuccess
    onCreditedRef.current = options.onCredited
    onLockSubmittedRef.current = options.onLockSubmitted
    onLockFailedRef.current = options.onLockFailed
    onCheckTimeoutRef.current = options.onCheckTimeout
    onErrorRef.current = options.onError
  }, [
    options.onDepositAddressReceived,
    options.onDepositSuccess,
    options.onCredited,
    options.onLockSubmitted,
    options.onLockFailed,
    options.onCheckTimeout,
    options.onError,
  ])

  // Signed lock waiting for the deposit to credit. Mirrors the persisted copy
  // so a resumed session can still submit it.
  const pendingLockRef = useRef<LockFundsRequest | null>(null)

  // The deposit is credited either way; only the lock half can fail here, so
  // route failures to the dedicated callback (or onError as fallback) instead
  // of the deposit error state.
  const submitPendingLockAfterCredit = useCallback(
    async (signedLock: LockFundsRequest, creditedAmount: bigint) => {
      try {
        const result = await submitPendingLock({
          client,
          payload: signedLock,
          creditedAmount,
        })
        queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
        queryClient.invalidateQueries({ queryKey: ['accounting-locked-funds'] })
        queryClient.invalidateQueries({ queryKey: ['accounting-total-locked-balance'] })
        queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
        onLockSubmittedRef.current?.(result)
      } catch (err) {
        const error =
          err instanceof PostDepositLockError
            ? err
            : new PostDepositLockError(
                err instanceof Error ? err.message : 'Lock submission failed',
                'submission-failed',
                BigInt(signedLock.amount),
                creditedAmount,
                { cause: err }
              )
        ;(onLockFailedRef.current ?? onErrorRef.current)?.(error)
      }
    },
    [client, queryClient]
  )

  const {
    isVerifying,
    didTimeout,
    verificationFailed: innerVerificationFailed,
    error: verificationError,
    verify,
    reset: resetVerification,
  } = useDepositVerification({
    pollInterval: options.pollInterval,
    pollTimeout: options.pollTimeout,
    onCredited: (hash, response, creditedAmount) => {
      verificationContextRef.current = null
      const signedLock = pendingLockRef.current
      pendingLockRef.current = null
      // Kick off the lock submission before the host callback: a throwing
      // onCredited must not be able to strand the signed lock. Keep the
      // persisted record (it carries the signed lock) until the attempt
      // settles, so a tab close mid-submission can retry next session.
      // At-least-once edge: if the tab dies after the API accepted the lock
      // but before the response arrived, the retry re-submits a consumed
      // nonce and surfaces as a (fund-safe) spurious 'lock failed' — the
      // client cannot distinguish that from a submission that never landed.
      if (signedLock) {
        void submitPendingLockAfterCredit(signedLock, creditedAmount).finally(() => {
          if (address) clearPendingDeposit(address, hash)
        })
      } else if (address) {
        clearPendingDeposit(address)
      }
      onCreditedRef.current?.(hash, response, signedLock !== null)
    },
    onCheckTimeout: (hash) => {
      onCheckTimeoutRef.current?.(hash)
    },
    onError: (err) => {
      onErrorRef.current?.(err)
    },
  })

  const addressMutation = useMutation({
    mutationFn: async () => {
      if (!address) throw new Error('No wallet connected')
      return executePrivateRead((readClient) => readClient.getDepositAddress())
    },
    onSuccess: (data) => {
      setDepositAddress(data)
      onDepositAddressReceivedRef.current?.(data)
    },
    onError: (error) => {
      onErrorRef.current?.(error as Error)
    },
  })

  const {
    writeContractAsync,
    isPending: isWritingContract,
    error: writeError,
    reset: resetWriteContract,
  } = useWriteContract()

  const {
    sendTransactionAsync,
    isPending: isSendingNative,
    error: sendNativeError,
    reset: resetSendTransaction,
  } = useSendTransaction()

  const isSendingTx = isWritingContract || isSendingNative
  const sendError = writeError ?? sendNativeError

  const { ensureCorrectChain } = useEnsureCorrectChain()

  const invalidateGeneration = useCallback(() => {
    generationRef.current++
  }, [])

  // Cleanup in-flight async work on unmount.
  useEffect(() => {
    return () => {
      invalidateGeneration()
    }
  }, [invalidateGeneration])

  const resumedAddressRef = useRef<string | undefined>(undefined)

  const reset = useCallback(() => {
    generationRef.current++
    resetVerification()
    if (address) clearPendingDeposit(address)
    verificationContextRef.current = null
    pendingLockRef.current = null
    setDepositAddress(null)
    setTxHash(undefined)
    setIsSwitchingChain(false)
    setIsWaitingForConfirmation(false)
    setReceiptFailed(false)
    setDepositError(null)
    addressMutation.reset()
    resetWriteContract()
    resetSendTransaction()
  }, [address, addressMutation, resetWriteContract, resetSendTransaction, resetVerification])

  // Resume a persisted deposit on mount
  useEffect(() => {
    if (!address || resumedAddressRef.current === address) return
    const persisted = loadPendingDeposit(address)
    if (!persisted) return
    resumedAddressRef.current = address

    const hash = persisted.txHash as `0x${string}`
    setTxHash(hash)
    setDepositAddress(persisted.depositAddress)
    setIsWaitingForConfirmation(true)
    pendingLockRef.current = persisted.signedLock ?? null
    const ctx: VerificationContext = {
      hash,
      chainId: persisted.chainId,
      amount: BigInt(persisted.amount),
    }
    verificationContextRef.current = ctx

    const generation = ++generationRef.current
    const isStale = () => generation !== generationRef.current

    ;(async () => {
      try {
        // Try a one-shot receipt fetch first. Resumed deposits were submitted
        // in a previous session, so the transaction is almost certainly mined
        // already. getTransactionReceipt avoids the subscription-based polling
        // of waitForTransactionReceipt, which can hang if the wagmi transport
        // isn't fully initialised yet on mount.
        let confirmed = false
        try {
          const receipt = await getTransactionReceipt(config, {
            hash,
            chainId: persisted.chainId,
          })
          // A receipt exists from the first block, so accepting it alone would
          // confirm a resumed deposit at 1 block where a live one waits 15.
          const blockNumber = await getBlockNumber(config, { chainId: persisted.chainId })
          confirmed = blockNumber - receipt.blockNumber + 1n >= BigInt(confirmations)
        } catch {
          // Receipt not available yet — fall back to polling
        }
        if (!confirmed) {
          await waitForTransactionReceipt(config, {
            hash,
            chainId: persisted.chainId,
            confirmations,
          })
        }
        if (isStale()) return
        setIsWaitingForConfirmation(false)
        onDepositSuccessRef.current?.(hash)
        queryClient.invalidateQueries({ queryKey: ['readContract'] })
        await verify(ctx)
      } catch (err) {
        if (isStale()) return
        setIsWaitingForConfirmation(false)
        const error = err instanceof Error ? err : new Error('Deposit verification failed')
        setDepositError(error)
        setReceiptFailed(true)
        onErrorRef.current?.(error)
      }
    })()
  }, [address, config, confirmations, queryClient, verify])

  const deposit = useCallback(
    async (params: DepositParams) => {
      // Guard: a prior deposit already sent funds on-chain and is waiting on
      // verification. Starting a new flow here would issue a second transfer.
      if (verificationContextRef.current) {
        throw new Error(
          'A deposit is pending verification. Call retryVerification() or reset() first.'
        )
      }

      // Clear state from any previous deposit attempt
      reset()
      const generation = generationRef.current
      const isStale = () => generation !== generationRef.current

      try {
        if (!address || !walletClient) throw new Error('No wallet connected')

        // Resolve token and source chain before anything else
        const token = enabledTokens.find((t) => t.id.toLowerCase() === params.tokenId.toLowerCase())
        if (!token) throw new Error(`Unknown token ID: ${params.tokenId}`)
        const sourceChain = getChainById(token.chainId)
        if (!sourceChain) throw new Error(`Chain ${token.chainId} not configured`)

        // 1. Get deposit address
        const addrResponse = await addressMutation.mutateAsync()
        if (isStale()) return

        // 2. Validate deposit address
        const depositAddr = addrResponse.deposit_address
        if (!depositAddr || depositAddr === zeroAddress) {
          throw new Error('Invalid deposit address received from API')
        }

        // 3. Validate amount against the backend minimum. Below this the
        // deposit processor refuses to credit and funds would be stranded
        // at the per-user deposit address.
        const isNative = token.contract === zeroAddress
        const minsForChain = addrResponse.min_deposit?.[String(sourceChain.id)]
        const minAmountStr = isNative ? minsForChain?.native : minsForChain?.erc20
        if (minAmountStr && params.amount < BigInt(minAmountStr)) {
          throw new Error(
            `Amount is below the minimum deposit (${minAmountStr}) for ${isNative ? 'native' : 'ERC-20'} on chain ${sourceChain.id}`
          )
        }

        if (params.postDepositLock && !canUseBrowserStorage()) {
          throw new Error('Browser storage is required for locked deposit recovery')
        }
        // 4. Sign the exact-amount Lock before any funds move, so the transfer
        // never proceeds without a submittable lock payload in hand. The Lock
        // domain lives on the Accounting chain and wallets reject typed data
        // whose domain chainId differs from the active chain, so switch there
        // before signing.
        const lockAmount = clampLockAmount(params.amount, params.postDepositLock?.maxAmount)
        let signedLock: LockFundsRequest | undefined
        if (params.postDepositLock) {
          const lockOwner = requireDepositLockOwner(address, privateReadAddress)
          setIsSwitchingChain(true)
          try {
            await ensureCorrectChain(networkConfig.chainId)
          } finally {
            if (!isStale()) setIsSwitchingChain(false)
          }
          if (isStale()) return
          // Re-fetch the wallet client bound to the signing chain: the
          // render-time client can go stale across the chain switch above and
          // wagmi then rejects the signature with a chain mismatch.
          const signingWalletClient = await getWalletClient(config, {
            chainId: networkConfig.chainId,
          })
          signedLock = await createSignedLockRequest({
            client,
            walletClient: signingWalletClient,
            userAddress: lockOwner,
            networkConfig,
            serviceAddress: requireServiceAddress(
              params.postDepositLock.serviceAddress ?? serviceAddress
            ),
            tokenId: params.tokenId,
            amount: lockAmount,
            lockDuration: params.postDepositLock.lockDuration,
          })
          if (privateReadAddressRef.current?.toLowerCase() !== lockOwner.toLowerCase()) {
            throw new Error('Authenticated deposit account changed while signing')
          }
        }
        if (isStale()) return

        // 5. Switch to the source chain and send the transfer to the deposit
        // address (native or ERC-20)
        setIsSwitchingChain(true)
        try {
          await ensureCorrectChain(sourceChain.id)
        } finally {
          if (!isStale()) setIsSwitchingChain(false)
        }
        if (isStale()) return
        const hash =
          token.contract === zeroAddress
            ? await sendTransactionAsync({
                to: depositAddr,
                value: params.amount,
                chainId: sourceChain.id,
              })
            : await writeContractAsync({
                address: token.contract,
                abi: erc20Abi,
                functionName: 'transfer',
                args: [depositAddr, params.amount],
                chainId: sourceChain.id,
              })
        if (isStale()) return
        setTxHash(hash)

        // Past this point the wallet has already dispatched the transfer, so any
        // subsequent failure must preserve the hash and route to a retry state
        // rather than appearing terminal.
        const ctx: VerificationContext = {
          hash,
          chainId: sourceChain.id,
          amount: params.amount,
        }
        verificationContextRef.current = ctx
        pendingLockRef.current = signedLock ?? null
        try {
          savePendingDeposit(address, {
            txHash: hash,
            chainId: sourceChain.id,
            amount: params.amount.toString(),
            depositAddress: addrResponse,
            signedLock,
            savedAt: Date.now(),
          })
        } catch (err) {
          console.warn('Failed to persist pending deposit after transfer broadcast:', err)
        }

        try {
          // 6. Wait for on-chain confirmation
          setIsWaitingForConfirmation(true)
          try {
            await waitForTransactionReceipt(config, {
              hash,
              chainId: sourceChain.id,
              confirmations,
            })
          } finally {
            if (!isStale()) setIsWaitingForConfirmation(false)
          }
          if (isStale()) return

          onDepositSuccessRef.current?.(hash)

          // Invalidate wagmi wallet balance queries since tokens have left the wallet
          queryClient.invalidateQueries({ queryKey: ['readContract'] })

          // 6-7. Verification (phase 1 + phase 2) delegated to useDepositVerification
          await verify(ctx)
        } catch (err) {
          if (isStale()) return
          setIsWaitingForConfirmation(false)
          const error = err instanceof Error ? err : new Error('Deposit verification failed')
          setDepositError(error)
          setReceiptFailed(true)
          onErrorRef.current?.(error)
        }
      } catch (err) {
        if (isStale()) return
        const error = err instanceof Error ? err : new Error('Deposit failed')
        // Pre-transfer failure: nothing left the wallet, safe to surface
        // as a terminal error. Post-transfer failures are handled in the
        // inner catch above and never reach here.
        setDepositError(error)
        onErrorRef.current?.(error)
      }
    },
    [
      address,
      walletClient,
      addressMutation,
      client,
      getChainById,
      config,
      confirmations,
      enabledTokens,
      ensureCorrectChain,
      networkConfig,
      privateReadAddress,
      queryClient,
      serviceAddress,
      writeContractAsync,
      sendTransactionAsync,
      reset,
      verify,
    ]
  )

  // Wrap the inner hook's retry so it works after a wallet/receipt-phase failure
  // too. We keep our own ctx set the moment the on-chain transfer is dispatched,
  // before waitForTransactionReceipt — the inner hook only knows about
  // contexts that reached verify(). Also clear receipt-phase failure state so a
  // retry isn't surfaced as "failed and verifying" simultaneously.
  const retryVerification = useCallback(async (): Promise<void> => {
    const ctx = verificationContextRef.current
    if (!ctx) {
      throw new Error('No pending deposit to verify')
    }
    setReceiptFailed(false)
    setDepositError(null)
    await verify(ctx)
  }, [verify])

  const isPending =
    addressMutation.isPending ||
    isSwitchingChain ||
    isSendingTx ||
    isWaitingForConfirmation ||
    isVerifying

  const error = addressMutation.error || sendError || depositError || verificationError

  return {
    depositAddress,
    txHash,
    isGettingAddress: addressMutation.isPending,
    isSwitchingChain,
    isSendingTransaction: isSendingTx,
    isWaitingForConfirmation,
    isWaitingForProcessing: isVerifying,
    didTimeout,
    verificationFailed: innerVerificationFailed || receiptFailed,
    isPending,
    error: error as Error | null,
    deposit,
    retryVerification,
    reset,
  }
}
