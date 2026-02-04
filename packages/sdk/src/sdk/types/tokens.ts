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
    id: '0xc719650e9f4b0f27d956638c54518932ef9d15e720a1a2b2850250bcd0816514' as Bytes32,
    symbol: 'USDC',
    decimals: 6,
    contract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
    name: 'USD Coin',
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
