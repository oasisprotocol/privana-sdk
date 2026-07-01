'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  // MoonPay's overlayNode wants a Node, not React.
  const overlayNode = useMemo(
    () => (variant === 'overlay' ? buildOverlayNode() : undefined),
    [variant]
  )

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

  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (!autoStart || autoStartedRef.current || !canBuy) return
    autoStartedRef.current = true
    void handleOpen()
  }, [autoStart, canBuy, handleOpen])

  // MoonPayBuyWidget rebuilds its internal config from the raw props object on
  // every render (its useMemo keys on `props`), and its useSdk effect closes and
  // re-inits the iframe whenever that config changes — so ANY re-render of this
  // form restarts the checkout. Freeze the element: callbacks go through a ref
  // and the element is memoized on data props only.
  const widgetCallbacksRef = useRef({
    handleClose,
    handleCloseOverlay,
    handleReady,
    signUrl,
    handleTransactionCreated,
    handleTransactionCompleted,
  })
  useEffect(() => {
    widgetCallbacksRef.current = {
      handleClose,
      handleCloseOverlay,
      handleReady,
      signUrl,
      handleTransactionCreated,
      handleTransactionCompleted,
    }
  })
  const widgetElement = useMemo(() => {
    if (!visible || !depositAddress || !activeIntentId) return null
    return (
      <MoonPayBuyWidget
        variant={variant}
        visible
        theme={theme}
        themeId={themeId}
        colorCode={colorCode}
        overlayNode={overlayNode}
        baseCurrencyCode={baseCurrencyCode}
        baseCurrencyAmount={defaultBaseCurrencyAmount}
        lockAmount={lockAmount ? 'true' : undefined}
        paymentMethod={paymentMethod}
        currencyCode={currencyCode}
        // MoonPay delivers directly to the Privana deposit address; the connected wallet is only used for SIWE auth and not involved in the on-chain transfer.
        walletAddress={depositAddress}
        externalCustomerId={address?.toLowerCase()}
        externalTransactionId={activeIntentId}
        onClose={() => widgetCallbacksRef.current.handleClose()}
        onCloseOverlay={() => widgetCallbacksRef.current.handleCloseOverlay()}
        onReady={() => widgetCallbacksRef.current.handleReady()}
        onUrlSignatureRequested={(url) => widgetCallbacksRef.current.signUrl(url)}
        onTransactionCreated={(props) => widgetCallbacksRef.current.handleTransactionCreated(props)}
        onTransactionCompleted={(props) =>
          widgetCallbacksRef.current.handleTransactionCompleted(props)
        }
      />
    )
  }, [
    visible,
    depositAddress,
    activeIntentId,
    variant,
    theme,
    themeId,
    colorCode,
    overlayNode,
    baseCurrencyCode,
    defaultBaseCurrencyAmount,
    lockAmount,
    paymentMethod,
    currencyCode,
    address,
  ])

  // The embedded iframe doesn't reliably deliver onTransactionCompleted (the
  // overlay flow also has onClose as a fallback trigger; embedded has neither),
  // so poll pending while the widget is open. Once the MoonPay webhook lands
  // the row surfaces in `pending` and verification auto-starts from the hook.
  useEffect(() => {
    if (variant !== 'embedded' || !visible) return
    const id = setInterval(() => void refreshPending(), 5_000)
    return () => clearInterval(id)
  }, [variant, visible, refreshPending])

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
          <p className="text-sm font-medium">Validating purchases</p>
          {pending.map((record) => {
            const progress = parseFinalityProgress(finalityProgress[record.transaction_id])
            const hasProgress = !!finalityProgress[record.transaction_id]
            const isStalled = !hasProgress && Date.now() / 1000 - (record.updated_at ?? 0) > 60
            const showRetry = rowError?.id === record.transaction_id || isStalled
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

function buildOverlayNode(): HTMLDivElement | undefined {
  if (typeof document === 'undefined') return undefined
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px'
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="139" height="20.61" viewBox="0 0 139 20.61"><path d="M15.08,20.61L10.49,20.61L10.49,0.00L17.96,0.00L18.81,0.02L19.62,0.10L20.38,0.22L21.11,0.39L21.79,0.60L22.43,0.87L23.03,1.18L23.58,1.53L24.08,1.92L24.53,2.35L24.93,2.82L25.29,3.33L25.59,3.88L25.84,4.47L26.03,5.09L26.17,5.75L26.25,6.44L26.28,7.17L26.28,7.17L26.28,7.62L26.25,8.33L26.17,9.01L26.03,9.66L25.84,10.27L25.59,10.86L25.29,11.41L24.93,11.93L24.53,12.40L24.08,12.83L23.58,13.23L23.03,13.58L22.43,13.89L21.79,14.15L21.11,14.37L20.38,14.54L19.62,14.66L18.81,14.73L17.96,14.76L17.96,14.76L15.08,14.76L15.08,20.61ZM18.19,3.98L15.08,3.98L15.08,10.78L18.19,10.78L18.53,10.77L18.87,10.73L19.18,10.68L19.48,10.59L19.76,10.49L20.02,10.36L20.27,10.21L20.50,10.04L20.70,9.85L20.89,9.64L21.06,9.42L21.21,9.17L21.34,8.91L21.45,8.63L21.53,8.34L21.59,8.04L21.62,7.72L21.63,7.39L21.63,7.39L21.62,7.05L21.59,6.72L21.53,6.40L21.45,6.10L21.34,5.82L21.21,5.56L21.06,5.31L20.89,5.09L20.70,4.88L20.50,4.69L20.27,4.53L20.02,4.38L19.76,4.26L19.48,4.16L19.18,4.08L18.87,4.02L18.53,3.99L18.19,3.98L18.19,3.98ZM31.76,20.61L27.16,20.61L27.16,0.00L35.20,0.00L36.03,0.02L36.82,0.09L37.58,0.19L38.30,0.34L38.98,0.53L39.62,0.77L40.23,1.05L40.78,1.37L41.28,1.73L41.74,2.13L42.15,2.57L42.51,3.05L42.82,3.58L43.07,4.15L43.26,4.76L43.40,5.42L43.49,6.12L43.52,6.86L43.52,6.86L43.52,7.31L43.49,8.04L43.40,8.73L43.26,9.38L43.07,9.98L42.82,10.54L42.51,11.06L42.51,11.06L42.15,11.53L41.75,11.97L41.30,12.36L40.80,12.72L40.26,13.03L39.68,13.30L39.68,13.30L44.89,20.61L39.57,20.61L35.12,14.06L31.76,14.06L31.76,20.61ZM35.56,3.89L31.76,3.89L31.76,10.44L35.56,10.44L35.89,10.43L36.21,10.40L36.51,10.34L36.79,10.26L37.06,10.16L37.31,10.04L37.55,9.89L37.77,9.73L37.97,9.55L38.15,9.35L38.32,9.13L38.46,8.89L38.59,8.64L38.69,8.37L38.77,8.09L38.82,7.79L38.86,7.49L38.87,7.17L38.86,6.85L38.82,6.54L38.77,6.25L38.69,5.97L38.59,5.70L38.46,5.45L38.32,5.21L38.15,4.99L37.97,4.79L37.77,4.61L37.55,4.44L37.31,4.30L37.06,4.17L36.79,4.07L36.51,3.99L36.21,3.94L35.89,3.90L35.56,3.89L35.56,3.89ZM50.25,20.61L45.66,20.61L45.66,0.17L50.25,0.17L50.25,20.61ZM64.88,20.61L57.41,20.61L51.19,0.17L55.92,0.17L60.71,16.88L61.66,16.88L66.09,0.17L70.68,0.17L64.88,20.61ZM71.44,20.61L66.85,20.61L73.60,0.17L81.02,0.17L88.02,20.61L83.26,20.61L81.61,15.54L73.07,15.54L71.44,20.61ZM74.27,11.73L80.35,11.73L77.80,3.92L76.76,3.92L74.27,11.73ZM92.94,20.61L88.68,20.61L88.68,0.17L96.21,0.17L103.91,16.88L104.30,16.88L104.30,0.17L108.62,0.17L108.62,20.61L101.03,20.61L93.33,3.89L92.94,3.89L92.94,20.61ZM113.87,20.61L109.28,20.61L116.02,0.17L123.44,0.17L130.44,20.61L125.68,20.61L124.03,15.54L115.49,15.54L113.87,20.61ZM116.70,11.73L122.77,11.73L120.22,3.92L119.19,3.92L116.70,11.73Z" fill="#ffffff"/></svg><span>Your secure checkout is loading</span>`
  return wrap
}
