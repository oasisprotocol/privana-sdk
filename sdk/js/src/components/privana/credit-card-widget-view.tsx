'use client'

import type { TokenConfig } from '@/sdk/types/tokens'
import { FiatOnRampForm } from './fiat-on-ramp-form'

export function CreditCardWidgetView({
  token,
  amount,
}: {
  token: TokenConfig | undefined
  amount: string
}) {
  const moonpayCurrencyCode = token?.moonpayCurrencyCode

  return (
    <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      <h2 className="text-foreground text-[28px] leading-8 font-medium">Complete your purchase</h2>
      {token && moonpayCurrencyCode ? (
        <FiatOnRampForm
          tokenId={token.id}
          currencyCode={moonpayCurrencyCode}
          defaultBaseCurrencyAmount={amount || undefined}
          variant="embedded"
          autoStart
        />
      ) : (
        <p className="text-muted-foreground text-sm">
          {token?.symbol ?? 'This token'} isn’t available for card purchases yet.
        </p>
      )}
    </div>
  )
}
