'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAccount } from 'wagmi'
import { parseUnits } from 'viem'
import type { MoonPayBuyWidget } from '@moonpay/moonpay-react'

// MoonPay doesn't export these types directly
type MoonPayBuyProps = Parameters<typeof MoonPayBuyWidget>[0]
type OnTransactionCreatedProps = Parameters<NonNullable<MoonPayBuyProps['onTransactionCreated']>>[0]
type OnTransactionCompletedProps = Parameters<
  NonNullable<MoonPayBuyProps['onTransactionCompleted']>
>[0]
import { usePrivanaContext } from '../context/privana-provider'
import { useDeposit } from './use-deposit'
import type { Bytes32, OnRampRecord } from '../types'

export type FiatOnRampStatus = 'idle' | 'awaiting-purchase' | 'depositing' | 'credited' | 'failed'

export interface UseFiatOnRampOptions {
  /** Privana token id to deposit into after the on-ramp completes. */
  tokenId: Bytes32
  /** Fired when the deposit is credited inside the Privana accounting module. */
  onCredited?: (txHash: string) => void
  onError?: (error: Error) => void
}

export interface UseFiatOnRampResult {
  status: FiatOnRampStatus
  /** Completed on-ramps that haven't yet had their deposit step triggered. */
  pending: OnRampRecord[]
  error: Error | null
  /** Wire to `<MoonPayBuyWidget onUrlSignatureRequested>`. */
  signUrl: (url: string) => Promise<string>
  /** Wire to `<MoonPayBuyWidget onTransactionCreated>`. */
  handleTransactionCreated: (props: OnTransactionCreatedProps) => Promise<void>
  /** Wire to `<MoonPayBuyWidget onTransactionCompleted>`. */
  handleTransactionCompleted: (props: OnTransactionCompletedProps) => Promise<void>
  /** Trigger the deposit step for a row returned by `pending`. */
  finishPendingDeposit: (record: OnRampRecord) => Promise<void>
  refreshPending: () => Promise<void>
}

export function useFiatOnRamp(options: UseFiatOnRampOptions): UseFiatOnRampResult {
  const { tokenId, onCredited, onError } = options
  const { client, enabledTokens } = usePrivanaContext()
  const { address } = useAccount()

  const [status, setStatus] = useState<FiatOnRampStatus>('idle')
  const [pending, setPending] = useState<OnRampRecord[]>([])
  const [error, setError] = useState<Error | null>(null)

  // The MoonPay transaction id currently being deposited. We need it inside
  // useDeposit's onCredited to write the deposit_tx_hash back via updateOnRamp.
  const activeTxIdRef = useRef<string | null>(null)

  const onCreditedRef = useRef(onCredited)
  const onErrorRef = useRef(onError)
  useEffect(() => {
    onCreditedRef.current = onCredited
    onErrorRef.current = onError
  }, [onCredited, onError])

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

  const { deposit } = useDeposit({
    onCredited: async (depositTxHash) => {
      const txId = activeTxIdRef.current
      if (txId) {
        try {
          await client.updateOnRamp(txId, { deposit_tx_hash: depositTxHash as `0x${string}` })
        } catch (err) {
          console.warn('Failed to mark on-ramp deposited:', err)
        }
        activeTxIdRef.current = null
      }
      setStatus('credited')
      await refreshPending()
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
      setStatus('awaiting-purchase')
      const { signature } = await client.signOnRampUrl({ url })
      return signature
    },
    [client]
  )

  const handleTransactionCreated = useCallback(
    async (props: OnTransactionCreatedProps) => {
      if (!address) return
      const token = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
      if (!token) return

      await client.updateOnRamp(props.id, {
        wallet_address: address,
        token_id: tokenId,
        chain_id: token.chainId,
        base_currency_code: props.baseCurrencyCode,
        base_currency_amount: String(props.baseCurrencyAmount),
      })
    },
    [address, client, enabledTokens, tokenId]
  )

  const triggerDeposit = useCallback(
    async (txId: string, deliveredAmount: number) => {
      const token = enabledTokens.find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
      if (!token) throw new Error(`Unknown token: ${tokenId}`)

      activeTxIdRef.current = txId
      setStatus('depositing')
      // MoonPay returns deliveredAmount as a JS number (decimal units). For
      // typical retail amounts (well under 10^15) this is exact; conversion to
      // base units via parseUnits goes through a string and is precise.
      const amount = parseUnits(deliveredAmount.toString(), token.decimals)
      await deposit({ tokenId, amount })
    },
    [deposit, enabledTokens, tokenId]
  )

  const handleTransactionCompleted = useCallback(
    async (props: OnTransactionCompletedProps) => {
      try {
        await triggerDeposit(props.id, props.quoteCurrencyAmount)
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Deposit failed')
        setStatus('failed')
        setError(e)
        onErrorRef.current?.(e)
      }
    },
    [triggerDeposit]
  )

  const finishPendingDeposit = useCallback(
    async (record: OnRampRecord) => {
      if (!record.quote_currency_amount) {
        throw new Error('Pending record missing delivered amount')
      }
      try {
        await triggerDeposit(record.transaction_id, parseFloat(record.quote_currency_amount))
      } catch (err) {
        const e = err instanceof Error ? err : new Error('Deposit failed')
        setStatus('failed')
        setError(e)
        onErrorRef.current?.(e)
      }
    },
    [triggerDeposit]
  )

  return {
    status,
    pending,
    error,
    signUrl,
    handleTransactionCreated,
    handleTransactionCompleted,
    finishPendingDeposit,
    refreshPending,
  }
}
