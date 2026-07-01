'use client'

import { useContext } from 'react'
import { useQuery } from '@tanstack/react-query'
import { MoonPayContext } from '@moonpay/moonpay-react'

export interface MoonpayLimits {
  /** Minimum fiat purchase for the currency/payment-method (fees included). */
  minBuyAmount: number | undefined
  /** Maximum fiat purchase for the currency/payment-method (fees included). */
  maxBuyAmount: number | undefined
}

export interface UseMoonpayLimitsOptions {
  /** MoonPay currency code, e.g. 'usdc'. */
  currencyCode?: string
  /** Fiat currency the limits are quoted in (default: 'usd'). */
  baseCurrencyCode?: string
  /** Payment method the limits apply to (default: 'credit_debit_card'). */
  paymentMethod?: string
  /** Skip the request when false (e.g. non credit-card flows). */
  enabled?: boolean
}

export interface UseMoonpayLimitsResult extends MoonpayLimits {
  isLoading: boolean
  error: Error | null
}

export function useMoonpayLimits({
  currencyCode,
  baseCurrencyCode = 'usd',
  paymentMethod = 'credit_debit_card',
  enabled = true,
}: UseMoonpayLimitsOptions): UseMoonpayLimitsResult {
  const { apiKey } = useContext(MoonPayContext) ?? {}
  const canFetch = enabled && !!apiKey && !!currencyCode

  const query = useQuery({
    queryKey: ['moonpay-limits', currencyCode, baseCurrencyCode, paymentMethod, apiKey],
    enabled: canFetch,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<MoonpayLimits> => {
      const params = new URLSearchParams({
        apiKey: apiKey as string,
        baseCurrencyCode,
        paymentMethod,
        areFeesIncluded: 'true',
      })
      const res = await fetch(
        `https://api.moonpay.com/v3/currencies/${currencyCode}/limits?${params.toString()}`
      )
      if (!res.ok) {
        throw new Error(`MoonPay limits request failed: ${res.status}`)
      }
      const data = (await res.json()) as {
        baseCurrency?: { minBuyAmount?: unknown; maxBuyAmount?: unknown }
      }
      const asNumber = (value: unknown): number | undefined =>
        typeof value === 'number' && Number.isFinite(value) ? value : undefined
      return {
        minBuyAmount: asNumber(data.baseCurrency?.minBuyAmount),
        maxBuyAmount: asNumber(data.baseCurrency?.maxBuyAmount),
      }
    },
  })

  return {
    minBuyAmount: query.data?.minBuyAmount,
    maxBuyAmount: query.data?.maxBuyAmount,
    isLoading: query.isLoading,
    error: (query.error as Error | null) ?? null,
  }
}
