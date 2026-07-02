'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CircleCheckIcon, Loader2 } from 'lucide-react'
import { formatUnits } from 'viem'
import { useAccount } from 'wagmi'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useFiatOnRamp, type FiatOnRampDebugEvent } from '@/sdk/hooks/use-fiat-on-ramp'
import type { Bytes32 } from '@/sdk/types'
import { useMoonPayBuyWidget } from './use-moonpay-buy-widget'

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
  /** Override the display symbol. Defaults to the resolved token's symbol, then `currencyCode`. */
  tokenSymbol?: string
  /** Enable dark mode or light mode as the default appearance for the widget. Possible values are dark, light. */
  theme?: 'light' | 'dark'
  /**  Theme created via MoonPay dashboard theme builder  */
  themeId?: string
  /** Widget main color. It is used for buttons, links and highlighted text. Only hexadecimal codes are accepted. */
  colorCode?: string
  /**
   * - 'overlay' (default): full-screen modal over the page with the Privana splash screen.
   * - 'embedded': iframe injected inline where this component renders.
   * other variants are intentionally not supported - they require `window.open` to fire synchronously inside the
   * click handler, but this form awaits `prepareOnRampIntent` before mounting the widget, so the popup would be blocked by the browser.
   */
  variant?: 'overlay' | 'embedded'
  /**
   * Prepare on-ramp intent and mount widget automatically on load. Intended for flows where the purchase was already confirmed.
   */
  autoStart?: boolean
  /**
   * When true, the user cannot edit the fiat amount inside MoonPay.
   * Requires `defaultBaseCurrencyAmount` to take effect — MoonPay silently
   * skips this when no amount is set.
   */
  lockAmount?: boolean
  /** Pre-selects a payment method tab in MoonPay */
  paymentMethod?: string
  /** Fired when the resulting Privana deposit is credited. */
  onCredited?: (depositTxHash: string) => void
  onError?: (error: Error) => void
  /** Optional diagnostic event stream for previews/tests. */
  onDebugEvent?: (event: FiatOnRampDebugEvent) => void
}

