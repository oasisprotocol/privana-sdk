'use client'

// Shared provider-neutral purchase, recovery, verification, credit, and lock flow.

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { parseUnits } from 'viem'
import { getWalletClient, waitForTransactionReceipt } from '@wagmi/core'
import { useAccount, useConfig, useWalletClient } from 'wagmi'

import { usePrivanaContext } from '../context/privana-provider'
import {
  assertCreatedOnRampIntent,
  assertOnRampRecordProvider,
  getOnRampVerificationKey,
  matchesOnRampTransaction,
  recordOnRampProviderDeposit,
  resolveOnRampProviderEventTarget,
  verifyPendingOnRampsSequentially,
  type OnRampProviderAdapter,
  type OnRampProviderEvent,
  type OnRampProviderEventTarget,
} from '../on-ramp/provider'
import {
  createPendingOnRampReadCoordinator,
  discardInvalidOnRampIntent,
  finalizeCreditedOnRampIntent,
  filterCreditedOnRampRecords,
  getOnRampCloseRecoveryAction,
  getPendingOnRampsWithRecovery,
  loadCreditedOnRampVerifications,
  loadUnresolvedOnRampIntents,
  MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS,
  rememberUnresolvedOnRampIntent,
  type OnRampRecoveryScope,
} from '../on-ramp/recovery'
import {
  assertErc20OnRampToken,
  erc20MinDepositBaseUnits,
  resolveErc20OnRampTransfer,
  type OnRampDeliveredTransfer,
} from '../on-ramp/receipt'
import { settlePendingOnRampLock } from '../on-ramp/settlement'
import {
  applyLockBuffer,
  clampLockAmount,
  createSignedLockRequest,
  requireDepositLockOwner,
  requireServiceAddress,
  savePendingLock,
  PostDepositLockError,
  type OnRampPostDepositLockConfig,
} from '../utils/pending-lock'
import { canUseBrowserStorage } from '../utils/browser-storage'
import { useDepositVerification } from './use-deposit-verification'
import { useEnsureCorrectChain } from './use-ensure-correct-chain'
import { usePrivateReadRequest } from './use-private-read-request'
import type {
  Address,
  Bytes32,
  HexString,
  MinDepositAmounts,
  OnRampRecord,
  TokenConfig,
  TransactionSubmissionResponse,
} from '../types'

const DEFAULT_DELIVERY_TIMEOUT_MS = 120_000
const DEFAULT_VERIFICATION_TIMEOUT_MS = 10 * 60_000
const DEFAULT_FINALITY_RETRY_INTERVAL_MS = 15_000

export function bindOnRampFlowSession(
  ref: { current: symbol | null },
  flowSession: symbol
): () => void {
  ref.current = flowSession
  return () => {
    if (ref.current === flowSession) ref.current = null
  }
}

export type OnRampFlowStatus =
  | 'idle'
  /** Provider launch succeeded; the user is completing the purchase. */
  | 'awaiting-purchase'
  /** Provider reported completion; polling recovery until the on-chain transfer appears. */
  | 'awaiting-delivery'
  /** checkDeposit fired; polling getDepositStatus until credited. */
  | 'verifying'
  | 'credited'
  | 'failed'

export interface OnRampDebugEvent {
  at: string
  event: string
  status: OnRampFlowStatus
  tokenId: Bytes32
  payload?: Record<string, unknown>
}

export interface UseOnRampOptions {
  /** Deployment-selected provider behavior. */
  adapter: OnRampProviderAdapter
  /** Privana token the on-ramp will deposit into. */
  tokenId: Bytes32
  /**
   * Pre-sign a `Lock` for the buffered quote amount when the intent is
   * created; the SDK submits it once the delivered deposit credits. Requires
   * `prepareOnRampIntent` to be called with `quoteCurrencyAmount`.
   */
  postDepositLock?: OnRampPostDepositLockConfig
  /** Fired when the deposit is credited inside the Privana accounting module. */
  onCredited?: (txHash: string, record: OnRampRecord) => void
  /** Fired when the pre-signed post-deposit lock is accepted by the API. */
  onLockSubmitted?: (response: TransactionSubmissionResponse, record: OnRampRecord) => void
  /**
   * Fired when the deposit credited but the pre-signed lock could not be
   * submitted. The funds sit in the user's available balance. Fresh signing
   * is safe only for failures known to precede any API attempt; otherwise
   * retry or reconcile the same signature. Falls back to `onError`.
   */
  onLockFailed?: (error: PostDepositLockError, record: OnRampRecord) => void
  onError?: (error: Error) => void
  /** Optional diagnostic event stream for previews/tests. No auth tokens or signatures are emitted. */
  onDebugEvent?: (event: OnRampDebugEvent) => void
  /**
   * Max time in ms to wait for the backend to surface the on-chain tx hash
   * after the provider reports completion or its widget closes
   * (default: 120000 = 2 minutes).
   * If exceeded, the row stays in `pending` for the user to finish later.
   */
  deliveryTimeout?: number
  /**
   * Polling interval in ms while waiting for the on-chain tx hash. Values below
   * the rate-safe 10000 ms minimum are clamped.
   */
  deliveryPollInterval?: number
  /** Max time in ms for Privana deposit verification after the on-chain tx hash appears. */
  verificationTimeout?: number
  /** Retry interval in ms while the source-chain tx waits for finality (default: 15000). */
  finalityRetryInterval?: number
  /** Polling interval in ms while waiting for Privana deposit credit. */
  verificationPollInterval?: number
}

