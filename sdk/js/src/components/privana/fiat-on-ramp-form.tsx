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
    signUrl,
    handleTransactionCreated,
    handleTransactionCompleted,
    finishPendingDeposit,
  } = useFiatOnRamp({ tokenId, onCredited, onError })

  const isBusy = status === 'depositing' || status === 'awaiting-purchase'
  const handleClose = useCallback(() => setVisible(false), [])

  return (
    <div className="flex flex-col gap-4">
      <Button type="button" disabled={!address || isBusy} onClick={() => setVisible(true)}>
        {isBusy ? statusLabel(status) : `Buy ${currencyCode.toUpperCase()}`}
      </Button>

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error.message}
        </p>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <p className="text-sm font-medium">Finish your deposit</p>
          <p className="text-muted-foreground text-xs">
            You bought crypto but the deposit step was interrupted. Resume it now to credit your
            Privana balance.
          </p>
          {pending.map((record) => (
            <Button
              key={record.transaction_id}
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => finishPendingDeposit(record)}
            >
              {record.quote_currency_amount ?? '?'} {currencyCode.toUpperCase()}
            </Button>
          ))}
        </div>
      )}

      {visible && (
        <MoonPayBuyWidget
          variant="overlay"
          visible
          baseCurrencyCode={baseCurrencyCode}
          baseCurrencyAmount={defaultBaseCurrencyAmount}
          currencyCode={currencyCode}
          walletAddress={address}
          externalCustomerId={address}
          onCloseOverlay={handleClose}
          onUrlSignatureRequested={signUrl}
          onTransactionCreated={handleTransactionCreated}
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
    case 'depositing':
      return 'Depositing to Privana…'
    case 'credited':
      return 'Deposit credited'
    case 'failed':
      return 'Failed'
    default:
      return ''
  }
}
