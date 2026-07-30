'use client'

import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { MoonPayBuyWidget } from '@moonpay/moonpay-react'
import { moonPayOnRampAdapter } from '@/sdk/on-ramp/moonpay-adapter'
import { MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS } from '@/sdk/on-ramp/recovery'

type MoonPayBuyWidgetProps = Parameters<typeof MoonPayBuyWidget>[0]

export interface UseMoonPayOnRampAdapterOptions {
  variant: 'overlay' | 'embedded'
  visible: boolean
  autoStart: boolean
  canBuy: boolean
  /** Prepares the on-ramp intent and flips `visible` on success. */
  openWidget: () => Promise<void>
  /** Poll only until the shared delivery poll takes ownership. */
  shouldPollPending: boolean
  refreshPending: () => Promise<void>
  theme?: 'light' | 'dark'
  themeId?: string
  colorCode?: string
  baseCurrencyCode: string
  baseCurrencyAmount: string
  /**
   * Exact crypto amount the purchase should deliver. Takes precedence over
   * `baseCurrencyAmount` inside MoonPay — the widget derives the fiat total
   * (including fees) so the delivered amount matches the quote.
   */
  quoteCurrencyAmount?: string
  lockAmount?: boolean
  paymentMethod?: string
  currencyCode: string
  /** MoonPay delivery target — the Privana deposit address, NOT the connected wallet. */
  depositAddress: `0x${string}` | undefined
  /** Connected wallet address; only used for SIWE auth, not the on-chain transfer. */
  externalCustomerId: string | undefined
  externalTransactionId: string | null
  onClose: () => Promise<void>
  onCloseOverlay: () => Promise<void>
  onReady: () => Promise<void>
  onUrlSignatureRequested: (url: string) => Promise<string>
  onTransactionCreated: NonNullable<MoonPayBuyWidgetProps['onTransactionCreated']>
  onTransactionCompleted: NonNullable<MoonPayBuyWidgetProps['onTransactionCompleted']>
}

/**
 * Thin MoonPay launch-UI adapter. It contains the widget quirks and returns the widget element:
 *
 * - MoonPayBuyWidget rebuilds its internal config from the raw props object on
 *   every render (its useMemo keys on `props`), and its useSdk effect closes and
 *   re-inits the iframe whenever that config changes — so ANY re-render of the
 *   host component restarts the checkout. The element is therefore memoized on
 *   data props only, with callbacks routed through a ref.
 * - The embedded iframe doesn't reliably deliver onTransactionCompleted (the
 *   overlay flow also has onClose as a fallback trigger; embedded has neither),
 *   so provider reads are polled while the widget is open — once a completed
 *   order is visible, it surfaces in `pending` and verification auto-starts.
 * - `autoStart` opens the widget once, as soon as the flow allows it.
 */
export function useMoonPayOnRampAdapter({
  variant,
  visible,
  autoStart,
  canBuy,
  openWidget,
  shouldPollPending,
  refreshPending,
  theme,
  themeId,
  colorCode,
  baseCurrencyCode,
  baseCurrencyAmount,
  quoteCurrencyAmount,
  lockAmount,
  paymentMethod,
  currencyCode,
  depositAddress,
  externalCustomerId,
  externalTransactionId,
  onClose,
  onCloseOverlay,
  onReady,
  onUrlSignatureRequested,
  onTransactionCreated,
  onTransactionCompleted,
}: UseMoonPayOnRampAdapterOptions): ReactNode {
  const autoStartedRef = useRef(false)
  useEffect(() => {
    if (!autoStart || autoStartedRef.current || !canBuy) return
    autoStartedRef.current = true
    void openWidget()
  }, [autoStart, canBuy, openWidget])

  useEffect(() => {
    if (
      !moonPayOnRampAdapter.pollPendingWhileOpen ||
      variant !== 'embedded' ||
      !visible ||
      !shouldPollPending
    ) {
      return
    }
    const id = setInterval(() => void refreshPending(), MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS)
    return () => clearInterval(id)
  }, [variant, visible, shouldPollPending, refreshPending])

  const callbacksRef = useRef({
    onClose,
    onCloseOverlay,
    onReady,
    onUrlSignatureRequested,
    onTransactionCreated,
    onTransactionCompleted,
  })
  useEffect(() => {
    callbacksRef.current = {
      onClose,
      onCloseOverlay,
      onReady,
      onUrlSignatureRequested,
      onTransactionCreated,
      onTransactionCompleted,
    }
  })

  // MoonPay's overlayNode wants a Node, not React.
  const overlayNode = useMemo(
    () => (variant === 'overlay' ? buildOverlayNode() : undefined),
    [variant]
  )

  return useMemo(() => {
    if (!visible || !depositAddress || !externalTransactionId) return null
    return (
      <MoonPayBuyWidget
        variant={variant}
        visible
        theme={theme}
        themeId={themeId}
        colorCode={colorCode}
        overlayNode={overlayNode}
        baseCurrencyCode={baseCurrencyCode}
        baseCurrencyAmount={baseCurrencyAmount}
        quoteCurrencyAmount={quoteCurrencyAmount}
        lockAmount={lockAmount ? 'true' : undefined}
        paymentMethod={paymentMethod}
        currencyCode={currencyCode}
        walletAddress={depositAddress}
        externalCustomerId={externalCustomerId}
        externalTransactionId={externalTransactionId}
        onClose={() => callbacksRef.current.onClose()}
        onCloseOverlay={() => callbacksRef.current.onCloseOverlay()}
        onReady={() => callbacksRef.current.onReady()}
        onUrlSignatureRequested={(url) => callbacksRef.current.onUrlSignatureRequested(url)}
        onTransactionCreated={(props) => callbacksRef.current.onTransactionCreated(props)}
        onTransactionCompleted={(props) => callbacksRef.current.onTransactionCompleted(props)}
      />
    )
  }, [
    visible,
    depositAddress,
    externalTransactionId,
    variant,
    theme,
    themeId,
    colorCode,
    overlayNode,
    baseCurrencyCode,
    baseCurrencyAmount,
    quoteCurrencyAmount,
    lockAmount,
    paymentMethod,
    currencyCode,
    externalCustomerId,
  ])
}

