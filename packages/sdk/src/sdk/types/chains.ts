import type { Bytes32, Address } from './common'
import type { TokenConfig } from './tokens'

export interface ChainConfig {
  id: number
  name: string
  tokens: TokenConfig[]
}

export const SUPPORTED_CHAINS: ChainConfig[] = [
  {
    id: 84532,
    name: 'Base Sepolia',
    tokens: [
      {
        id: '0x618e9e14a65a5a02d0ed69d75255989098ebf6bb03a0eef18ca0baa7a144c872' as Bytes32,
        symbol: 'USDC',
        decimals: 6,
        contract: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
        name: 'USD Coin',
      },
    ],
  },
]

export function getChainById(chainId: number): ChainConfig | undefined {
  return SUPPORTED_CHAINS.find((c) => c.id === chainId)
}

export function getAllTokens(): TokenConfig[] {
  return SUPPORTED_CHAINS.flatMap((chain) => chain.tokens)
}
