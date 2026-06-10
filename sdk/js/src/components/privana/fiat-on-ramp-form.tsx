'use client'

import { useCallback, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { formatUnits } from 'viem'
import { useAccount } from 'wagmi'
import { MoonPayBuyWidget } from '@moonpay/moonpay-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useFiatOnRamp, type FiatOnRampDebugEvent } from '@/sdk/hooks/use-fiat-on-ramp'
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
  /** Override the display symbol. Defaults to the resolved token's symbol, then `currencyCode`. */
  tokenSymbol?: string
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
  onCredited,
  onError,
  onDebugEvent,
}: FiatOnRampFormProps) {
  const { address } = useAccount()
  const [visible, setVisible] = useState(false)
  const [isPreparing, setIsPreparing] = useState(false)

  const {
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

  const isBusy =
    isPreparing ||
    status === 'awaiting-purchase' ||
    status === 'awaiting-delivery' ||
    status === 'verifying'
  const isInitializing = !!address && !depositAddress
  const blockReasons = useMemo(
    () =>
      [
        !address ? 'wallet-not-connected' : null,
        !depositAddress ? 'deposit-address-not-loaded' : null,
        isBusy ? `busy:${isPreparing ? 'preparing' : status}` : null,
        isBelowMin ? 'below-minimum' : null,
      ].filter((reason): reason is string => Boolean(reason)),
    [address, depositAddress, isBelowMin, isBusy, isPreparing, status]
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

  return (
    <div data-privana className="flex flex-col gap-4">
      {isInitializing ? (
        <Skeleton className="h-9 w-full rounded-md" />
      ) : (
        <Button type="button" onClick={handleOpen} disabled={!canBuy}>
          {isBusy && <Loader2 className="animate-spin" aria-hidden />}
          Buy
        </Button>
      )}

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
              {record.quote_currency_amount ?? '?'} {displaySymbol}
            </Button>
          ))}
        </div>
      )}

      {visible && depositAddress && activeIntentId && (
        <MoonPayBuyWidget
          variant="overlay"
          visible
          baseCurrencyCode={baseCurrencyCode}
          baseCurrencyAmount={defaultBaseCurrencyAmount}
          currencyCode={currencyCode}
          // MoonPay delivers directly to the Privana deposit address; the connected wallet is only used for SIWE auth and not involved in the on-chain transfer.
          walletAddress={depositAddress}
          externalCustomerId={address?.toLowerCase()}
          externalTransactionId={activeIntentId}
          onClose={handleClose}
          onCloseOverlay={handleCloseOverlay}
          onReady={handleReady}
          onUrlSignatureRequested={signUrl}
          onTransactionCreated={handleTransactionCreated}
          onTransactionCompleted={handleTransactionCompleted}
        />
      )}
    </div>
  )
}

