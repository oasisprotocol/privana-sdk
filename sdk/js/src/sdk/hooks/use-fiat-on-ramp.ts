'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { parseUnits } from 'viem'
import type { MoonPayBuyWidget } from '@moonpay/moonpay-react'

// MoonPay doesn't export these types directly
type MoonPayBuyProps = Parameters<typeof MoonPayBuyWidget>[0]
type OnTransactionCompletedProps = Parameters<
  NonNullable<MoonPayBuyProps['onTransactionCompleted']>
>[0]

import { usePrivanaContext } from '../context/privana-provider'
import { useDepositVerification } from './use-deposit-verification'
import type { Bytes32, OnRampRecord } from '../types'

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

export interface UseFiatOnRampOptions {
  /** Privana token the on-ramp will deposit into. */
  tokenId: Bytes32
  /** Fired when the deposit is credited inside the Privana accounting module. */
  onCredited?: (txHash: string) => void
  onError?: (error: Error) => void
  /**
   * Max time in ms to wait for the backend to surface the on-chain tx hash
   * after MoonPay reports `transaction_completed` (default: 60000 = 1 minute).
   * If exceeded, the row stays in `pending` for the user to finish later.
   */
  deliveryTimeout?: number
  /** Polling interval in ms while waiting for the on-chain tx hash (default: 3000). */
  deliveryPollInterval?: number
}

export interface UseFiatOnRampResult {
  status: FiatOnRampStatus
  /** Completed on-ramps that still need Privana verification. */
  pending: OnRampRecord[]
  error: Error | null
  /**
   * Per-user Privana deposit address. MoonPay should deliver here directly —
   * pass to `<MoonPayBuyWidget walletAddress={depositAddress}>`. `undefined`
   * while it's still being fetched.
   */
  depositAddress: `0x${string}` | undefined
  /** Wire to `<MoonPayBuyWidget onUrlSignatureRequested>`. */
  signUrl: (url: string) => Promise<string>
  /** Wire to `<MoonPayBuyWidget onTransactionCompleted>`. */
  handleTransactionCompleted: (props: OnTransactionCompletedProps) => Promise<void>
  /** Trigger Privana verification for a row returned by `pending`. */
  finishPendingVerification: (record: OnRampRecord) => Promise<void>
  refreshPending: () => Promise<void>
}

export function useFiatOnRamp(options: UseFiatOnRampOptions): UseFiatOnRampResult {
  const { tokenId, onCredited, onError } = options
  const deliveryTimeout = options.deliveryTimeout ?? 60_000
  const deliveryPollInterval = options.deliveryPollInterval ?? 3_000

  const { client, enabledTokens } = usePrivanaContext()

  const [status, setStatus] = useState<FiatOnRampStatus>('idle')
  const [pending, setPending] = useState<OnRampRecord[]>([])
  const [error, setError] = useState<Error | null>(null)
  const [depositAddress, setDepositAddress] = useState<`0x${string}` | undefined>()

  const onCreditedRef = useRef(onCredited)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onCreditedRef.current = onCredited
    onErrorRef.current = onError
  }, [onCredited, onError])

  // Fetch the Privana deposit address once. MoonPay needs this to deliver
  // directly to Privana, bypassing the user's wallet entirely.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const resp = await client.getDepositAddress()
        if (!cancelled) setDepositAddress(resp.deposit_address)
      } catch (err) {
        if (!cancelled) console.warn('Failed to fetch Privana deposit address:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [client])

  const refreshPending = useCallback(async () => {
    try {
      const { pending: rows } = await client.getPendingOnRamps()
      setPending(rows)
    } catch (err) {
      console.warn('Failed to load pending on-ramps:', err)
    }
  }, [client])

  useEffect(() => {
    refreshPending()
  }, [refreshPending])

  const { verify } = useDepositVerification({
    onCredited: (depositTxHash) => {
      setStatus('credited')
      void refreshPending()
      onCreditedRef.current?.(depositTxHash)
    },
    onError: (err) => {
      setStatus('failed')
      setError(err)
      onErrorRef.current?.(err)
    },
  })

  const signUrl = useCallback(
    async (url: string): Promise<string> => {
      setError(null)
      try {
        const { signature } = await client.signOnRampUrl({ url })
        setStatus('awaiting-purchase')
        return signature
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Failed to sign on-ramp URL')
        setStatus('failed')
        setError(e)
        onErrorRef.current?.(e)
        throw err
      }
    },
    [client]
  )

  // After MoonPay reports completion the on-chain tx hash isn't in the widget
  // event — it arrives via the MoonPay→backend webhook. Poll `/pending` until
  // the row for this MoonPay id has `on_chain_tx_hash` populated, then proceed.
  const waitForOnChainHash = useCallback(
    async (moonpayId: string): Promise<OnRampRecord | null> => {
      const startTime = Date.now()
      while (Date.now() - startTime < deliveryTimeout) {
        try {
          const { pending: rows } = await client.getPendingOnRamps()
          setPending(rows)
          const record = rows.find((r) => r.transaction_id === moonpayId)
          if (record?.on_chain_tx_hash && record.quote_currency_amount) return record
        } catch (err) {
          console.warn('Polling pending on-ramps failed:', err)
        }
        await new Promise((r) => setTimeout(r, deliveryPollInterval))
      }
      return null
    },
    [client, deliveryPollInterval, deliveryTimeout]
  )

  const triggerVerification = useCallback(
    async (record: OnRampRecord) => {
      if (!record.on_chain_tx_hash || !record.quote_currency_amount) {
        throw new Error('On-ramp record missing on-chain tx hash or delivered amount')
      }
      const token = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
      if (!token) throw new Error(`Unknown token: ${tokenId}`)

      setStatus('verifying')
      // `quote_currency_amount` is a decimal string from MoonPay (e.g. "99.95"),
      // not base units. parseUnits handles the decimal → base-units conversion
      // precisely for typical retail amounts.
      const amount = parseUnits(record.quote_currency_amount, token.decimals)
      await verify({
        hash: record.on_chain_tx_hash,
        chainId: record.chain_id,
        amount,
      })
    },
    [enabledTokens, tokenId, verify]
  )

  const handleTransactionCompleted = useCallback(
    async (props: OnTransactionCompletedProps) => {
      try {
        setStatus('awaiting-delivery')
        const record = await waitForOnChainHash(props.id)
        if (!record) {
          // Backend hasn't received MoonPay's webhook within the timeout. The
          // purchase is real and recovery is available via `pending` — surface
          // a non-terminal error so the form can prompt the user to retry from
          // the pending list once the webhook lands.
          const err = new Error(
            'Backend has not yet confirmed delivery. You can finish from the pending list.'
          )
          setStatus('failed')
          setError(err)
          onErrorRef.current?.(err)
          return
        }
        await triggerVerification(record)
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Verification failed')
        setStatus('failed')
        setError(e)
        onErrorRef.current?.(e)
      }
    },
    [triggerVerification, waitForOnChainHash]
  )

  const finishPendingVerification = useCallback(
    async (record: OnRampRecord) => {
      try {
        await triggerVerification(record)
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Verification failed')
        setStatus('failed')
        setError(e)
        onErrorRef.current?.(e)
      }
    },
    [triggerVerification]
  )

  return {
    status,
    pending,
    error,
    depositAddress,
    signUrl,
    handleTransactionCompleted,
    finishPendingVerification,
    refreshPending,
  }
}
