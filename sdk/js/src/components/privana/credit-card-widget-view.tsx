'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { TokenConfig } from '@/sdk/types/tokens'
import type { Allowance } from '@/sdk/types/allowance'
import type { PostDepositLockError } from '@/sdk/hooks/pending-lock'
import type { ProductOnRampSelection } from '@/sdk/on-ramp/product-config'
import type { Address } from '@/sdk/types'
import { FiatOnRampForm } from './fiat-on-ramp-form'
import { TransakCardWidgetView } from './transak-card-widget-view'

export function CreditCardWidgetView({
  token,
  onRamp,
  amount,
  allowance,
  lockServiceAddress,
  onCredited,
  onLockSubmitted,
  onLockFailed,
  onLeave,
  onUnsafeToCloseChange,
  onActiveFlowChange,
}: {
  token: TokenConfig | undefined
  onRamp: ProductOnRampSelection
  amount: string
  allowance?: Allowance
  lockServiceAddress?: Address
  onCredited?: () => void
  onLockSubmitted?: () => void
  onLockFailed?: (error: PostDepositLockError) => void
  onLeave?: () => void
  onUnsafeToCloseChange?: (unsafe: boolean) => void
  onActiveFlowChange?: (active: boolean) => void
}) {
  if (onRamp.unavailableReason || !token || !onRamp.provider || !onRamp.providerAssetCode) {
    return (
      <div className="bg-muted flex flex-col gap-2 rounded-[10px] p-5">
        <h2 className="text-foreground text-[28px] leading-8 font-medium">
          Card purchases unavailable
        </h2>
        <p className="text-destructive text-sm">
          {onRamp.unavailableReason ?? 'The card on-ramp is not configured for this token.'}
        </p>
      </div>
    )
  }

  return (
    <ProductOnRampProviderBranch
      provider={onRamp.provider}
      moonpay={
        <MoonPayCardWidgetView
          token={token}
          amount={amount}
          allowance={allowance}
          lockServiceAddress={lockServiceAddress}
          onCredited={onCredited}
          onLockSubmitted={onLockSubmitted}
          onLockFailed={onLockFailed}
          onLeaveFlow={onLeave}
          onUnsafeToCloseChange={onUnsafeToCloseChange}
          onActiveFlowChange={onActiveFlowChange}
        />
      }
      transak={
        <TransakCardWidgetView
          token={token}
          providerAssetCode={onRamp.providerAssetCode}
          amount={amount}
          allowance={allowance}
          lockServiceAddress={lockServiceAddress}
          onCredited={onCredited}
          onLockSubmitted={onLockSubmitted}
          onLockFailed={onLockFailed}
          onLeave={onLeave}
          onUnsafeToCloseChange={onUnsafeToCloseChange}
          onActiveFlowChange={onActiveFlowChange}
        />
      }
    />
  )
}

/** The deliberately direct product branch. It has no runtime provider registry. */
export function ProductOnRampProviderBranch({
  provider,
  moonpay,
  transak,
}: {
  provider: 'moonpay' | 'transak'
  moonpay: ReactNode
  transak: ReactNode
}) {
  return provider === 'transak' ? transak : moonpay
}

function MoonPayCardWidgetView({
  token,
  amount,
  allowance,
  lockServiceAddress,
  onCredited,
  onLockSubmitted,
  onLockFailed,
  onLeaveFlow,
  onUnsafeToCloseChange,
  onActiveFlowChange,
}: {
  token: TokenConfig
  amount: string
  allowance?: Allowance
  lockServiceAddress?: Address
  onCredited?: () => void
  onLockSubmitted?: () => void
  onLockFailed?: (error: PostDepositLockError) => void
  onLeaveFlow?: () => void
  onUnsafeToCloseChange?: (unsafe: boolean) => void
  onActiveFlowChange?: (active: boolean) => void
}) {
  const moonpayCurrencyCode = token.moonpayCurrencyCode
  const containerRef = useRef<HTMLDivElement>(null)
  const [widgetTheme, setWidgetTheme] = useState<'light' | 'dark'>()
  useEffect(() => {
    if (containerRef.current) setWidgetTheme(resolveSdkTheme(containerRef.current))
  }, [])

  return (
    <div ref={containerRef} className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      <h2 className="text-foreground text-[28px] leading-8 font-medium">Complete your purchase</h2>
      {moonpayCurrencyCode ? (
        <FiatOnRampForm
          tokenId={token.id}
          frozenToken={token}
          currencyCode={moonpayCurrencyCode}
          // The user typed a crypto amount — quote-driven so MoonPay targets
          // it as the delivery amount, locked inside the widget.
          quoteCurrencyAmount={amount || undefined}
          lockAmount
          variant="embedded"
          autoStart
          theme={widgetTheme}
          onlyRouteActiveIntentCallbacks
          onUnsafeToCloseChange={onUnsafeToCloseChange}
          onActiveFlowChange={onActiveFlowChange}
          postDepositLock={
            allowance
              ? {
                  serviceAddress: lockServiceAddress,
                  maxAmount: BigInt(allowance.value),
                  lockDuration: allowance.lockDuration,
                }
              : undefined
          }
          onCredited={onCredited}
          onLockSubmitted={onLockSubmitted}
          onLockFailed={onLockFailed}
          onLeaveFlow={onLeaveFlow}
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          {token.symbol} isn’t available for card purchases yet.
        </p>
      )}
    </div>
  )
}

function resolveSdkTheme(el: HTMLElement): 'light' | 'dark' {
  const scheme = getComputedStyle(el).colorScheme
  if (scheme === 'dark') return 'dark'
  if (scheme === 'light') return 'light'
  return el.closest('.dark') ? 'dark' : 'light'
}
