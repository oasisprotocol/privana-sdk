import type { Address, Bytes32 } from './common'

export interface TokenConfig {
  id: Bytes32
  symbol: string
  decimals: number
  contract: Address
  name: string
}

export type SupportedToken = keyof typeof SUPPORTED_TOKENS

export const SUPPORTED_TOKENS = {
  USDC: {
    id: '0x618e9e14a65a5a02d0ed69d75255989098ebf6bb03a0eef18ca0baa7a144c872' as Bytes32,
    symbol: 'USDC',
    decimals: 18,
    contract: '0x12084E1A0fe92b5ab803a81A0Ae54D91040F89ca' as Address,
    name: 'USD Coin',
  },
  USDT: {
    id: '0x718e9e14a65a5a02d0ed69d75255989098ebf6bb03a0eef18ca0baa7a144c873' as Bytes32,
    symbol: 'USDT',
    decimals: 6,
    contract: '0x22084E1A0fe92b5ab803a81A0Ae54D91040F89cb' as Address,
    name: 'Tether USD',
  },
  WETH: {
    id: '0x818e9e14a65a5a02d0ed69d75255989098ebf6bb03a0eef18ca0baa7a144c874' as Bytes32,
    symbol: 'WETH',
    decimals: 18,
    contract: '0x32084E1A0fe92b5ab803a81A0Ae54D91040F89cc' as Address,
    name: 'Wrapped Ether',
  },
} as const satisfies Record<string, TokenConfig>

export function getTokenConfig(token: SupportedToken): TokenConfig {
  return SUPPORTED_TOKENS[token]
}

export function getTokenById(tokenId: Bytes32): TokenConfig | undefined {
  return Object.values(SUPPORTED_TOKENS).find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
}

export function isValidToken(token: string): token is SupportedToken {
  return token in SUPPORTED_TOKENS
}
