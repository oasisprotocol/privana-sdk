'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useWalletClient, useWriteContract, useSendTransaction, useConfig } from 'wagmi'
import { getTransactionReceipt, waitForTransactionReceipt } from '@wagmi/core'
import { erc20Abi, zeroAddress } from 'viem'
import { usePrivanaContext } from '../context/privana-provider'
import { useEnsureCorrectChain } from './use-ensure-correct-chain'
import { usePrivateReadRequest } from './use-private-read-request'
import { useDepositVerification, type VerificationContext } from './use-deposit-verification'
import type { Bytes32, DepositAddressResponse, DepositCheckResponse } from '../types'

export interface UseDepositOptions {
  onDepositAddressReceived?: (response: DepositAddressResponse) => void
  onDepositSuccess?: (txHash: string) => void
  onCredited?: (txHash: string, response: DepositCheckResponse) => void
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
  savedAt: number
}

const STALE_MS = 30 * 60 * 1000

function storageKey(address: string): string {
  return `privana:pending-deposit:${address.toLowerCase()}`
}

function savePendingDeposit(address: string, data: PersistedDeposit): void {
  try {
    sessionStorage.setItem(storageKey(address), JSON.stringify(data))
  } catch {
    // sessionStorage may be unavailable (incognito quota, etc.)
  }
}

function loadPendingDeposit(address: string): PersistedDeposit | null {
  try {
    const raw = sessionStorage.getItem(storageKey(address))
    if (!raw) return null
    const data: PersistedDeposit = JSON.parse(raw)
    if (Date.now() - data.savedAt > STALE_MS) {
      clearPendingDeposit(address)
      return null
    }
    return data
  } catch {
    return null
  }
}

function clearPendingDeposit(address: string): void {
  try {
    sessionStorage.removeItem(storageKey(address))
  } catch {
    // ignore
  }
}

export function useDeposit(options: UseDepositOptions = {}): UseDepositResult {
  const { address } = useAccount()
  const { client, enabledTokens, getChainById } = usePrivanaContext()
  const { data: walletClient } = useWalletClient()
  const queryClient = useQueryClient()
  const config = useConfig()
  const { executePrivateRead } = usePrivateReadRequest()

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
  const onCheckTimeoutRef = useRef(options.onCheckTimeout)
  const onErrorRef = useRef(options.onError)
  useEffect(() => {
    onDepositAddressReceivedRef.current = options.onDepositAddressReceived
    onDepositSuccessRef.current = options.onDepositSuccess
    onCreditedRef.current = options.onCredited
    onCheckTimeoutRef.current = options.onCheckTimeout
    onErrorRef.current = options.onError
  }, [
    options.onDepositAddressReceived,
    options.onDepositSuccess,
    options.onCredited,
    options.onCheckTimeout,
    options.onError,
  ])

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
    onCredited: (hash, response) => {
      verificationContextRef.current = null
      if (address) clearPendingDeposit(address)
      onCreditedRef.current?.(hash, response)
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
      return executePrivateRead(() => client.getDepositAddress())
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
          await getTransactionReceipt(config, { hash, chainId: persisted.chainId })
          confirmed = true
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

        // 2. Switch to source chain
        setIsSwitchingChain(true)
        try {
          await ensureCorrectChain(sourceChain.id)
        } finally {
          if (!isStale()) setIsSwitchingChain(false)
        }
        if (isStale()) return

        // 3. Validate deposit address
        const depositAddr = addrResponse.deposit_address
        if (!depositAddr || depositAddr === zeroAddress) {
          throw new Error('Invalid deposit address received from API')
        }

        // 3b. Validate amount against the backend minimum. Below this the
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

        // 4. Send transfer to the deposit address (native or ERC-20)
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
        savePendingDeposit(address, {
          txHash: hash,
          chainId: sourceChain.id,
          amount: params.amount.toString(),
          depositAddress: addrResponse,
          savedAt: Date.now(),
        })

        try {
          // 5. Wait for on-chain confirmation
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
      getChainById,
      config,
      confirmations,
      enabledTokens,
      ensureCorrectChain,
      queryClient,
      writeContractAsync,
      sendTransactionAsync,
      reset,
      verify,
    ]
  )

  // Wrap the inner hook's retry so it works after a wallet/receipt-phase failure
  // too. We keep our own ctx set the moment the on-chain transfer is dispatched,
  // before waitForTransactionReceipt — the inner hook only knows about
  // contexts that reached verify().
  const retryVerification = useCallback(async (): Promise<void> => {
    const ctx = verificationContextRef.current
    if (!ctx) {
      throw new Error('No pending deposit to verify')
    }
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
