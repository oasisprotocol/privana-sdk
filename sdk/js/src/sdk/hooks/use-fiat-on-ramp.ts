'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { decodeEventLog, parseAbiItem, parseUnits, zeroAddress } from 'viem'
import { getWalletClient, waitForTransactionReceipt } from '@wagmi/core'
import { useAccount, useConfig, useWalletClient } from 'wagmi'
import type { MoonPayBuyWidget } from '@moonpay/moonpay-react'

// MoonPay doesn't export these types directly
type MoonPayBuyProps = Parameters<typeof MoonPayBuyWidget>[0]
type OnTransactionCompletedProps = Parameters<
  NonNullable<MoonPayBuyProps['onTransactionCompleted']>
>[0]
type OnTransactionCreatedProps = Parameters<NonNullable<MoonPayBuyProps['onTransactionCreated']>>[0]

import { usePrivanaContext } from '../context/privana-provider'
import {
  applyLockBuffer,
  clampLockAmount,
  clearPendingLock,
  createSignedLockRequest,
  loadPendingLock,
  requireDepositLockOwner,
  requireServiceAddress,
  savePendingLock,
  submitPendingLock,
  PostDepositLockError,
  type OnRampPostDepositLockConfig,
} from './pending-lock'
import { canUseBrowserStorage } from './browser-storage'
import { useDepositVerification } from './use-deposit-verification'
import { useEnsureCorrectChain } from './use-ensure-correct-chain'
import { usePrivateReadRequest } from './use-private-read-request'
import type {
  Address,
  Bytes32,
  HexString,
  OnRampRecord,
  TokenConfig,
  TransactionSubmissionResponse,
} from '../types'

const DEFAULT_DELIVERY_TIMEOUT_MS = 120_000
const DEFAULT_VERIFICATION_TIMEOUT_MS = 10 * 60_000
const DEFAULT_FINALITY_RETRY_INTERVAL_MS = 15_000
const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
)

export type FiatOnRampStatus =
  | 'idle'
  /** Sign-URL succeeded; MoonPay widget shown and user is completing the purchase. */
  | 'awaiting-purchase'
  /** MoonPay reported completion; waiting for the backend webhook to surface the on-chain tx hash. */
  | 'awaiting-delivery'
  /** checkDeposit fired; polling getDepositStatus until credited. */
  | 'verifying'
  | 'credited'
  | 'failed'

export interface FiatOnRampDebugEvent {
  at: string
  event: string
  status: FiatOnRampStatus
  tokenId: Bytes32
  payload?: Record<string, unknown>
}

export interface UseFiatOnRampOptions {
  /** Privana token the on-ramp will deposit into. */
  tokenId: Bytes32
  /**
   * Pre-sign a `Lock` for the buffered quote amount when the intent is
   * created; the SDK submits it once the delivered deposit credits. Requires
   * `prepareOnRampIntent` to be called with `quoteCurrencyAmount`.
   */
  postDepositLock?: OnRampPostDepositLockConfig
  /** Fired when the deposit is credited inside the Privana accounting module. */
  onCredited?: (txHash: string) => void
  /** Fired when the pre-signed post-deposit lock is accepted by the API. */
  onLockSubmitted?: (response: TransactionSubmissionResponse) => void
  /**
   * Fired when the deposit credited but the pre-signed lock could not be
   * submitted. The funds sit in the user's available balance. Fresh signing
   * is safe only for failures known to precede any API attempt; otherwise
   * retry or reconcile the same signature. Falls back to `onError`.
   */
  onLockFailed?: (error: PostDepositLockError) => void
  onError?: (error: Error) => void
  /** Optional diagnostic event stream for previews/tests. No auth tokens or signatures are emitted. */
  onDebugEvent?: (event: FiatOnRampDebugEvent) => void
  /**
   * Max time in ms to wait for the backend to surface the on-chain tx hash
   * after MoonPay reports `transaction_completed` or the widget closes
   * (default: 120000 = 2 minutes).
   * If exceeded, the row stays in `pending` for the user to finish later.
   */
  deliveryTimeout?: number
  /** Polling interval in ms while waiting for the on-chain tx hash (default: 3000). */
  deliveryPollInterval?: number
  /** Max time in ms for Privana deposit verification after the on-chain tx hash appears. */
  verificationTimeout?: number
  /** Retry interval in ms while the source-chain tx waits for finality (default: 15000). */
  finalityRetryInterval?: number
  /** Polling interval in ms while waiting for Privana deposit credit. */
  verificationPollInterval?: number
}

