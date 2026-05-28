'use client'

import { useCallback, useState } from 'react'
import { useAccount } from 'wagmi'
import { MoonPayBuyWidget } from '@moonpay/moonpay-react'
import { Button } from '@/components/ui/button'
import { useFiatOnRamp } from '@/sdk/hooks/use-fiat-on-ramp'
import type { Bytes32 } from '@/sdk/types'

export interface FiatOnRampFormProps {
  /** Privana token id to deposit into after the on-ramp completes. */
  tokenId: Bytes32
  /**
   * MoonPay currency code, e.g. 'usdc_base' (prod) or 'usdc_base_sepolia' (sandbox).
   * MoonPay maintains the canonical list at /v3/currencies.
   */
  currencyCode: string
  /** Fiat currency code (default: 'usd'). */
  baseCurrencyCode?: string
  /** Pre-filled fiat amount the user can still edit in MoonPay (default: '100'). */
  defaultBaseCurrencyAmount?: string
  /** Fired when the resulting Privana deposit is credited. */
  onCredited?: (depositTxHash: string) => void
  onError?: (error: Error) => void
}

export function FiatOnRampForm({
  tokenId,
  currencyCode,
  baseCurrencyCode = 'usd',
  defaultBaseCurrencyAmount = '100',
  onCredited,
  onError,
}: FiatOnRampFormProps) {
  const { address } = useAccount()
  const [visible, setVisible] = useState(false)

  const {
    status,
    pending,
    error,
    depositAddress,
    signUrl,
    handleTransactionCompleted,
    finishPendingVerification,
  } = useFiatOnRamp({ tokenId, onCredited, onError })

  const isBusy =
    status === 'awaiting-purchase' || status === 'awaiting-delivery' || status === 'verifying'
  const canBuy = !!address && !!depositAddress && !isBusy

  const handleClose = useCallback(() => setVisible(false), [])

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" disabled={!canBuy} onClick={() => setVisible(true)}>
        {isBusy ? statusLabel(status) : `Buy ${currencyCode.toUpperCase()}`}
      </Button>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error.message}
        </p>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-sm font-medium">Finish verification</p>
          <p className="text-muted-foreground text-xs">
            MoonPay delivered your purchase, but Privana hasn&apos;t verified it yet. Resume
            verification now to credit your balance.
          </p>
          {pending.map((record) => (
            <Button
              key={record.transaction_id}
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => finishPendingVerification(record)}
            >
              {record.quote_currency_amount ?? '?'} {currencyCode.toUpperCase()}
            </Button>
          ))}
        </div>
      )}

      {visible && depositAddress && (
        <MoonPayBuyWidget
          variant="overlay"
          visible
          baseCurrencyCode={baseCurrencyCode}
          baseCurrencyAmount={defaultBaseCurrencyAmount}
          currencyCode={currencyCode}
          // MoonPay delivers USDC directly to Privana deposit address, user's connected wallet is only used for SIWE auth and not involved in the on-chain transfer
          walletAddress={depositAddress}
          externalCustomerId={address?.toLowerCase()}
          onCloseOverlay={handleClose}
          onUrlSignatureRequested={signUrl}
          onTransactionCompleted={handleTransactionCompleted}
        />
      )}
    </div>
  )
}

function statusLabel(status: ReturnType<typeof useFiatOnRamp>['status']): string {
  switch (status) {
    case 'awaiting-purchase':
      return 'Complete your purchase…'
    case 'awaiting-delivery':
      return 'Waiting for on-chain delivery…'
    case 'verifying':
      return 'Verifying with Privana…'
    case 'credited':
      return 'Credited'
    case 'failed':
      return 'Failed'
    default:
      return ''
  }
}
