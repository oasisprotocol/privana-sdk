import config from '@shared/config.json'

export interface ChainConfig {
  id: number
  name: string
  explorerUrl: string
  explorerName: string
}

export const SUPPORTED_CHAINS: ChainConfig[] = config.chains.map((chain) => ({
  id: chain.id,
  name: chain.name,
  explorerUrl: chain.explorerUrl,
  explorerName: chain.explorerName,
}))

export function getChainById(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)
}

export function getExplorerLabel(chainId: number): string {
  const chain = getChainById(chainId)
  return `View on ${chain?.explorerName ?? 'Explorer'}`
}

export function getExplorerAddressUrl(chainId: number, address: string): string | undefined {
  const chain = getChainById(chainId)
  if (!chain) return undefined
  return `${chain.explorerUrl}/address/${address}#tokentxns`
}
