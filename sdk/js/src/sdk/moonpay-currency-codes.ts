/**
 * token / MoonPay currency-code map.
 *
 * Until the backend adds `moonpay_currency_code` to that response, we derive it here
 * from symbol + chainId. Delete this module once the token API exposes the field
 * and read it directly in the PrivanaProvider token mapping.
 *
 * MoonPay's canonical list: https://api.moonpay.com/v3/currencies
 */
const MOONPAY_CURRENCY_CODES: Record<string, string> = {
  'USDC:8453': 'usdc_base', // Base mainnet
  'USDC:84532': 'usdc_base_sepolia', // Base Sepolia (sandbox)
}

export function resolveMoonpayCurrencyCode(symbol: string, chainId: number): string | undefined {
  return MOONPAY_CURRENCY_CODES[`${symbol.toUpperCase()}:${chainId}`]
}