export interface UseFiatOnRampResult {
  status: FiatOnRampStatus
  /** Privana intent id passed to MoonPay as externalTransactionId. */
  activeIntentId: string | null
  /** Completed on-ramps that still need Privana verification. */
  pending: OnRampRecord[]
  /**
   * `transaction_id` of the pending row currently going through verification
   * (receipt fetch → checkDeposit → status polling), or null when idle. Rows
   * being actively verified shouldn't be offered a manual retry.
   */
  activeVerificationId: string | null
  error: Error | null
  /**
   * Per-row finality progress messages (e.g. "Insufficient finality: 4/32 confirmations
   * on chain 11155111"), keyed by `transaction_id`. Updated each time `checkDeposit`
   * sees the row isn't deep enough yet — non-terminal; cleared on credit.
   */
  finalityProgress: Record<string, string>
  /** Per-user Privana deposit address. */
  depositAddress: `0x${string}` | undefined
  /**
   * Minimum deposit in base units for the configured token's chain (e.g. for
   * USDC on Base, "5000000" = 5 USDC). `undefined` until the deposit address
   * response has been fetched.
   */
  minDepositBaseUnits: bigint | undefined
  /**
   * The Privana token config the on-ramp is configured to deposit into. Source
   * of truth for `decimals`/`symbol` - consumers should prefer this over passing
   * those values in by hand. `undefined` if `tokenId` doesn't match any enabled
   * token (e.g., still loading or misconfigured).
   */
  selectedToken: TokenConfig | undefined
  /** Create the backend intent that MoonPay will echo through externalTransactionId. */
  prepareOnRampIntent: (request: {
    currencyCode: string
    baseCurrencyCode?: string
    baseCurrencyAmount?: string
    /**
     * Exact crypto amount (human units) the purchase targets — the same value
     * passed to the widget as `quoteCurrencyAmount`. Required when
     * `postDepositLock` is set: the signed lock amount derives from it.
     */
    quoteCurrencyAmount?: string
  }) => Promise<OnRampRecord>
  /** Wire to `<MoonPayBuyWidget onUrlSignatureRequested>`. */
  signUrl: (url: string) => Promise<string>
  /**
   * Wire to `<MoonPayBuyWidget onTransactionCreated>`. Fire-and-forget - records the Privana
   * `token_id` + `chain_id` against the MoonPay transaction so the backend can credit the
   * right balance when the delivery webhook arrives.
   */
  handleTransactionCreated: (props: OnTransactionCreatedProps) => Promise<void>
  /** Wire to `<MoonPayBuyWidget onTransactionCompleted>`. */
  handleTransactionCompleted: (props: OnTransactionCompletedProps) => Promise<void>
  /** Trigger Privana verification for a row returned by `pending`. */
  finishPendingVerification: (record: OnRampRecord) => Promise<void>
  /** Reconcile local state after the MoonPay widget closes. */
  handleWidgetClosed: () => Promise<void>
  refreshPending: () => Promise<void>
}

/**
 * Buy crypto via MoonPay and credit it to a Privana balance in one flow.
 *
 * Architecture: MoonPay delivers USDC directly to the user's Privana deposit
 * address (NOT the connected wallet) — the wallet is only used for SIWE auth
 * and signs no on-chain transfer. After MoonPay reports the purchase complete,
 * the on-chain tx hash arrives via the MoonPay→backend webhook (not the widget
 * event), so this hook polls `/onramp/pending` until the row's
 * `on_chain_tx_hash` is populated and then triggers Privana verification
 * (`checkDeposit` + `getDepositStatus` poll, delegated to
 * `useDepositVerification`).
 *
 * Wire the returned callbacks to `<MoonPayBuyWidget>`:
 *
 *   onUrlSignatureRequested = signUrl
 *   onTransactionCreated    = handleTransactionCreated
 *   onTransactionCompleted  = handleTransactionCompleted
 *   onClose / onCloseOverlay = handleWidgetClosed
 *
 * Use `<FiatOnRampForm>` if you don't need custom UI around the widget.
 */
