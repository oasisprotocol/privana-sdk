/**
 * This belongs on the `/v1/accounting/tokens` API response alongside symbol/decimals
 * — delete this module once the backend returns `moonpay_currency_code` and read it
 * directly in the PrivanaProvider token mapping.
 *
 * Today MoonPay sandbox only ever delivers the MPT test token (ETH Sepolia), so that
 * is the single supported on-ramp token — keyed by token id, since the sandbox
 * delivery is tied to a specific token, not a symbol/chain.
 *
 * MoonPay's canonical list: https://api.moonpay.com/v3/currencies
 */
const MOONPAY_CURRENCY_CODE_BY_TOKEN_ID: Record<string, string> = {
  // Sandbox MPT test token (Ethereum Sepolia).
  '0xbd3a41ffd21be1cfcdca7a4e7755842a5b78c9443fb7ea008e6a7314f0caea87': 'usdc',
}

export function resolveMoonpayCurrencyCode(tokenId: string): string | undefined {
  return MOONPAY_CURRENCY_CODE_BY_TOKEN_ID[tokenId.toLowerCase()]
}
