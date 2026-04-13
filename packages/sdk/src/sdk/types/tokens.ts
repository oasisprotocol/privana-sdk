import type { Address, Bytes32 } from './common'

export interface TokenConfig {
  id: Bytes32
  symbol: string
  decimals: number
  contract: Address
  name: string
  chainId: number
}
