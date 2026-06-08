'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { decodeEventLog, parseAbiItem, parseUnits, zeroAddress } from 'viem'
import { getTransactionReceipt } from '@wagmi/core'
import { useConfig } from 'wagmi'
import type { MoonPayBuyWidget } from '@moonpay/moonpay-react'

// MoonPay doesn't export these types directly
type MoonPayBuyProps = Parameters<typeof MoonPayBuyWidget>[0]
type OnTransactionCompletedProps = Parameters<
  NonNullable<MoonPayBuyProps['onTransactionCompleted']>
>[0]
type OnTransactionCreatedProps = Parameters<NonNullable<MoonPayBuyProps['onTransactionCreated']>>[0]

import { usePrivanaContext } from '../context/privana-provider'
import { useDepositVerification } from './use-deposit-verification'
import { usePrivateReadRequest } from './use-private-read-request'
import type { Bytes32, HexString, OnRampRecord, TokenConfig } from '../types'

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
  /** Fired when the deposit is credited inside the Privana accounting module. */
  onCredited?: (txHash: string) => void
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
  error: Error | null
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

export function useFiatOnRamp(options: UseFiatOnRampOptions): UseFiatOnRampResult {
  const { tokenId, onCredited, onError, onDebugEvent } = options
  const deliveryTimeout = options.deliveryTimeout ?? DEFAULT_DELIVERY_TIMEOUT_MS
  const deliveryPollInterval = options.deliveryPollInterval ?? 3_000
  const verificationTimeout = options.verificationTimeout ?? DEFAULT_VERIFICATION_TIMEOUT_MS
  const finalityRetryInterval = options.finalityRetryInterval ?? DEFAULT_FINALITY_RETRY_INTERVAL_MS

  const { client, enabledTokens } = usePrivanaContext()
  const { executePrivateRead, privateReadReady } = usePrivateReadRequest()
  const wagmiConfig = useConfig()

  const selectedToken = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())

  const [status, setStatus] = useState<FiatOnRampStatus>('idle')
  const [pending, setPending] = useState<OnRampRecord[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [depositAddress, setDepositAddress] = useState<`0x${string}` | undefined>()
  const [minDepositBaseUnits, setMinDepositBaseUnits] = useState<bigint | undefined>()
  const [activeIntentId, setActiveIntentId] = useState<string | null>(null)

  const onCreditedRef = useRef(onCredited)
  const onErrorRef = useRef(onError)
  const onDebugEventRef = useRef(onDebugEvent)
  const statusRef = useRef(status)
  const activeIntentIdRef = useRef<string | null>(null)
  const activeVerificationRecordRef = useRef<OnRampRecord | null>(null)
  const activeVerificationKeyRef = useRef<string | null>(null)
  const triggeredVerificationKeysRef = useRef<Set<string>>(new Set())
  const closeReconcilePromiseRef = useRef<Promise<void> | null>(null)
  useEffect(() => {
    onCreditedRef.current = onCredited
    onErrorRef.current = onError
    onDebugEventRef.current = onDebugEvent
  }, [onCredited, onError, onDebugEvent])

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
        const resp = await executePrivateRead(() => client.getDepositAddress())
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
      const { pending: rows } = await executePrivateRead(() => client.getPendingOnRamps())
      setPending(rows)
      emitDebug('pending:success', {
        count: rows.length,
        rows: rows.map(summariseOnRampRecord),
      })
    } catch (err) {
      emitDebug('pending:error', errorPayload(err))
      console.warn('Failed to load pending on-ramps:', err)
    }
  }, [client, emitDebug, executePrivateRead, privateReadReady])

  useEffect(() => {
    refreshPending()
  }, [refreshPending])

  const clearActiveVerification = useCallback(() => {
    const key = activeVerificationKeyRef.current
    if (key) triggeredVerificationKeysRef.current.delete(key)
    activeVerificationKeyRef.current = null
    activeVerificationRecordRef.current = null
  }, [])

  const { verify } = useDepositVerification({
    pollTimeout: verificationTimeout,
    pollInterval: options.verificationPollInterval,
    finalityRetryInterval,
    onCredited: (depositTxHash) => {
      const record = activeVerificationRecordRef.current
      emitDebug('verification:credited', {
        depositTxHash,
        record: record ? summariseOnRampRecord(record) : null,
      })
      setStatus('credited')
      void (async () => {
        try {
          if (record && depositTxHash.startsWith('0x')) {
            emitDebug('onramp:mark-deposit-triggered-request', {
              transactionId: record.transaction_id,
              depositTxHash,
            })
            const updated = await executePrivateRead(() =>
              client.updateOnRamp(record.transaction_id, {
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
          clearActiveVerification()
          if (record && activeIntentIdRef.current === record.transaction_id) {
            activeIntentIdRef.current = null
            setActiveIntentId(null)
          }
          void refreshPending()
        }
      })()
      onCreditedRef.current?.(depositTxHash)
    },
    onCheckTimeout: (depositTxHash) => {
      const err = new Error(
        'Privana verification is still pending. Retry from the pending on-ramp list if it does not complete.'
      )
      emitDebug('verification:timeout', { depositTxHash, message: err.message })
      clearActiveVerification()
      setStatus('failed')
      setError(err)
      void refreshPending()
      onErrorRef.current?.(err)
    },
    onError: (err) => {
      emitDebug('verification:error', errorPayload(err))
      clearActiveVerification()
      setStatus('failed')
      setError(err)
      onErrorRef.current?.(err)
    },
  })

  const prepareOnRampIntent = useCallback(
    async ({
      currencyCode,
      baseCurrencyCode,
      baseCurrencyAmount,
    }: {
      currencyCode: string
      baseCurrencyCode?: string
      baseCurrencyAmount?: string
    }) => {
      try {
        setError(null)
        const token = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
        if (!token) throw new Error(`Unknown token: ${tokenId}`)
        if (!depositAddress) throw new Error('Privana deposit address is not ready')

        emitDebug('intent:create-request', {
          tokenId,
          chainId: token.chainId,
          currencyCode,
          baseCurrencyCode: baseCurrencyCode ?? null,
          baseCurrencyAmount: baseCurrencyAmount ?? null,
          depositAddress,
        })
        const record = await executePrivateRead(() =>
          client.createOnRampIntent({
            wallet_address: depositAddress,
            token_id: tokenId,
            chain_id: token.chainId,
            moonpay_currency_code: currencyCode,
            base_currency_code: baseCurrencyCode,
            base_currency_amount: baseCurrencyAmount,
          })
        )
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
    [client, depositAddress, emitDebug, enabledTokens, executePrivateRead, tokenId]
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
        const record = await executePrivateRead(() =>
          client.updateOnRamp(transactionId, {
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
    [client, emitDebug, enabledTokens, executePrivateRead, tokenId]
  )

  const handleTransactionCreated = useCallback(
    async (props: OnTransactionCreatedProps) => {
      emitDebug('moonpay:onTransactionCreated', summariseMoonPayEventProps(props))
      await registerOnRampTokenMapping(props.id)
    },
    [emitDebug, registerOnRampTokenMapping]
  )

  const signUrl = useCallback(
    async (url: string): Promise<string> => {
      setError(null)
      try {
        emitDebug('moonpay:onUrlSignatureRequested', summariseMoonPayUrl(url))
        const { signature } = await executePrivateRead(() => client.signOnRampUrl({ url }))
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
    [client, emitDebug, executePrivateRead]
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
          const { pending: rows } = await executePrivateRead(() => client.getPendingOnRamps())
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
    [client, deliveryPollInterval, deliveryTimeout, emitDebug, executePrivateRead]
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
      triggeredVerificationKeysRef.current.add(verificationKey)
      activeVerificationKeyRef.current = verificationKey
      activeVerificationRecordRef.current = record

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

        setStatus('verifying')
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
  }, [emitDebug, refreshPending, triggerVerification, waitForOnChainHash])

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
      }
    },
    [emitDebug, triggerVerification]
  )

  return {
    status,
    activeIntentId,
    pending,
    error,
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
    const receipt = await getTransactionReceipt(wagmiConfig, {
      hash: onChainTxHash as `0x${string}`,
      chainId,
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
