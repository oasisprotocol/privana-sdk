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
  // MoonPay sandbox blocks the network-specific `usdc_base_sepolia` in some regions,
  // so testnet uses the generic `usdc` code (what the /on-ramp preview signs with).
  // The value must also be present in the backend's MOONPAY_ALLOWED_CURRENCY_CODES.
  'USDC:84532': 'usdc', // Base Sepolia (sandbox)
}

export function resolveMoonpayCurrencyCode(symbol: string, chainId: number): string | undefined {
  return MOONPAY_CURRENCY_CODES[`${symbol.toUpperCase()}:${chainId}`]
}