export interface UseOnRampResult {
  status: OnRampFlowStatus
  /** Active signed Privana intent id passed to the configured provider. */
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
  /** Create the backend intent that the configured provider will echo. */
  prepareOnRampIntent: (request: {
    providerAssetCode: string
    baseCurrencyCode?: string
    baseCurrencyAmount?: string
    /**
     * Exact crypto amount (human units) the purchase targets — the same value
     * passed to the widget as `quoteCurrencyAmount`. Required when
     * `postDepositLock` is set: the signed lock amount derives from it.
     */
    quoteCurrencyAmount?: string
  }) => Promise<OnRampRecord>
  /** Mark a provider launch as ready for user interaction. */
  handleProviderLaunchReady: () => void
  /** Surface a provider-specific launch failure through the shared flow. */
  handleProviderLaunchFailed: (error: Error) => void
  /** Handle a normalized provider transaction event. */
  handleProviderEvent: (event: OnRampProviderEvent) => Promise<void>
  /** Trigger Privana verification for a row returned by `pending`. */
  finishPendingVerification: (record: OnRampRecord) => Promise<void>
  /** Reconcile local state after the provider UI closes. */
  handleProviderClosed: () => Promise<void>
  refreshPending: () => Promise<void>
}

/**
 * Provider-neutral purchase recovery and Privana credit flow.
 *
 * The provider delivers to the server-derived Privana deposit address. Provider
 * reads and UI events only discover a candidate transaction. One unambiguous
 * matching receipt log supplies the amount and exact log index;
 * `/deposits/check` remains the sole credit authority. Pending intents are
 * retained locally only as bounded recovery hints, never as order or credit
 * state.
 */