export function useFiatOnRamp(options: UseFiatOnRampOptions): UseFiatOnRampResult {
  const {
    tokenId,
    postDepositLock,
    onCredited,
    onLockSubmitted,
    onLockFailed,
    onError,
    onDebugEvent,
  } = options
  const deliveryTimeout = options.deliveryTimeout ?? DEFAULT_DELIVERY_TIMEOUT_MS
  const deliveryPollInterval = options.deliveryPollInterval ?? 3_000
  const verificationTimeout = options.verificationTimeout ?? DEFAULT_VERIFICATION_TIMEOUT_MS
  const finalityRetryInterval = options.finalityRetryInterval ?? DEFAULT_FINALITY_RETRY_INTERVAL_MS

  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { client, enabledTokens, networkConfig, serviceAddress } = usePrivanaContext()
  const { executePrivateRead, privateReadAddress, privateReadReady } = usePrivateReadRequest()
  const privateReadAddressRef = useRef(privateReadAddress)
  privateReadAddressRef.current = privateReadAddress
  const { ensureCorrectChain } = useEnsureCorrectChain()
  const wagmiConfig = useConfig()
  const queryClient = useQueryClient()

  const selectedToken = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())

  const [status, setStatus] = useState<FiatOnRampStatus>('idle')
  const [pending, setPending] = useState<OnRampRecord[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [depositAddress, setDepositAddress] = useState<`0x${string}` | undefined>()
  const [minDepositBaseUnits, setMinDepositBaseUnits] = useState<bigint | undefined>()
  const [activeIntentId, setActiveIntentId] = useState<string | null>(null)
  const [activeVerificationId, setActiveVerificationId] = useState<string | null>(null)
  const [finalityProgress, setFinalityProgress] = useState<Record<string, string>>({})

  const onCreditedRef = useRef(onCredited)
  const onLockSubmittedRef = useRef(onLockSubmitted)
  const onLockFailedRef = useRef(onLockFailed)
  const onErrorRef = useRef(onError)
  const onDebugEventRef = useRef(onDebugEvent)
  const statusRef = useRef(status)
  const activeIntentIdRef = useRef<string | null>(null)
  const activeVerificationRecordRef = useRef<OnRampRecord | null>(null)
  const activeVerificationKeyRef = useRef<string | null>(null)
  /** Address that signed the pending lock. Storage is keyed by it, and the
   * wallet may be disconnected or on another account by credit time. */
  const lockOwnerRef = useRef<Address | null>(null)
  const triggeredVerificationKeysRef = useRef<Set<string>>(new Set())
  /** Resolves when the in-flight verification reaches a terminal state; the
   * auto-verify loop awaits it so rows verify one at a time. */
  const activeVerificationDoneRef = useRef<(() => void) | null>(null)
  const closeReconcilePromiseRef = useRef<Promise<void> | null>(null)
  const purchaseInitiatedRef = useRef(false)
  useEffect(() => {
    onCreditedRef.current = onCredited
    onLockSubmittedRef.current = onLockSubmitted
    onLockFailedRef.current = onLockFailed
    onErrorRef.current = onError
    onDebugEventRef.current = onDebugEvent
  }, [onCredited, onLockSubmitted, onLockFailed, onError, onDebugEvent])

  useEffect(() => {
    statusRef.current = status
  }, [status])

  useEffect(() => {
    activeIntentIdRef.current = activeIntentId
  }, [activeIntentId])

  useEffect(() => {
    activeIntentIdRef.current = null
    setActiveIntentId(null)
  }, [tokenId])

  const emitDebug = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      onDebugEventRef.current?.({
        at: new Date().toISOString(),
        event,
        status: statusRef.current,
        tokenId,
        payload,
      })
    },
    [tokenId]
  )

  useEffect(() => {
    emitDebug('private-read-state', { privateReadReady })
  }, [emitDebug, privateReadReady])

  // Fetch the Privana deposit address once. MoonPay needs this to deliver directly to Privana, bypassing the user's wallet.
  useEffect(() => {
    if (!privateReadReady) {
      emitDebug('deposit-address:skip', { reason: 'private-read-not-ready' })
      setDepositAddress(undefined)
      setMinDepositBaseUnits(undefined)
      return
    }

    let cancelled = false
    void (async () => {
      try {
        emitDebug('deposit-address:request')
        const resp = await executePrivateRead((readClient) => readClient.getDepositAddress())
        if (cancelled) return
        setDepositAddress(resp.deposit_address)
        const token = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
        const mins = token ? resp.min_deposit?.[String(token.chainId)] : undefined
        if (mins?.erc20) setMinDepositBaseUnits(BigInt(mins.erc20))
        emitDebug('deposit-address:success', {
          depositAddress: resp.deposit_address,
          selectedToken: token ? summariseToken(token) : null,
          minDepositBaseUnits: mins?.erc20 ?? null,
        })
      } catch (err) {
        if (!cancelled) {
          emitDebug('deposit-address:error', errorPayload(err))
          console.warn('Failed to fetch Privana deposit address:', err)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client, emitDebug, enabledTokens, executePrivateRead, privateReadReady, tokenId])

  const refreshPending = useCallback(async () => {
    if (!privateReadReady) {
      emitDebug('pending:skip', { reason: 'private-read-not-ready' })
      setPending([])
      return
    }

    try {
      emitDebug('pending:request')
      const { pending: rows } = await executePrivateRead((readClient) =>
        readClient.getPendingOnRamps()
      )
      setPending(rows)
      emitDebug('pending:success', {
        count: rows.length,
        rows: rows.map(summariseOnRampRecord),
      })
    } catch (err) {
      emitDebug('pending:error', errorPayload(err))
      console.warn('Failed to load pending on-ramps:', err)
    }
  }, [emitDebug, executePrivateRead, privateReadReady])

  useEffect(() => {
    refreshPending()
  }, [refreshPending])

  // `expectedKey` guards late clears (e.g. after the awaited work in
  // onCredited): if another record's verification started in the meantime,
  // its refs must survive, so a mismatched clear is a no-op.
  const clearActiveVerification = useCallback((expectedKey?: string | null) => {
    const key = activeVerificationKeyRef.current
    if (expectedKey != null && key !== null && key !== expectedKey) return
    if (key) triggeredVerificationKeysRef.current.delete(key)
    activeVerificationKeyRef.current = null
    activeVerificationRecordRef.current = null
    setActiveVerificationId(null)
    activeVerificationDoneRef.current?.()
    activeVerificationDoneRef.current = null
  }, [])

  // The deposit is credited either way; only the lock half can fail here, so
  // failures route to the dedicated callback (or onError as fallback) instead
  // of the flow's terminal error state.
  const submitPendingLockAfterCredit = useCallback(
    async (transactionId: string, userAddress: string, creditedAmount: bigint) => {
      const signedLock = loadPendingLock(userAddress, transactionId)
      if (!signedLock) {
        // Drop corrupted leftovers so they don't linger in storage.
        clearPendingLock(userAddress, transactionId)
        // Only the intent this hook created in this session is expected to
        // have a stored lock. Pending rows from other sessions or without a
        // lock configured credit silently, no spurious 'not-found'.
        if (!postDepositLock || transactionId !== activeIntentIdRef.current) return
        const error = new PostDepositLockError(
          'No persisted signed lock found for this on-ramp',
          'not-found'
        )
        emitDebug('lock:not-found', { transactionId })
        ;(onLockFailedRef.current ?? onErrorRef.current)?.(error)
        return
      }
      try {
        const result = await submitPendingLock({ client, payload: signedLock, creditedAmount })
        queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
        queryClient.invalidateQueries({ queryKey: ['accounting-locked-funds'] })
        queryClient.invalidateQueries({ queryKey: ['accounting-total-locked-balance'] })
        queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
        emitDebug('lock:submitted', {
          transactionId,
          amount: signedLock.amount,
          submissionId: result.submission_id,
        })
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
        emitDebug('lock:failed', {
          transactionId,
          reason: error.reason,
          message: error.message,
        })
        ;(onLockFailedRef.current ?? onErrorRef.current)?.(error)
      } finally {
        // One attempt per stored lock, but clear only after the attempt
        // settles so a tab close mid-submission leaves the payload for the
        // next session to retry. At-least-once edge: a tab death after the
        // API accepted but before it responded makes that retry re-submit a
        // consumed nonce, surfacing as a (fund-safe) spurious 'lock failed'.
        clearPendingLock(userAddress, transactionId)
      }
    },
    [client, emitDebug, postDepositLock, queryClient]
  )

  const { verify } = useDepositVerification({
    pollTimeout: verificationTimeout,
    pollInterval: options.verificationPollInterval,
    finalityRetryInterval,
    onCheckRetry: (message) => {
      const record = activeVerificationRecordRef.current
      if (!record) return
      emitDebug('verification:check-retry', {
        message,
        record: summariseOnRampRecord(record),
      })
      setFinalityProgress((prev) => ({ ...prev, [record.transaction_id]: message }))
    },
    onCredited: (depositTxHash, _response, creditedAmount) => {
      const record = activeVerificationRecordRef.current
      const verificationKey = record ? getOnRampVerificationKey(record) : null
      emitDebug('verification:credited', {
        depositTxHash,
        record: record ? summariseOnRampRecord(record) : null,
      })
      if (record && activeIntentIdRef.current === record.transaction_id) {
        setStatus('credited')
      }
      if (record) {
        setFinalityProgress((prev) => {
          if (!(record.transaction_id in prev)) return prev
          const next = { ...prev }
          delete next[record.transaction_id]
          return next
        })
        // Prefer the address that signed the lock: the wallet may have
        // disconnected or switched accounts during the minutes-long delivery
        // window, and the stored payload is keyed by the signer.
        const lockOwner = lockOwnerRef.current ?? privateReadAddress
        if (lockOwner) {
          void submitPendingLockAfterCredit(record.transaction_id, lockOwner, creditedAmount)
        } else if (postDepositLock) {
          emitDebug('lock:owner-unavailable', { transactionId: record.transaction_id })
          ;(onLockFailedRef.current ?? onErrorRef.current)?.(
            new PostDepositLockError(
              'No wallet address available to look up the signed lock for this on-ramp',
              'not-found'
            )
          )
        }
      }
      void (async () => {
        try {
          if (record && depositTxHash.startsWith('0x')) {
            emitDebug('onramp:mark-deposit-triggered-request', {
              transactionId: record.transaction_id,
              depositTxHash,
            })
            const updated = await executePrivateRead((readClient) =>
              readClient.updateOnRamp(record.transaction_id, {
                deposit_tx_hash: depositTxHash as HexString,
              })
            )
            emitDebug('onramp:mark-deposit-triggered-success', {
              record: summariseOnRampRecord(updated),
            })
          }
        } catch (err) {
          emitDebug('onramp:mark-deposit-triggered-error', errorPayload(err))
          console.warn('Failed to mark on-ramp row complete:', err)
        } finally {
          await refreshPending()
          clearActiveVerification(verificationKey)
          if (record && activeIntentIdRef.current === record.transaction_id) {
            activeIntentIdRef.current = null
            setActiveIntentId(null)
          }
        }
      })()
      onCreditedRef.current?.(depositTxHash)
    },
    onCheckTimeout: (depositTxHash) => {
      const record = activeVerificationRecordRef.current
      const err = new Error(
        'Privana verification is still pending. Retry from the pending on-ramp list if it does not complete.'
      )
      emitDebug('verification:timeout', { depositTxHash, message: err.message })
      clearActiveVerification()
      if (!record || activeIntentIdRef.current === record.transaction_id) {
        setStatus('failed')
        setError(err)
      }
      void refreshPending()
      onErrorRef.current?.(err)
    },
    onError: (err) => {
      const record = activeVerificationRecordRef.current
      emitDebug('verification:error', errorPayload(err))
      clearActiveVerification()
      if (!record || activeIntentIdRef.current === record.transaction_id) {
        setStatus('failed')
        setError(err)
      }
      onErrorRef.current?.(err)
    },
  })

  const prepareOnRampIntent = useCallback(
    async ({
      currencyCode,
      baseCurrencyCode,
      baseCurrencyAmount,
      quoteCurrencyAmount,
    }: {
      currencyCode: string
      baseCurrencyCode?: string
      baseCurrencyAmount?: string
      quoteCurrencyAmount?: string
    }) => {
      try {
        setError(null)
        purchaseInitiatedRef.current = false
        const token = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
        if (!token) throw new Error(`Unknown token: ${tokenId}`)
        if (!depositAddress) throw new Error('Privana deposit address is not ready')
        let lockAmount: bigint | undefined
        let lockOwner: Address | undefined
        if (postDepositLock) {
          // Fail before the intent exists: a purchase without a submittable
          // signed lock would defeat the deposit-and-lock guarantee.
          if (!address || !walletClient) throw new Error('Wallet not connected')
          lockOwner = requireDepositLockOwner(address, privateReadAddress)
          if (!quoteCurrencyAmount) {
            throw new Error(
              'postDepositLock requires quoteCurrencyAmount to derive the lock amount'
            )
          }
          if (!canUseBrowserStorage()) {
            throw new Error('Browser storage is required for locked on-ramp recovery')
          }
          // Sign for the buffered quote: MoonPay targets the quote amount on
          // card rails, while slower rails may drift within the buffer, and
          // actual on-chain delivery is verified before the lock submits. Any
          // difference stays in the user's available balance. parseUnits and
          // the buffer validation throw here, before the intent exists.
          const buffered = applyLockBuffer(
            parseUnits(quoteCurrencyAmount, token.decimals),
            postDepositLock.buffer
          )
          lockAmount = clampLockAmount(buffered, postDepositLock.maxAmount)
          if (lockAmount <= 0n) {
            throw new Error(`Post-deposit lock amount must be positive, got ${lockAmount}`)
          }
          // The Lock domain lives on the Accounting chain and wallets reject
          // typed data whose domain chainId differs from the active chain, so
          // switch there while a failure still precedes the intent.
          await ensureCorrectChain(networkConfig.chainId)
        }

        emitDebug('intent:create-request', {
          tokenId,
          chainId: token.chainId,
          currencyCode,
          baseCurrencyCode: baseCurrencyCode ?? null,
          baseCurrencyAmount: baseCurrencyAmount ?? null,
          quoteCurrencyAmount: quoteCurrencyAmount ?? null,
          depositAddress,
        })
        const record = await executePrivateRead((readClient) =>
          readClient.createOnRampIntent({
            wallet_address: depositAddress,
            token_id: tokenId,
            chain_id: token.chainId,
            moonpay_currency_code: currencyCode,
            base_currency_code: baseCurrencyCode,
            base_currency_amount: baseCurrencyAmount,
          })
        )
        if (postDepositLock && lockOwner && lockAmount !== undefined) {
          // Re-fetch the wallet client bound to the signing chain: the
          // render-time client can go stale across the chain switch above and
          // wagmi then rejects the signature with a chain mismatch.
          const signingWalletClient = await getWalletClient(wagmiConfig, {
            chainId: networkConfig.chainId,
          })
          const signedLock = await createSignedLockRequest({
            client,
            walletClient: signingWalletClient,
            userAddress: lockOwner,
            networkConfig,
            serviceAddress: requireServiceAddress(postDepositLock.serviceAddress ?? serviceAddress),
            tokenId,
            amount: lockAmount,
            lockDuration: postDepositLock.lockDuration,
          })
          if (privateReadAddressRef.current?.toLowerCase() !== lockOwner.toLowerCase()) {
            throw new Error('Authenticated deposit account changed while signing')
          }
          savePendingLock(lockOwner, record.transaction_id, signedLock)
          lockOwnerRef.current = lockOwner
          emitDebug('intent:lock-signed', {
            transactionId: record.transaction_id,
            amount: signedLock.amount,
            expiry: signedLock.expiry,
          })
        }
        activeIntentIdRef.current = record.transaction_id
        setActiveIntentId(record.transaction_id)
        emitDebug('intent:create-success', {
          record: summariseOnRampRecord(record),
        })
        return record
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to create on-ramp intent')
        setStatus('failed')
        setError(e)
        emitDebug('intent:create-error', errorPayload(e))
        onErrorRef.current?.(e)
        throw e
      }
    },
    [
      address,
      client,
      depositAddress,
      emitDebug,
      enabledTokens,
      ensureCorrectChain,
      executePrivateRead,
      networkConfig,
      postDepositLock,
      privateReadAddress,
      serviceAddress,
      tokenId,
      wagmiConfig,
      walletClient,
    ]
  )

  // Fire-and-forget: register Privana token_id + chain_id against the MoonPay
  // transaction the moment it's created. The webhook handler create-or-updates
  // so timing isn't gating — if this fails, the row still lands later via the
  // webhook and the user can still finish from the pending list.
  const registerOnRampTokenMapping = useCallback(
    async (moonpayTransactionId: string) => {
      const token = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
      if (!token) {
        emitDebug('register-token-mapping:skip', {
          moonpayTransactionId,
          reason: 'selected-token-not-found',
        })
        return
      }
      const transactionId = activeIntentIdRef.current ?? moonpayTransactionId
      try {
        emitDebug('register-token-mapping:request', {
          transactionId,
          moonpayTransactionId,
          tokenId,
          chainId: token.chainId,
        })
        const record = await executePrivateRead((readClient) =>
          readClient.updateOnRamp(transactionId, {
            token_id: tokenId,
            chain_id: token.chainId,
            moonpay_transaction_id:
              transactionId === moonpayTransactionId ? undefined : moonpayTransactionId,
          })
        )
        emitDebug('register-token-mapping:success', {
          transactionId,
          moonpayTransactionId,
          record: summariseOnRampRecord(record),
        })
      } catch (err) {
        emitDebug('register-token-mapping:error', {
          transactionId,
          moonpayTransactionId,
          ...errorPayload(err),
        })
        console.warn('Failed to register on-ramp token mapping:', err)
      }
    },
    [emitDebug, enabledTokens, executePrivateRead, tokenId]
  )

  const handleTransactionCreated = useCallback(
    async (props: OnTransactionCreatedProps) => {
      emitDebug('moonpay:onTransactionCreated', summariseMoonPayEventProps(props))
      purchaseInitiatedRef.current = true
      await registerOnRampTokenMapping(props.id)
    },
    [emitDebug, registerOnRampTokenMapping]
  )

  const signUrl = useCallback(
    async (url: string): Promise<string> => {
      setError(null)
      try {
        emitDebug('moonpay:onUrlSignatureRequested', summariseMoonPayUrl(url))
        const { signature } = await executePrivateRead((readClient) =>
          readClient.signOnRampUrl({ url })
        )
        setStatus('awaiting-purchase')
        emitDebug('sign-url:success', {
          signatureLength: signature.length,
        })
        return signature
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to sign on-ramp URL')
        setStatus('failed')
        setError(e)
        emitDebug('sign-url:error', errorPayload(e))
        onErrorRef.current?.(e)
        throw err
      }
    },
    [emitDebug, executePrivateRead]
  )

  // After MoonPay reports completion the on-chain tx hash isn't in the widget
  // event — it arrives via the MoonPay→backend webhook. Poll `/pending` until
  // the row for this Privana intent or MoonPay id has `on_chain_tx_hash`
  // populated, then proceed.
  const waitForOnChainHash = useCallback(
    async (transactionId: string): Promise<OnRampRecord | null> => {
      const startTime = Date.now()
      emitDebug('delivery-poll:start', {
        transactionId,
        deliveryTimeout,
        deliveryPollInterval,
      })
      while (Date.now() - startTime < deliveryTimeout) {
        try {
          const { pending: rows } = await executePrivateRead((readClient) =>
            readClient.getPendingOnRamps()
          )
          setPending(rows)
          const record = rows.find((r) => matchesOnRampTransaction(r, transactionId))
          emitDebug('delivery-poll:tick', {
            transactionId,
            count: rows.length,
            matchingRecord: record ? summariseOnRampRecord(record) : null,
          })
          if (record?.on_chain_tx_hash && record.quote_currency_amount) {
            emitDebug('delivery-poll:success', {
              transactionId,
              record: summariseOnRampRecord(record),
            })
            return record
          }
        } catch (err) {
          emitDebug('delivery-poll:error', {
            transactionId,
            ...errorPayload(err),
          })
          console.warn('Polling pending on-ramps failed:', err)
        }
        await new Promise((r) => setTimeout(r, deliveryPollInterval))
      }
      emitDebug('delivery-poll:timeout', { transactionId })
      return null
    },
    [deliveryPollInterval, deliveryTimeout, emitDebug, executePrivateRead]
  )

  const triggerVerification = useCallback(
    async (record: OnRampRecord) => {
      const verificationKey = getOnRampVerificationKey(record)
      if (triggeredVerificationKeysRef.current.has(verificationKey)) {
        emitDebug('verification:skip-duplicate', {
          verificationKey,
          record: summariseOnRampRecord(record),
        })
        return
      }
      // Starting this verification cancels any in-flight one (verify() stops
      // its polling): un-mark the superseded row so a later pass retries it,
      // and unblock its waiter.
      const supersededKey = activeVerificationKeyRef.current
      if (supersededKey && supersededKey !== verificationKey) {
        triggeredVerificationKeysRef.current.delete(supersededKey)
      }
      activeVerificationDoneRef.current?.()
      activeVerificationDoneRef.current = null
      triggeredVerificationKeysRef.current.add(verificationKey)
      activeVerificationKeyRef.current = verificationKey
      activeVerificationRecordRef.current = record
      setActiveVerificationId(record.transaction_id)
      setFinalityProgress((prev) => {
        if (!(record.transaction_id in prev)) return prev
        const next = { ...prev }
        delete next[record.transaction_id]
        return next
      })

      emitDebug('verification:start', {
        verificationKey,
        record: summariseOnRampRecord(record),
      })
      try {
        if (!record.on_chain_tx_hash || !record.quote_currency_amount) {
          throw new Error('On-ramp record missing on-chain tx hash or delivered amount')
        }
        if (record.chain_id === undefined || !record.wallet_address) {
          throw new Error('On-ramp record missing chain id or wallet address')
        }
        // Source the token from the record, not the hook's tokenId. They match
        // for the active flow but diverge when finishing a pending row for a
        // different token than the one currently selected.
        const recordTokenId = record.token_id
        if (!recordTokenId) {
          throw new Error('On-ramp record missing token id')
        }
        const token = enabledTokens.find((t) => t.id.toLowerCase() === recordTokenId.toLowerCase())
        if (!token) throw new Error(`Unknown token: ${recordTokenId}`)
        if (token.chainId !== record.chain_id) {
          throw new Error(
            `Token ${recordTokenId} is on chain ${token.chainId} but record is on chain ${record.chain_id}`
          )
        }

        const amount = await resolveDeliveredAmount({
          onChainTxHash: record.on_chain_tx_hash,
          chainId: record.chain_id,
          walletAddress: record.wallet_address,
          token,
          fallbackAmount: record.quote_currency_amount,
          wagmiConfig,
          emitDebug,
        })

        // Post-completion safety net: if MoonPay's fees ate more than expected,
        // the delivered amount might fall below Privana's minimum. Surface a
        // clean error rather than letting checkDeposit reject server-side.
        // (MoonPay's own minimum is usually higher than ours, so this is rare.)
        if (minDepositBaseUnits !== undefined && amount < minDepositBaseUnits) {
          emitDebug('verification:below-minimum', {
            quoteCurrencyAmount: record.quote_currency_amount,
            minDepositBaseUnits: String(minDepositBaseUnits),
          })
          throw new Error(
            `Delivered amount (${record.quote_currency_amount}) is below the minimum deposit.`
          )
        }

        if (activeIntentIdRef.current === record.transaction_id) {
          setStatus('verifying')
        }
        emitDebug('verification:check-deposit-request', {
          hash: record.on_chain_tx_hash,
          chainId: record.chain_id,
          amount: amount.toString(),
        })
        await verify({
          hash: record.on_chain_tx_hash,
          chainId: record.chain_id,
          amount,
        })
      } catch (err) {
        triggeredVerificationKeysRef.current.delete(verificationKey)
        if (activeVerificationKeyRef.current === verificationKey) {
          activeVerificationKeyRef.current = null
          activeVerificationRecordRef.current = null
          setActiveVerificationId(null)
        }
        throw err
      }
    },
    [emitDebug, enabledTokens, minDepositBaseUnits, verify, wagmiConfig]
  )

  const handleTransactionCompleted = useCallback(
    async (props: OnTransactionCompletedProps) => {
      emitDebug('moonpay:onTransactionCompleted', summariseMoonPayEventProps(props))
      try {
        setStatus('awaiting-delivery')
        await registerOnRampTokenMapping(props.id)
        const transactionId = activeIntentIdRef.current ?? props.id
        const record = await waitForOnChainHash(transactionId)
        if (!record) {
          // Backend hasn't received MoonPay's webhook within the timeout. The
          // purchase is real and recovery is available via `pending` - surface
          // a non-terminal error so the form can prompt the user to retry from
          // the pending list once the webhook lands.
          const err = new Error(
            'Backend has not yet confirmed delivery. You can finish from the pending list.'
          )
          emitDebug('moonpay:completed-without-backend-row', {
            transactionId,
            moonpayTransactionId: props.id,
            message: err.message,
          })
          setStatus('failed')
          setError(err)
          onErrorRef.current?.(err)
          return
        }
        await triggerVerification(record)
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Verification failed')
        emitDebug('moonpay:onTransactionCompleted-error', errorPayload(e))
        setStatus('failed')
        setError(e)
        onErrorRef.current?.(e)
      }
    },
    [emitDebug, registerOnRampTokenMapping, triggerVerification, waitForOnChainHash]
  )

  const handleWidgetClosed = useCallback(async () => {
    if (closeReconcilePromiseRef.current) return closeReconcilePromiseRef.current

    closeReconcilePromiseRef.current = (async () => {
      const previousStatus = statusRef.current
      const transactionId = activeIntentIdRef.current
      emitDebug('moonpay:widget-closed-reconcile', {
        previousStatus,
        transactionId,
      })

      if (!transactionId) {
        await refreshPending()
        return
      }

      if (!purchaseInitiatedRef.current) {
        emitDebug('moonpay:widget-closed-without-purchase', {
          previousStatus,
          transactionId,
        })
        if (address) clearPendingLock(address, transactionId)
        await refreshPending()
        if (previousStatus === 'awaiting-purchase' || previousStatus === 'awaiting-delivery') {
          setStatus('idle')
        }
        return
      }

      try {
        setStatus('awaiting-delivery')
        const record = await waitForOnChainHash(transactionId)
        if (record) {
          await triggerVerification(record)
          return
        }
        await refreshPending()
        if (previousStatus === 'awaiting-purchase' || previousStatus === 'awaiting-delivery') {
          setStatus('idle')
        }
      } catch (err) {
        const e = err instanceof Error ? err : new Error('On-ramp reconciliation failed')
        emitDebug('moonpay:widget-closed-reconcile-error', errorPayload(e))
        setStatus('failed')
        setError(e)
        onErrorRef.current?.(e)
      }
    })()

    try {
      await closeReconcilePromiseRef.current
    } finally {
      closeReconcilePromiseRef.current = null
    }
  }, [address, emitDebug, refreshPending, triggerVerification, waitForOnChainHash])

  const finishPendingVerification = useCallback(
    async (record: OnRampRecord) => {
      try {
        emitDebug('pending:finish-verification', {
          record: summariseOnRampRecord(record),
        })
        await triggerVerification(record)
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Verification failed')
        emitDebug('pending:finish-verification-error', errorPayload(e))
        setStatus('failed')
        setError(e)
        onErrorRef.current?.(e)
        throw e
      }
    },
    [emitDebug, triggerVerification]
  )

  const triggerVerificationRef = useRef(triggerVerification)
  useEffect(() => {
    triggerVerificationRef.current = triggerVerification
  }, [triggerVerification])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      for (const record of pending) {
        if (cancelled) break
        if (!record.on_chain_tx_hash || !record.quote_currency_amount) continue
        const key = getOnRampVerificationKey(record)
        if (triggeredVerificationKeysRef.current.has(key)) continue
        try {
          await triggerVerificationRef.current(record)
        } catch {
          // Error is surfaced via finalityProgress / global error; loop on.
          continue
        }
        // verify() resolves once status polling is scheduled, and starting
        // the next row would cancel this row's polling — leaving it marked
        // triggered but never completed. Wait for the terminal state
        // (credited / timeout / error / superseded) before moving on.
        if (activeVerificationKeyRef.current === key) {
          await new Promise<void>((resolve) => {
            activeVerificationDoneRef.current = resolve
          })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pending])

  return {
    status,
    activeIntentId,
    pending,
    activeVerificationId,
    error,
    finalityProgress,
    depositAddress,
    minDepositBaseUnits,
    selectedToken,
    prepareOnRampIntent,
    signUrl,
    handleTransactionCreated,
    handleTransactionCompleted,
    finishPendingVerification,
    handleWidgetClosed,
    refreshPending,
  }
}

function summariseToken(token: {
  id: string
  chainId: number
  symbol?: string
  decimals?: number
}) {
  return {
    tokenId: token.id,
    chainId: token.chainId,
    symbol: token.symbol ?? null,
    decimals: token.decimals ?? null,
  }
}

function summariseOnRampRecord(record: OnRampRecord): Record<string, unknown> {
  return {
    transaction_id: record.transaction_id,
    external_transaction_id: record.external_transaction_id ?? null,
    moonpay_transaction_id: record.moonpay_transaction_id ?? null,
    status: record.status,
    wallet_address: record.wallet_address,
    token_id: record.token_id,
    chain_id: record.chain_id,
    moonpay_currency_code: record.moonpay_currency_code ?? null,
    quote_currency_amount: record.quote_currency_amount ?? null,
    on_chain_tx_hash: record.on_chain_tx_hash ?? null,
    deposit_tx_hash: record.deposit_tx_hash ?? null,
    deposit_triggered_at: record.deposit_triggered_at ?? null,
    credited_at: record.credited_at ?? null,
  }
}

async function resolveDeliveredAmount({
  onChainTxHash,
  chainId,
  walletAddress,
  token,
  fallbackAmount,
  wagmiConfig,
  emitDebug,
}: {
  onChainTxHash: HexString
  chainId: number
  walletAddress: HexString
  token: TokenConfig
  fallbackAmount: string
  wagmiConfig: ReturnType<typeof useConfig>
  emitDebug: (event: string, payload?: Record<string, unknown>) => void
}): Promise<bigint> {
  if (token.contract === zeroAddress) {
    return parseUnits(fallbackAmount, token.decimals)
  }

  let receiptError: unknown
  try {
    const receipt = await waitForTransactionReceipt(wagmiConfig, {
      hash: onChainTxHash as `0x${string}`,
      chainId,
      timeout: 60_000,
      pollingInterval: 4_000,
    })

    let delivered = 0n
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== token.contract.toLowerCase()) continue

      try {
        const decoded = decodeEventLog({
          abi: [ERC20_TRANSFER_EVENT],
          data: log.data,
          topics: log.topics,
        })
        if (decoded.eventName !== 'Transfer') continue

        const to = decoded.args.to.toLowerCase()
        if (to !== walletAddress.toLowerCase()) continue

        delivered += decoded.args.value
      } catch {
        // Not an ERC-20 Transfer log for this token.
      }
    }

    if (delivered > 0n) {
      emitDebug('verification:amount-from-receipt', {
        amount: delivered.toString(),
        tokenAddress: token.contract,
        walletAddress,
        moonpayQuoteCurrencyAmount: fallbackAmount,
      })
      return delivered
    }

    emitDebug('verification:amount-from-receipt-missing', {
      tokenAddress: token.contract,
      walletAddress,
      moonpayQuoteCurrencyAmount: fallbackAmount,
    })
  } catch (err) {
    emitDebug('verification:amount-from-receipt-error', errorPayload(err))
    receiptError = err
  }

  const errorDetail =
    receiptError instanceof Error
      ? receiptError.message
      : receiptError === undefined
        ? `no ${token.symbol} Transfer to ${walletAddress} found`
        : String(receiptError)
  throw new Error(
    `Unable to derive delivered ${token.symbol} amount from ${onChainTxHash}: ${errorDetail}`
  )
}

function matchesOnRampTransaction(record: OnRampRecord, transactionId: string): boolean {
  return (
    record.transaction_id === transactionId ||
    record.external_transaction_id === transactionId ||
    record.moonpay_transaction_id === transactionId
  )
}

function getOnRampVerificationKey(record: OnRampRecord): string {
  return record.on_chain_tx_hash ?? record.transaction_id
}

function summariseMoonPayEventProps(props: Record<string, unknown>): Record<string, unknown> {
  return {
    id: props.id,
    externalTransactionId: props.externalTransactionId,
    status: props.status,
    walletAddress: props.walletAddress,
    walletAddressTag: props.walletAddressTag,
    baseCurrencyAmount: props.baseCurrencyAmount,
    quoteCurrencyAmount: props.quoteCurrencyAmount,
    baseCurrency: props.baseCurrency,
    quoteCurrency: props.quoteCurrency,
    createdAt: props.createdAt,
  }
}

function summariseMoonPayUrl(url: string): Record<string, unknown> {
  try {
    const parsed = new URL(url)
    const params = parsed.searchParams
    return {
      origin: parsed.origin,
      pathname: parsed.pathname,
      apiKeyPrefix: params.get('apiKey')?.slice(0, 8) ?? null,
      currencyCode: params.get('currencyCode'),
      baseCurrencyCode: params.get('baseCurrencyCode'),
      baseCurrencyAmount: params.get('baseCurrencyAmount'),
      walletAddress: params.get('walletAddress'),
      externalCustomerId: params.get('externalCustomerId'),
      externalTransactionId: params.get('externalTransactionId'),
      redirectURL: params.get('redirectURL'),
      signaturePresent: params.has('signature'),
    }
  } catch {
    return { parseError: true, length: url.length }
  }
}

function errorPayload(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return {
      name: err.name,
      message: err.message,
      stack: err.stack?.split('\n').slice(0, 4).join('\n'),
    }
  }
  return { message: String(err) }
}
