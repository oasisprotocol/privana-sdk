import type { Address, Bytes32 } from './common'
import config from '@shared/config.json'

export interface TokenConfig {
  id: Bytes32
  symbol: string
  decimals: number
  contract: Address
  name: string
}

type TokenId = (typeof config.tokens)[keyof typeof config.tokens]['id']

export type SupportedToken = TokenId

export const SUPPORTED_TOKENS: Record<string, TokenConfig> = Object.fromEntries(
  Object.values(config.tokens).map((t) => [
    t.id,
    {
      id: t.id as Bytes32,
      symbol: t.symbol,
      decimals: t.decimals,
      contract: t.contract as Address,
      name: t.name,
    },
  ])
)

export function getTokenConfig(tokenId: string): TokenConfig {
  const normalized = tokenId.toLowerCase()
  const token = Object.entries(SUPPORTED_TOKENS).find(
    ([id]) => id.toLowerCase() === normalized
  )?.[1]
  if (!token) throw new Error(`Unknown token ID: ${tokenId}`)
  return token
}

export function getTokenById(tokenId: string): TokenConfig | undefined {
  const normalized = tokenId.toLowerCase()
  return Object.entries(SUPPORTED_TOKENS).find(([id]) => id.toLowerCase() === normalized)?.[1]
}

export function isValidToken(tokenId: string): boolean {
  return (
    tokenId.toLowerCase() in
    Object.fromEntries(Object.keys(SUPPORTED_TOKENS).map((id) => [id.toLowerCase(), true]))
  )
}