export function useOnRamp(options: UseOnRampOptions): UseOnRampResult {
  const {
    adapter,
    tokenId,
    postDepositLock,
    onCredited,
    onLockSubmitted,
    onLockFailed,
    onError,
    onDebugEvent,
  } = options
  const deliveryTimeout = options.deliveryTimeout ?? DEFAULT_DELIVERY_TIMEOUT_MS
  const requestedDeliveryPollInterval =
    options.deliveryPollInterval ?? MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS
  const deliveryPollInterval = Number.isFinite(requestedDeliveryPollInterval)
    ? Math.max(requestedDeliveryPollInterval, MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS)
    : MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS
  const verificationTimeout = options.verificationTimeout ?? DEFAULT_VERIFICATION_TIMEOUT_MS
  const finalityRetryInterval = options.finalityRetryInterval ?? DEFAULT_FINALITY_RETRY_INTERVAL_MS

  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { client, enabledTokens, networkConfig, serviceAddress } = usePrivanaContext()
  const { executePrivateRead, privateReadAddress, privateReadReady } = usePrivateReadRequest()
  const executeOnRampPrivateRead = executePrivateRead
  const privateReadAddressRef = useRef(privateReadAddress)
  privateReadAddressRef.current = privateReadAddress
  const { ensureCorrectChain } = useEnsureCorrectChain()
  const wagmiConfig = useConfig()
  const queryClient = useQueryClient()

  const selectedToken = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
  const recoveryScope = useMemo<OnRampRecoveryScope | null>(
    () =>
      privateReadAddress
        ? {
            apiUrl: networkConfig.apiUrl,
            chainId: networkConfig.chainId,
            userAddress: privateReadAddress,
          }
        : null,
    [networkConfig.apiUrl, networkConfig.chainId, privateReadAddress]
  )
  const recoveryScopeRef = useRef(recoveryScope)
  recoveryScopeRef.current = recoveryScope
  const flowIdentity = `${networkConfig.apiUrl}\u0000${networkConfig.chainId}\u0000${privateReadAddress ?? ''}\u0000${privateReadReady}\u0000${tokenId}\u0000${adapter.provider}`
  // A unique render-session token prevents async work from an earlier
  // user/API/chain/token scope from mutating the current flow, including A→B→A.
  const flowSession = useMemo(() => Symbol(flowIdentity), [flowIdentity])
  const flowSessionRef = useRef<symbol | null>(flowSession)
  flowSessionRef.current = flowSession
  useEffect(() => bindOnRampFlowSession(flowSessionRef, flowSession), [flowSession])

  const [status, setStatus] = useState<OnRampFlowStatus>('idle')
  const [pending, setPending] = useState<OnRampRecord[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [depositAddress, setDepositAddress] = useState<`0x${string}` | undefined>()
  // Recovery is not token-scoped, so retain the backend minima for every chain.
  const [minDepositByChain, setMinDepositByChain] = useState<
    Record<string, MinDepositAmounts> | undefined
  >()
  const [activeIntentId, setActiveIntentId] = useState<string | null>(null)
  const [activeVerificationId, setActiveVerificationId] = useState<string | null>(null)
  const [finalityProgress, setFinalityProgress] = useState<Record<string, string>>({})

  const onCreditedRef = useRef(onCredited)
  const onLockSubmittedRef = useRef(onLockSubmitted)
  const onLockFailedRef = useRef(onLockFailed)
  const onErrorRef = useRef(onError)
  const onDebugEventRef = useRef(onDebugEvent)
  const statusRef = useRef(status)
  const depositAddressSessionRef = useRef<symbol | null>(null)
  const activeIntentIdRef = useRef<string | null>(null)
  const activeIntentSessionRef = useRef<symbol | null>(null)
  const activeVerificationRecordRef = useRef<OnRampRecord | null>(null)
  const activeVerificationKeyRef = useRef<string | null>(null)
  const activeVerificationSurfacesFailureRef = useRef(false)
  /** Address that signed the pending lock. Storage is keyed by it, and the
   * wallet may be disconnected or on another account by credit time. */
  const lockOwnerRef = useRef<Address | null>(null)
  const triggeredVerificationKeysRef = useRef<Set<string>>(new Set())
  const creditedVerificationKeysRef = useRef<Set<string>>(new Set())
  /** Resolves when the in-flight verification reaches a terminal state; the
   * auto-verify loop awaits it so rows verify one at a time. */
  const activeVerificationDoneRef = useRef<(() => void) | null>(null)
  const closeReconcilePromiseRef = useRef<{
    flowSession: symbol
    promise: Promise<void>
  } | null>(null)
  const deliveryWaitPromiseRef = useRef<{
    flowSession: symbol
    transactionId: string
    promise: Promise<OnRampRecord | null>
  } | null>(null)
  const purchaseInitiatedRef = useRef(false)
  const scopedDepositAddress =
    depositAddressSessionRef.current === flowSession ? depositAddress : undefined
  const scopedMinDepositByChain =
    depositAddressSessionRef.current === flowSession ? minDepositByChain : undefined
  const scopedMinDepositBaseUnits = selectedToken
    ? erc20MinDepositBaseUnits(scopedMinDepositByChain, selectedToken.chainId)
    : undefined
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

  // The provider must deliver directly to Privana, never to the connected wallet.
  useEffect(() => {
    depositAddressSessionRef.current = null
    if (!privateReadReady) {
      emitDebug('deposit-address:skip', { reason: 'private-read-not-ready' })
      setDepositAddress(undefined)
      setMinDepositByChain(undefined)
      return
    }

    // Never leave the previous authenticated user's address actionable while
    // the scoped replacement request is in flight.
    setDepositAddress(undefined)
    setMinDepositByChain(undefined)
    let cancelled = false
    void (async () => {
      try {
        emitDebug('deposit-address:request')
        const resp = await executeOnRampPrivateRead((readClient) => readClient.getDepositAddress())
        if (cancelled || flowSessionRef.current !== flowSession) return
        depositAddressSessionRef.current = flowSession
        setDepositAddress(resp.deposit_address)
        setMinDepositByChain(resp.min_deposit)
        const token = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
        const mins = token ? resp.min_deposit?.[String(token.chainId)] : undefined
        emitDebug('deposit-address:success', {
          depositAddressReady: true,
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
  }, [emitDebug, enabledTokens, executeOnRampPrivateRead, flowSession, privateReadReady, tokenId])

  const fetchPendingRows = useCallback(async (): Promise<OnRampRecord[]> => {
    const intents = recoveryScope ? loadUnresolvedOnRampIntents(recoveryScope) : []
    const intentIds = intents.map((intent) => intent.transactionId)
    if (activeIntentIdRef.current && activeIntentSessionRef.current === flowSession) {
      intentIds.push(activeIntentIdRef.current)
    }
    const { pending: rows } = await executeOnRampPrivateRead((readClient) =>
      getPendingOnRampsWithRecovery({
        client: readClient,
        intentIds,
        onInvalidIntent: (intentId) => {
          // A request that crossed an auth/scope transition must not discard
          // the old user's durable recovery state based on the new session.
          if (!recoveryScope || flowSessionRef.current !== flowSession) return
          const disposition = discardInvalidOnRampIntent(
            recoveryScope,
            intentId,
            activeIntentIdRef.current
          )
          if (disposition.invalidatedActiveIntent) {
            activeIntentIdRef.current = null
            activeIntentSessionRef.current = null
            setActiveIntentId(null)
            purchaseInitiatedRef.current = false
            lockOwnerRef.current = null
            if (statusRef.current !== 'verifying' && statusRef.current !== 'credited') {
              statusRef.current = 'idle'
              setStatus('idle')
              setError(null)
            }
          }
          emitDebug('pending:discard-invalid-intent', {
            invalidatedActiveIntent: disposition.invalidatedActiveIntent,
          })
        },
      })
    )
    // Exact signed intents deliberately recover orders from a previous
    // provider after a deployment switch or rollback. The core verification
    // path is provider-neutral; only newly created intents and adapter events
    // must match the configured adapter.
    const creditedKeys = recoveryScope
      ? loadCreditedOnRampVerifications(recoveryScope).map(
          (verification) => verification.verificationKey
        )
      : []
    return filterCreditedOnRampRecords(rows, [
      ...creditedKeys,
      ...creditedVerificationKeysRef.current,
    ])
  }, [emitDebug, executeOnRampPrivateRead, flowSession, recoveryScope])

  // All callers (mount refresh, embedded recovery, close/event delivery waits,
  // and manual refresh) share this one rate-safe request owner.
  const readPendingRows = useMemo(
    () =>
      createPendingOnRampReadCoordinator({
        read: fetchPendingRows,
        intervalMs: deliveryPollInterval,
      }),
    [deliveryPollInterval, fetchPendingRows]
  )

  const refreshPending = useCallback(async () => {
    if (flowSessionRef.current !== flowSession) return
    if (!privateReadReady) {
      emitDebug('pending:skip', { reason: 'private-read-not-ready' })
      setPending([])
      return
    }

    try {
      emitDebug('pending:request')
      const rows = await readPendingRows()
      if (flowSessionRef.current !== flowSession) return
      setPending(rows)
      emitDebug('pending:success', {
        count: rows.length,
        rows: rows.map(summariseOnRampRecord),
      })
    } catch (err) {
      if (flowSessionRef.current !== flowSession) return
      emitDebug('pending:error', errorPayload(err))
      console.warn('Failed to load pending on-ramps:', err)
    }
  }, [emitDebug, flowSession, privateReadReady, readPendingRows])

  // `expectedKey` guards late clears (e.g. after the awaited work in
  // onCredited): if another record's verification started in the meantime,
  // its refs must survive, so a mismatched clear is a no-op.
  const clearActiveVerification = useCallback((expectedKey?: string | null) => {
    const key = activeVerificationKeyRef.current
    if (expectedKey != null && key !== null && key !== expectedKey) return
    if (key) triggeredVerificationKeysRef.current.delete(key)
    activeVerificationKeyRef.current = null
    activeVerificationRecordRef.current = null
    activeVerificationSurfacesFailureRef.current = false
    setActiveVerificationId(null)
    activeVerificationDoneRef.current?.()
    activeVerificationDoneRef.current = null
  }, [])

  // The deposit is credited either way; only the lock half can fail here, so
  // failures route to the dedicated callback (or onError as fallback) instead
  // of the flow's terminal error state.
  const submitPendingLockAfterCredit = useCallback(
    async (record: OnRampRecord, userAddress: string, creditedAmount: bigint) => {
      const transactionId = record.transaction_id
      try {
        const settlement = await settlePendingOnRampLock({
          client,
          userAddress,
          transactionId,
          creditedAmount,
        })
        if (settlement.kind === 'not-found') {
          // Pending rows from other sessions or without a lock configured
          // credit silently. Only the active locked purchase expects a payload.
          if (!postDepositLock || transactionId !== activeIntentIdRef.current) return
          const lockError = new PostDepositLockError(
            'No persisted signed lock found for this on-ramp',
            'not-found'
          )
          emitDebug('lock:not-found')
          if (onLockFailedRef.current) onLockFailedRef.current(lockError, record)
          else onErrorRef.current?.(lockError)
          return
        }
        queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
        queryClient.invalidateQueries({ queryKey: ['accounting-locked-funds'] })
        queryClient.invalidateQueries({ queryKey: ['accounting-total-locked-balance'] })
        queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
        emitDebug('lock:submitted', {
          submissionIdPresent: Boolean(settlement.response.submission_id),
        })
        onLockSubmittedRef.current?.(settlement.response, record)
      } catch (err) {
        const error =
          err instanceof PostDepositLockError
            ? err
            : new PostDepositLockError(
                err instanceof Error ? err.message : 'Lock submission failed',
                'submission-failed',
                undefined,
                creditedAmount,
                { cause: err }
              )
        emitDebug('lock:failed', {
          reason: error.reason,
          message: error.message,
        })
        if (onLockFailedRef.current) onLockFailedRef.current(error, record)
        else onErrorRef.current?.(error)
      }
    },
    [client, emitDebug, postDepositLock, queryClient]
  )

  const { verify, reset: resetDepositVerification } = useDepositVerification({
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
      const recoveryScopeAtCredit = recoveryScopeRef.current
      const verificationKey = record ? getOnRampVerificationKey(record) : null
      emitDebug('verification:credited', {
        depositTxHash,
        record: record ? summariseOnRampRecord(record) : null,
      })
      if (
        record &&
        activeIntentIdRef.current &&
        matchesOnRampTransaction(record, activeIntentIdRef.current)
      ) {
        setStatus('credited')
      }
      if (record) {
        creditedVerificationKeysRef.current.add(getOnRampVerificationKey(record))
        setPending((rows) => filterCreditedOnRampRecords(rows, creditedVerificationKeysRef.current))
        const finalizeRecovery = () => {
          if (
            recoveryScopeAtCredit &&
            !finalizeCreditedOnRampIntent(recoveryScopeAtCredit, record)
          ) {
            emitDebug('verification:credit-recovery-storage-unavailable')
          }
        }
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
          // Keep durable recovery until the post-credit lock attempt settles.
          void submitPendingLockAfterCredit(record, lockOwner, creditedAmount).finally(
            finalizeRecovery
          )
        } else if (postDepositLock) {
          emitDebug('lock:owner-unavailable')
          const lockError = new PostDepositLockError(
            'No wallet address available to look up the signed lock for this on-ramp',
            'not-found'
          )
          if (onLockFailedRef.current) onLockFailedRef.current(lockError, record)
          else onErrorRef.current?.(lockError)
          finalizeRecovery()
        } else {
          finalizeRecovery()
        }
      }
      void (async () => {
        try {
          if (
            record &&
            adapter.recordDeposit &&
            record.provider === adapter.provider &&
            depositTxHash.startsWith('0x')
          ) {
            emitDebug('provider-deposit:record-request', {
              provider: adapter.provider,
              depositTxHash,
            })
            const updated = await executeOnRampPrivateRead((readClient) =>
              recordOnRampProviderDeposit(adapter, {
                client: readClient,
                record,
                depositTxHash: depositTxHash as HexString,
              })
            )
            emitDebug('provider-deposit:record-success', {
              provider: adapter.provider,
              record: updated ? summariseOnRampRecord(updated) : null,
            })
          }
        } catch (err) {
          emitDebug('provider-deposit:record-error', {
            provider: adapter.provider,
            ...errorPayload(err),
          })
          console.warn('Failed to record provider deposit:', err)
        } finally {
          await refreshPending()
          clearActiveVerification(verificationKey)
          if (
            record &&
            activeIntentIdRef.current &&
            matchesOnRampTransaction(record, activeIntentIdRef.current)
          ) {
            activeIntentIdRef.current = null
            activeIntentSessionRef.current = null
            setActiveIntentId(null)
            purchaseInitiatedRef.current = false
            lockOwnerRef.current = null
          }
        }
      })()
      if (record) onCreditedRef.current?.(depositTxHash, record)
    },
    onCheckTimeout: (depositTxHash) => {
      const record = activeVerificationRecordRef.current
      const shouldSurfaceFailure = activeVerificationSurfacesFailureRef.current || !record
      const err = new Error(
        'Privana verification is still pending. Retry from the pending on-ramp list if it does not complete.'
      )
      emitDebug('verification:timeout', { depositTxHash, message: err.message })
      clearActiveVerification()
      if (shouldSurfaceFailure) {
        setStatus('failed')
        setError(err)
      }
      void refreshPending()
      onErrorRef.current?.(err)
    },
    onError: (err) => {
      const record = activeVerificationRecordRef.current
      const shouldSurfaceFailure = activeVerificationSurfacesFailureRef.current || !record
      emitDebug('verification:error', errorPayload(err))
      clearActiveVerification()
      if (shouldSurfaceFailure) {
        setStatus('failed')
        setError(err)
      }
      onErrorRef.current?.(err)
    },
  })

  useEffect(() => {
    // Scope changes invalidate only live work. Signed intents and pending locks
    // stay in their old scoped storage so returning to that account can recover.
    activeIntentIdRef.current = null
    activeIntentSessionRef.current = null
    setActiveIntentId(null)
    purchaseInitiatedRef.current = false
    lockOwnerRef.current = null
    resetDepositVerification()
    clearActiveVerification()
    triggeredVerificationKeysRef.current.clear()
    creditedVerificationKeysRef.current.clear()
    setPending([])
    setFinalityProgress({})
    statusRef.current = 'idle'
    setStatus('idle')
    setError(null)
  }, [clearActiveVerification, flowSession, resetDepositVerification])

  useEffect(() => {
    void refreshPending()
  }, [refreshPending])

  const prepareOnRampIntent = useCallback(
    async ({
      providerAssetCode,
      baseCurrencyCode,
      baseCurrencyAmount,
      quoteCurrencyAmount,
    }: {
      providerAssetCode: string
      baseCurrencyCode?: string
      baseCurrencyAmount?: string
      quoteCurrencyAmount?: string
    }) => {
      try {
        setError(null)
        purchaseInitiatedRef.current = false
        const token = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
        if (!token) throw new Error(`Unknown token: ${tokenId}`)
        if (!scopedDepositAddress) throw new Error('Privana deposit address is not ready')
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
          // Sign for the buffered quote. The provider targets the quote while
          // slower rails may drift within the buffer; actual on-chain delivery
          // is verified before the lock submits. Any difference stays in the
          // user's available balance.
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
          provider: adapter.provider,
          providerAssetCode,
          baseCurrencyCode: baseCurrencyCode ?? null,
          baseCurrencyAmountPresent: baseCurrencyAmount !== undefined,
          quoteCurrencyAmountPresent: quoteCurrencyAmount !== undefined,
          depositAddressReady: true,
        })
        const intentInput = {
          walletAddress: scopedDepositAddress,
          tokenId,
          chainId: token.chainId,
          providerAssetCode,
        }
        const record = await executeOnRampPrivateRead((readClient) =>
          readClient.createOnRampIntent(adapter.buildIntentRequest(intentInput))
        )
        if (flowSessionRef.current !== flowSession) {
          throw new Error('On-ramp account or network changed while creating the intent')
        }
        assertCreatedOnRampIntent(record, adapter.provider, intentInput)
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
          if (flowSessionRef.current !== flowSession) {
            throw new Error('On-ramp account or network changed while signing')
          }
          savePendingLock(lockOwner, record.transaction_id, signedLock)
          lockOwnerRef.current = lockOwner
          emitDebug('intent:lock-signed', {
            lockConfigured: true,
          })
        }
        if (
          recoveryScope &&
          !rememberUnresolvedOnRampIntent(recoveryScope, record.transaction_id)
        ) {
          emitDebug('intent:recovery-storage-unavailable')
        }
        if (flowSessionRef.current !== flowSession) {
          throw new Error('On-ramp account or network changed while preparing the purchase')
        }
        activeIntentIdRef.current = record.transaction_id
        activeIntentSessionRef.current = flowSession
        setActiveIntentId(record.transaction_id)
        emitDebug('intent:create-success', {
          record: summariseOnRampRecord(record),
        })
        return record
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to create on-ramp intent')
        if (flowSessionRef.current === flowSession) {
          setStatus('failed')
          setError(e)
          emitDebug('intent:create-error', errorPayload(e))
          onErrorRef.current?.(e)
        }
        throw e
      }
    },
    [
      adapter,
      address,
      client,
      emitDebug,
      enabledTokens,
      ensureCorrectChain,
      executeOnRampPrivateRead,
      flowSession,
      networkConfig,
      postDepositLock,
      privateReadAddress,
      recoveryScope,
      scopedDepositAddress,
      serviceAddress,
      tokenId,
      wagmiConfig,
      walletClient,
    ]
  )

  // Some providers need a compatibility mapping when their transaction is
  // created. It remains best-effort: authenticated provider reads are the
  // recovery source and the mapping never authorizes credit.
  const registerProviderTransaction = useCallback(
    async (event: OnRampProviderEvent, intentId: string) => {
      if (flowSessionRef.current !== flowSession) return
      const register = adapter.registerTransaction
      if (!register) return
      const token = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
      if (!token) {
        emitDebug('provider-transaction:register-skip', {
          provider: adapter.provider,
          reason: 'selected-token-not-found',
        })
        return
      }
      try {
        emitDebug('provider-transaction:register-request', {
          provider: adapter.provider,
          intentIdPresent: Boolean(intentId),
          providerTransactionIdPresent: Boolean(event.providerTransactionId),
          tokenId,
          chainId: token.chainId,
        })
        const record = await executeOnRampPrivateRead((readClient) =>
          register({
            client: readClient,
            intentId,
            providerTransactionId: event.providerTransactionId,
            tokenId,
            chainId: token.chainId,
          })
        )
        if (flowSessionRef.current !== flowSession) return
        if (record) assertOnRampRecordProvider(record, adapter.provider)
        emitDebug('provider-transaction:register-success', {
          provider: adapter.provider,
          record: record ? summariseOnRampRecord(record) : null,
        })
      } catch (err) {
        if (flowSessionRef.current !== flowSession) return
        emitDebug('provider-transaction:register-error', {
          provider: adapter.provider,
          ...errorPayload(err),
        })
        console.warn('Failed to register on-ramp token mapping:', err)
      }
    },
    [adapter, emitDebug, enabledTokens, executeOnRampPrivateRead, flowSession, tokenId]
  )

  const handleProviderLaunchReady = useCallback(() => {
    if (flowSessionRef.current !== flowSession) return
    setError(null)
    statusRef.current = 'awaiting-purchase'
    setStatus('awaiting-purchase')
    emitDebug('provider:launch-ready', { provider: adapter.provider })
  }, [adapter.provider, emitDebug, flowSession])

  const handleProviderLaunchFailed = useCallback(
    (launchError: Error) => {
      if (flowSessionRef.current !== flowSession) return
      statusRef.current = 'failed'
      setStatus('failed')
      setError(launchError)
      emitDebug('provider:launch-error', {
        provider: adapter.provider,
        ...errorPayload(launchError),
      })
      onErrorRef.current?.(launchError)
    },
    [adapter.provider, emitDebug, flowSession]
  )

  // Provider UI events are hints. Poll the authenticated provider read until
  // it returns a strictly admitted record with an on-chain transaction hash.
  const waitForOnChainHash = useCallback(
    async (transactionId: string): Promise<OnRampRecord | null> => {
      if (flowSessionRef.current !== flowSession) return null
      const existing = deliveryWaitPromiseRef.current
      if (existing?.flowSession === flowSession && existing.transactionId === transactionId) {
        return existing.promise
      }

      const promise = (async () => {
        const startTime = Date.now()
        emitDebug('delivery-poll:start', {
          deliveryTimeout,
          deliveryPollInterval,
        })
        while (Date.now() - startTime < deliveryTimeout) {
          if (flowSessionRef.current !== flowSession) return null
          try {
            const rows = await readPendingRows()
            if (flowSessionRef.current !== flowSession) return null
            setPending(rows)
            const record = rows.find((r) => matchesOnRampTransaction(r, transactionId))
            emitDebug('delivery-poll:tick', {
              count: rows.length,
              matchingRecord: record ? summariseOnRampRecord(record) : null,
            })
            if (record?.on_chain_tx_hash) {
              emitDebug('delivery-poll:success', {
                record: summariseOnRampRecord(record),
              })
              return record
            }
          } catch (err) {
            emitDebug('delivery-poll:error', {
              ...errorPayload(err),
            })
            console.warn('Polling pending on-ramps failed:', err)
          }
          await new Promise((resolve) => setTimeout(resolve, deliveryPollInterval))
        }
        if (flowSessionRef.current !== flowSession) return null
        emitDebug('delivery-poll:timeout')
        return null
      })()
      const entry = { flowSession, transactionId, promise }
      deliveryWaitPromiseRef.current = entry

      try {
        return await promise
      } finally {
        if (deliveryWaitPromiseRef.current === entry) {
          deliveryWaitPromiseRef.current = null
        }
      }
    },
    [deliveryPollInterval, deliveryTimeout, emitDebug, flowSession, readPendingRows]
  )

  const triggerVerification = useCallback(
    async (record: OnRampRecord, surfaceFailure = false) => {
      if (flowSessionRef.current !== flowSession) return
      const verificationKey = getOnRampVerificationKey(record)
      if (triggeredVerificationKeysRef.current.has(verificationKey)) {
        emitDebug('verification:skip-duplicate', {
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
      activeVerificationSurfacesFailureRef.current =
        surfaceFailure ||
        Boolean(
          activeIntentIdRef.current && matchesOnRampTransaction(record, activeIntentIdRef.current)
        )
      setActiveVerificationId(record.transaction_id)
      setFinalityProgress((prev) => {
        if (!(record.transaction_id in prev)) return prev
        const next = { ...prev }
        delete next[record.transaction_id]
        return next
      })

      emitDebug('verification:start', {
        record: summariseOnRampRecord(record),
      })
      try {
        if (!record.on_chain_tx_hash) throw new Error('On-ramp record missing on-chain tx hash')
        if (record.chain_id == null || !record.wallet_address) {
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

        const delivered = await resolveDeliveredTransfer({
          onChainTxHash: record.on_chain_tx_hash,
          chainId: record.chain_id,
          walletAddress: record.wallet_address,
          token,
          wagmiConfig,
          emitDebug,
        })
        if (flowSessionRef.current !== flowSession) return

        // Post-completion safety net: provider fees or settlement drift can
        // leave delivery below Privana's minimum.
        const recordMinDepositBaseUnits = erc20MinDepositBaseUnits(
          scopedMinDepositByChain,
          record.chain_id
        )
        if (
          recordMinDepositBaseUnits !== undefined &&
          delivered.amount < recordMinDepositBaseUnits
        ) {
          emitDebug('verification:below-minimum', {
            deliveredAmount: delivered.amount.toString(),
            minDepositBaseUnits: String(recordMinDepositBaseUnits),
          })
          throw new Error(
            `Delivered amount (${delivered.amount} base units) is below the minimum deposit.`
          )
        }

        if (
          activeIntentIdRef.current &&
          matchesOnRampTransaction(record, activeIntentIdRef.current)
        ) {
          setStatus('verifying')
        }
        emitDebug('verification:check-deposit-request', {
          hash: record.on_chain_tx_hash,
          chainId: record.chain_id,
          amount: delivered.amount.toString(),
          logIndex: delivered.logIndex,
        })
        await verify({
          hash: record.on_chain_tx_hash,
          chainId: record.chain_id,
          amount: delivered.amount,
          logIndex: delivered.logIndex,
        })
      } catch (err) {
        if (flowSessionRef.current !== flowSession) return
        triggeredVerificationKeysRef.current.delete(verificationKey)
        if (activeVerificationKeyRef.current === verificationKey) {
          activeVerificationKeyRef.current = null
          activeVerificationRecordRef.current = null
          activeVerificationSurfacesFailureRef.current = false
          setActiveVerificationId(null)
        }
        throw err
      }
    },
    [emitDebug, enabledTokens, flowSession, scopedMinDepositByChain, verify, wagmiConfig]
  )

  const handleProviderEvent = useCallback(
    async (event: OnRampProviderEvent) => {
      if (flowSessionRef.current !== flowSession) return
      let target: OnRampProviderEventTarget | undefined
      try {
        target = resolveOnRampProviderEventTarget(
          adapter.provider,
          activeIntentIdRef.current,
          event
        )
        emitDebug(`provider:${event.kind}`, {
          provider: event.provider,
          intentIdPresent: Boolean(target.intentId),
          providerTransactionIdPresent: Boolean(event.providerTransactionId),
          stale: target.isStale,
        })

        if (target.isActive) purchaseInitiatedRef.current = true
        if (event.kind === 'transaction-created') {
          await registerProviderTransaction(event, target.intentId)
          if (flowSessionRef.current !== flowSession) return
          if (target.isStale) await refreshPending()
          return
        }

        if (target.isActive || activeIntentIdRef.current === null) {
          statusRef.current = 'awaiting-delivery'
          setStatus('awaiting-delivery')
        }
        await registerProviderTransaction(event, target.intentId)
        if (flowSessionRef.current !== flowSession) return
        if (target.isStale) {
          // A late event from an older checkout must not hijack the active
          // purchase. Provider reads will recover it through the normal queue.
          await refreshPending()
          return
        }

        const record = await waitForOnChainHash(target.intentId)
        if (flowSessionRef.current !== flowSession) return
        if (!record) {
          const deliveryError = new Error(
            'Backend has not yet confirmed delivery. You can finish from the pending list.'
          )
          emitDebug('provider:completed-without-backend-row', {
            provider: event.provider,
            message: deliveryError.message,
          })
          if (target.isActive || activeIntentIdRef.current === null) {
            statusRef.current = 'failed'
            setStatus('failed')
            setError(deliveryError)
            onErrorRef.current?.(deliveryError)
          }
          return
        }
        await triggerVerification(record, true)
      } catch (err) {
        if (flowSessionRef.current !== flowSession) return
        const providerError = err instanceof Error ? err : new Error('Verification failed')
        emitDebug('provider:event-error', {
          provider: event.provider,
          kind: event.kind,
          ...errorPayload(providerError),
        })
        if (!target?.isStale) {
          statusRef.current = 'failed'
          setStatus('failed')
          setError(providerError)
          onErrorRef.current?.(providerError)
        }
      }
    },
    [
      adapter.provider,
      emitDebug,
      flowSession,
      refreshPending,
      registerProviderTransaction,
      triggerVerification,
      waitForOnChainHash,
    ]
  )

  const handleProviderClosed = useCallback(async () => {
    if (flowSessionRef.current !== flowSession) return
    const existing = closeReconcilePromiseRef.current
    if (existing?.flowSession === flowSession) return existing.promise

    const promise = (async () => {
      const previousStatus = statusRef.current
      const transactionId = activeIntentIdRef.current
      const action = getOnRampCloseRecoveryAction(transactionId, purchaseInitiatedRef.current)
      emitDebug('provider:closed-reconcile', {
        provider: adapter.provider,
        previousStatus,
        intentPresent: Boolean(transactionId),
        action,
      })

      if (action === 'refresh') {
        await refreshPending()
        return
      }

      if (action === 'refresh-and-retain') {
        emitDebug('provider:closed-without-event', {
          provider: adapter.provider,
          previousStatus,
          recoveryRetained: true,
        })
        await refreshPending()
        if (flowSessionRef.current !== flowSession) return
        if (previousStatus === 'awaiting-purchase' || previousStatus === 'awaiting-delivery') {
          statusRef.current = 'idle'
          setStatus('idle')
        }
        return
      }

      try {
        statusRef.current = 'awaiting-delivery'
        setStatus('awaiting-delivery')
        const record = await waitForOnChainHash(transactionId!)
        if (flowSessionRef.current !== flowSession) return
        if (record) {
          await triggerVerification(record, true)
          return
        }
        await refreshPending()
        if (flowSessionRef.current !== flowSession) return
        if (previousStatus === 'awaiting-purchase' || previousStatus === 'awaiting-delivery') {
          statusRef.current = 'idle'
          setStatus('idle')
        }
      } catch (err) {
        if (flowSessionRef.current !== flowSession) return
        const e = err instanceof Error ? err : new Error('On-ramp reconciliation failed')
        emitDebug('provider:closed-reconcile-error', {
          provider: adapter.provider,
          ...errorPayload(e),
        })
        setStatus('failed')
        setError(e)
        onErrorRef.current?.(e)
      }
    })()
    const entry = { flowSession, promise }
    closeReconcilePromiseRef.current = entry

    try {
      await promise
    } finally {
      if (closeReconcilePromiseRef.current === entry) {
        closeReconcilePromiseRef.current = null
      }
    }
  }, [
    adapter.provider,
    emitDebug,
    flowSession,
    refreshPending,
    triggerVerification,
    waitForOnChainHash,
  ])

  const finishPendingVerification = useCallback(
    async (record: OnRampRecord) => {
      try {
        emitDebug('pending:finish-verification', {
          record: summariseOnRampRecord(record),
        })
        await triggerVerification(record, true)
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
      await verifyPendingOnRampsSequentially({
        records: pending,
        shouldStop: () => cancelled,
        wasTriggered: (key) => triggeredVerificationKeysRef.current.has(key),
        trigger: (record) => triggerVerificationRef.current(record),
        // verify() resolves after scheduling status polling. Waiting for its
        // terminal callback prevents the next record from cancelling it.
        waitForTerminal: (key) =>
          activeVerificationKeyRef.current === key
            ? new Promise<void>((resolve) => {
                activeVerificationDoneRef.current = resolve
              })
            : Promise.resolve(),
      })
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
    depositAddress: scopedDepositAddress,
    minDepositBaseUnits: scopedMinDepositBaseUnits,
    selectedToken,
    prepareOnRampIntent,
    handleProviderLaunchReady,
    handleProviderLaunchFailed,
    handleProviderEvent,
    finishPendingVerification,
    handleProviderClosed,
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
    provider: record.provider,
    provider_asset_code: record.provider_asset_code,
    status: record.status,
    token_id: record.token_id,
    chain_id: record.chain_id,
    moonpay_currency_code: record.moonpay_currency_code ?? null,
    external_transaction_id_present: Boolean(record.external_transaction_id),
    provider_transaction_id_present: Boolean(record.provider_transaction_id),
    moonpay_transaction_id_present: Boolean(record.moonpay_transaction_id),
    wallet_address_present: Boolean(record.wallet_address),
    quote_currency_amount_present: record.quote_currency_amount != null,
    on_chain_tx_hash_present: Boolean(record.on_chain_tx_hash),
    deposit_id_present: Boolean(record.deposit_id),
    deposit_tx_hash_present: Boolean(record.deposit_tx_hash),
    deposit_triggered_at: record.deposit_triggered_at ?? null,
    credited_at: record.credited_at ?? null,
  }
}

async function resolveDeliveredTransfer({
  onChainTxHash,
  chainId,
  walletAddress,
  token,
  wagmiConfig,
  emitDebug,
}: {
  onChainTxHash: HexString
  chainId: number
  walletAddress: HexString
  token: TokenConfig
  wagmiConfig: ReturnType<typeof useConfig>
  emitDebug: (event: string, payload?: Record<string, unknown>) => void
}): Promise<OnRampDeliveredTransfer> {
  assertErc20OnRampToken(token.contract)

  try {
    const receipt = await waitForTransactionReceipt(wagmiConfig, {
      hash: onChainTxHash as `0x${string}`,
      chainId,
      timeout: 60_000,
      pollingInterval: 4_000,
    })

    const delivered = resolveErc20OnRampTransfer(receipt.logs, token.contract, walletAddress)
    emitDebug('verification:amount-from-receipt', {
      amount: delivered.amount.toString(),
      logIndex: delivered.logIndex,
      tokenAddress: token.contract,
      depositAddressMatched: true,
    })
    return delivered
  } catch (err) {
    emitDebug('verification:amount-from-receipt-error', errorPayload(err))
    const errorDetail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Unable to derive delivered ${token.symbol} transfer from its receipt: ${errorDetail}`
    )
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
