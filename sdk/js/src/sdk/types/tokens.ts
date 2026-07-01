import type { Address, Bytes32 } from './common'

export interface TokenConfig {
  id: Bytes32
  symbol: string
  decimals: number
  contract: Address
  name: string
  chainId: number
  /**
   * MoonPay-specific currency identifier for the credit-card on-ramp, e.g.
   * 'usdc_base_sepolia'. Populated SDK-side until API returns it; `undefined` when the token isn't supported by MoonPay.
   */
  moonpayCurrencyCode?: string
}
