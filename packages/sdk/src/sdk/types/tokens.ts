import type { Address, Bytes32 } from './common'
import config from '@shared/config.json'

export interface TokenConfig {
  id: Bytes32
  symbol: string
  decimals: number
  contract: Address
  name: string
}

export type SupportedToken = keyof typeof config.tokens

export const SUPPORTED_TOKENS = Object.fromEntries(
  Object.entries(config.tokens).map(([key, t]) => [
    key,
    {
      id: t.id as Bytes32,
      symbol: t.symbol,
      decimals: t.decimals,
      contract: t.contract as Address,
      name: t.name,
    },
  ])
) as { [K in SupportedToken]: TokenConfig }

export function getTokenConfig(token: SupportedToken): TokenConfig {
  return SUPPORTED_TOKENS[token]
}

export function getTokenById(tokenId: Bytes32): TokenConfig | undefined {
  return Object.values(SUPPORTED_TOKENS).find((t) => t.id.toLowerCase() === tokenId.toLowerCase())
}

export function isValidToken(token: string): token is SupportedToken {
  return token in SUPPORTED_TOKENS
}
