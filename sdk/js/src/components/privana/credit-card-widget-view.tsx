'use client'

import { useEffect, useRef, useState } from 'react'
import type { TokenConfig } from '@/sdk/types/tokens'
import type { Allowance } from '@/sdk/types/allowance'
import { FiatOnRampForm } from './fiat-on-ramp-form'

export function CreditCardWidgetView({
  token,
  amount,
  allowance,
}: {
  token: TokenConfig | undefined
  amount: string
  allowance?: Allowance
}) {
  // Consumed by the commented postDepositLock wiring below until the
  // deposit-lock-authorization branch lands.
  void allowance
  const moonpayCurrencyCode = token?.moonpayCurrencyCode
  const containerRef = useRef<HTMLDivElement>(null)
  const [widgetTheme, setWidgetTheme] = useState<'light' | 'dark'>()
  useEffect(() => {
    if (containerRef.current) setWidgetTheme(resolveSdkTheme(containerRef.current))
  }, [])

  return (
    <div ref={containerRef} className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      <h2 className="text-foreground text-[28px] leading-8 font-medium">Complete your purchase</h2>
      {token && moonpayCurrencyCode ? (
        <FiatOnRampForm
          tokenId={token.id}
          currencyCode={moonpayCurrencyCode}
          defaultBaseCurrencyAmount={amount || undefined}
          variant="embedded"
          autoStart
          theme={widgetTheme}
          // TODO: once the deposit-lock-authorization branch lands, FiatOnRampForm
          // gains a postDepositLock prop — useFiatOnRamp signs the policy right
          // after the on-ramp intent is created (intentId derived from the
          // transaction id, serviceAddress from the provider context) and attaches
          // it to the on-ramp record:
          // postDepositLock={
          //   allowance
          //     ? {
          //         maxAmount: BigInt(allowance.value),
          //         minAmount: allowance.minAmount ? BigInt(allowance.minAmount) : undefined,
          //         lockDuration: allowance.lockDuration
          //           ? BigInt(allowance.lockDuration)
          //           : undefined,
          //       }
          //     : undefined
          // }
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          {token?.symbol ?? 'This token'} isn’t available for card purchases yet.
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