function buildOverlayNode(): HTMLDivElement | undefined {
  if (typeof document === 'undefined') return undefined
  const wrap = document.createElement('div')
  wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px'
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="139" height="20.61" viewBox="0 0 139 20.61"><path d="M15.08,20.61L10.49,20.61L10.49,0.00L17.96,0.00L18.81,0.02L19.62,0.10L20.38,0.22L21.11,0.39L21.79,0.60L22.43,0.87L23.03,1.18L23.58,1.53L24.08,1.92L24.53,2.35L24.93,2.82L25.29,3.33L25.59,3.88L25.84,4.47L26.03,5.09L26.17,5.75L26.25,6.44L26.28,7.17L26.28,7.17L26.28,7.62L26.25,8.33L26.17,9.01L26.03,9.66L25.84,10.27L25.59,10.86L25.29,11.41L24.93,11.93L24.53,12.40L24.08,12.83L23.58,13.23L23.03,13.58L22.43,13.89L21.79,14.15L21.11,14.37L20.38,14.54L19.62,14.66L18.81,14.73L17.96,14.76L17.96,14.76L15.08,14.76L15.08,20.61ZM18.19,3.98L15.08,3.98L15.08,10.78L18.19,10.78L18.53,10.77L18.87,10.73L19.18,10.68L19.48,10.59L19.76,10.49L20.02,10.36L20.27,10.21L20.50,10.04L20.70,9.85L20.89,9.64L21.06,9.42L21.21,9.17L21.34,8.91L21.45,8.63L21.53,8.34L21.59,8.04L21.62,7.72L21.63,7.39L21.63,7.39L21.62,7.05L21.59,6.72L21.53,6.40L21.45,6.10L21.34,5.82L21.21,5.56L21.06,5.31L20.89,5.09L20.70,4.88L20.50,4.69L20.27,4.53L20.02,4.38L19.76,4.26L19.48,4.16L19.18,4.08L18.87,4.02L18.53,3.99L18.19,3.98L18.19,3.98ZM31.76,20.61L27.16,20.61L27.16,0.00L35.20,0.00L36.03,0.02L36.82,0.09L37.58,0.19L38.30,0.34L38.98,0.53L39.62,0.77L40.23,1.05L40.78,1.37L41.28,1.73L41.74,2.13L42.15,2.57L42.51,3.05L42.82,3.58L43.07,4.15L43.26,4.76L43.40,5.42L43.49,6.12L43.52,6.86L43.52,6.86L43.52,7.31L43.49,8.04L43.40,8.73L43.26,9.38L43.07,9.98L42.82,10.54L42.51,11.06L42.51,11.06L42.15,11.53L41.75,11.97L41.30,12.36L40.80,12.72L40.26,13.03L39.68,13.30L39.68,13.30L44.89,20.61L39.57,20.61L35.12,14.06L31.76,14.06L31.76,20.61ZM35.56,3.89L31.76,3.89L31.76,10.44L35.56,10.44L35.89,10.43L36.21,10.40L36.51,10.34L36.79,10.26L37.06,10.16L37.31,10.04L37.55,9.89L37.77,9.73L37.97,9.55L38.15,9.35L38.32,9.13L38.46,8.89L38.59,8.64L38.69,8.37L38.77,8.09L38.82,7.79L38.86,7.49L38.87,7.17L38.86,6.85L38.82,6.54L38.77,6.25L38.69,5.97L38.59,5.70L38.46,5.45L38.32,5.21L38.15,4.99L37.97,4.79L37.77,4.61L37.55,4.44L37.31,4.30L37.06,4.17L36.79,4.07L36.51,3.99L36.21,3.94L35.89,3.90L35.56,3.89L35.56,3.89ZM50.25,20.61L45.66,20.61L45.66,0.17L50.25,0.17L50.25,20.61ZM64.88,20.61L57.41,20.61L51.19,0.17L55.92,0.17L60.71,16.88L61.66,16.88L66.09,0.17L70.68,0.17L64.88,20.61ZM71.44,20.61L66.85,20.61L73.60,0.17L81.02,0.17L88.02,20.61L83.26,20.61L81.61,15.54L73.07,15.54L71.44,20.61ZM74.27,11.73L80.35,11.73L77.80,3.92L76.76,3.92L74.27,11.73ZM92.94,20.61L88.68,20.61L88.68,0.17L96.21,0.17L103.91,16.88L104.30,16.88L104.30,0.17L108.62,0.17L108.62,20.61L101.03,20.61L93.33,3.89L92.94,3.89L92.94,20.61ZM113.87,20.61L109.28,20.61L116.02,0.17L123.44,0.17L130.44,20.61L125.68,20.61L124.03,15.54L115.49,15.54L113.87,20.61ZM116.70,11.73L122.77,11.73L120.22,3.92L119.19,3.92L116.70,11.73Z" fill="#ffffff"/></svg><span>Your secure checkout is loading</span>`
  return wrap
}
