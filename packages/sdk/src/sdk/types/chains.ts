import config from '@shared/config.json'
import type { TokenConfig } from './tokens'
import { SUPPORTED_TOKENS } from './tokens'

export interface ChainConfig {
  id: number
  name: string
  explorerUrl: string
  tokens: TokenConfig[]
}

export const SUPPORTED_CHAINS: ChainConfig[] = config.chains.map((chain) => ({
  id: chain.id,
  name: chain.name,
  explorerUrl: chain.explorerUrl,
  tokens: chain.tokens.map((id) => SUPPORTED_TOKENS[id]).filter(Boolean),
}))

export function getChainById(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)
}

export function getExplorerAddressUrl(chainId: number, address: string): string | undefined {
  const chain = getChainById(chainId)
  if (!chain) return undefined
  return `${chain.explorerUrl}/address/${address}#tokentxns`
}

export function getAllTokens(): TokenConfig[] {
  return SUPPORTED_CHAINS.flatMap((chain) => chain.tokens)
}