export function FiatOnRampForm({
  tokenId,
  currencyCode,
  baseCurrencyCode = 'usd',
  defaultBaseCurrencyAmount = '100',
  tokenSymbol,
  theme,
  themeId,
  colorCode,
  variant = 'overlay',
  autoStart = false,
  lockAmount,
  paymentMethod,
  onCredited,
  onError,
  onDebugEvent,
}: FiatOnRampFormProps) {
  const { address } = useAccount()
  const [visible, setVisible] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)

  const {
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
  } = useFiatOnRamp({ tokenId, onCredited, onError, onDebugEvent })

  const decimals = selectedToken?.decimals
  const displaySymbol = tokenSymbol ?? selectedToken?.symbol ?? currencyCode.toUpperCase()

  const emitFormDebug = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      onDebugEvent?.({
        at: new Date().toISOString(),
        event,
        status,
        tokenId,
        payload,
      })
    },
    [onDebugEvent, status, tokenId]
  )

  // Approximate the fiat floor we need to clear the minimum-deposit check.
  // Pads the token's base-units minimum by 5% (MoonPay's worst-case card fee
  // is ~4.5%) so the post-fee delivered amount doesn't fall below Privana's
  // minimum and strand the user's funds. Only used to gate the buy button
  // when the user is at the bottom of the range — actual MoonPay fees are
  // variable by payment method and apply inside the widget regardless.
  const minFiatGate =
    minDepositBaseUnits !== undefined && decimals !== undefined
      ? Number(formatUnits(minDepositBaseUnits, decimals)) * 1.05
      : undefined
  const isBelowMin = minFiatGate !== undefined && Number(defaultBaseCurrencyAmount) < minFiatGate
  const isBusy = isPreparing || status === 'awaiting-purchase'
  const isInitializing = !!address && !depositAddress
  const isPrePurchase = status === 'idle' || status === 'awaiting-purchase'
  const isVerifying = status === 'awaiting-delivery' || status === 'verifying'
  const blockReasons = useMemo(
    () =>
      [
        !address ? 'wallet-not-connected' : null,
        !depositAddress ? 'deposit-address-not-loaded' : null,
        isBusy ? `busy:${isPreparing ? 'preparing' : status}` : null,
        visible ? 'widget-open' : null,
        isBelowMin ? 'below-minimum' : null,
      ].filter((reason): reason is string => Boolean(reason)),
    [address, depositAddress, isBelowMin, isBusy, isPreparing, status, visible]
  )
  const canBuy = blockReasons.length === 0

  const handleOpen = useCallback(async () => {
    if (!canBuy) {
      emitFormDebug('form:open-blocked', {
        reasons: blockReasons,
        currencyCode,
        tokenSymbol: displaySymbol,
        tokenDecimals: decimals ?? null,
        baseCurrencyCode,
        defaultBaseCurrencyAmount,
        depositAddress: depositAddress ?? null,
        walletAddress: address ?? null,
        status,
      })
      return
    }

    setIsPreparing(true)
    emitFormDebug('form:open-click', {
      currencyCode,
      tokenSymbol: displaySymbol,
      tokenDecimals: decimals ?? null,
      baseCurrencyCode,
      defaultBaseCurrencyAmount,
      depositAddress: depositAddress ?? null,
      walletConnected: Boolean(address),
    })
    try {
      const intent = await prepareOnRampIntent({
        currencyCode,
        baseCurrencyCode,
        baseCurrencyAmount: defaultBaseCurrencyAmount,
      })
      emitFormDebug('form:intent-ready', {
        transactionId: intent.transaction_id,
        externalTransactionId: intent.external_transaction_id ?? null,
      })
      setVisible(true)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to prepare MoonPay on-ramp')
      emitFormDebug('form:intent-error', {
        name: error.name,
        message: error.message,
      })
    } finally {
      setIsPreparing(false)
    }
  }, [
    address,
    baseCurrencyCode,
    blockReasons,
    canBuy,
    currencyCode,
    decimals,
    displaySymbol,
    defaultBaseCurrencyAmount,
    depositAddress,
    emitFormDebug,
    prepareOnRampIntent,
    status,
  ])

  const handleClose = useCallback(async () => {
    emitFormDebug('moonpay:onClose')
    setVisible(false)
    await handleWidgetClosed()
  }, [emitFormDebug, handleWidgetClosed])

  const handleCloseOverlay = useCallback(async () => {
    emitFormDebug('moonpay:onCloseOverlay')
    setVisible(false)
    await handleWidgetClosed()
  }, [emitFormDebug, handleWidgetClosed])

  const handleReady = useCallback(async () => {
    emitFormDebug('moonpay:onReady')
  }, [emitFormDebug])

  const widgetElement = useMoonPayBuyWidget({
    variant,
    visible,
    autoStart,
    canBuy,
    openWidget: handleOpen,
    refreshPending,
    theme,
    themeId,
    colorCode,
    baseCurrencyCode,
    baseCurrencyAmount: defaultBaseCurrencyAmount,
    lockAmount,
    paymentMethod,
    currencyCode,
    depositAddress,
    externalCustomerId: address?.toLowerCase(),
    externalTransactionId: activeIntentId,
    onClose: handleClose,
    onCloseOverlay: handleCloseOverlay,
    onReady: handleReady,
    onUrlSignatureRequested: signUrl,
    onTransactionCreated: handleTransactionCreated,
    onTransactionCompleted: handleTransactionCompleted,
  })

  // The embedded widget doesn't self-close on completion (the overlay does, which
  // is what surfaces the finality/verification status). Once the purchase settles,
  // hide it and refresh once so the pending/finality UI takes over.
  useEffect(() => {
    if (variant !== 'embedded' || !visible) return
    if (isVerifying || status === 'credited') {
      setVisible(false)
      void refreshPending()
    }
  }, [variant, visible, isVerifying, status, refreshPending])

  return (
    <div data-privana className="flex flex-col gap-4">
      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-foreground text-sm font-medium">Validating purchases</p>
          {pending.map((record) => {
            const progress = parseFinalityProgress(finalityProgress[record.transaction_id])
            const hasProgress = !!finalityProgress[record.transaction_id]
            const isStalled = !hasProgress && Date.now() / 1000 - (record.updated_at ?? 0) > 60
            const isActivelyVerifying = record.transaction_id === activeVerificationId
            const showRetry =
              rowError?.id === record.transaction_id || (isStalled && !isActivelyVerifying)
            return (
              <div
                key={record.transaction_id}
                className="border-border flex flex-col gap-1 rounded-md border p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    {progress ?? 'Verifying…'}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {record.quote_currency_amount ?? '?'} {displaySymbol}
                  </p>
                </div>
                {rowError?.id === record.transaction_id && (
                  <p className="text-destructive text-xs">{rowError.message}</p>
                )}
                {showRetry && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setRowError(null)
                      try {
                        await finishPendingVerification(record)
                      } catch (err) {
                        setRowError({
                          id: record.transaction_id,
                          message: err instanceof Error ? err.message : 'Verification failed',
                        })
                      }
                    }}
                  >
                    Retry
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {status === 'credited' && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CircleCheckIcon className="text-primary size-8" aria-hidden />
          <p className="text-foreground text-sm font-medium">Purchase credited</p>
          <p className="text-muted-foreground text-sm">
            Your {displaySymbol} deposit is now available in your balance.
          </p>
        </div>
      )}

      {autoStart ? (
        !visible && isPrePurchase && <Skeleton className="h-[656px] w-full rounded-md" />
      ) : isInitializing ? (
        <Skeleton className="h-9 w-full rounded-md" />
      ) : (
        <Button type="button" onClick={handleOpen} disabled={!canBuy}>
          {(isBusy || visible) && <Loader2 className="animate-spin" aria-hidden />}
          Buy
        </Button>
      )}

      {widgetElement}

      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error.message}
        </p>
      )}

      {isBelowMin && minFiatGate !== undefined && (
        <p className="text-destructive text-sm" role="alert">
          Minimum purchase is ~${minFiatGate.toFixed(2)}.
        </p>
      )}

      {isVerifying && pending.length === 0 && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Verifying your purchase…
        </p>
      )}
    </div>
  )
}

function parseFinalityProgress(message: string | undefined): string | null {
  if (!message) return null
  const match = message.match(/(\d+\/\d+)\s+confirmations/i)
  return match ? `${match[1]} confirmations` : null
}
