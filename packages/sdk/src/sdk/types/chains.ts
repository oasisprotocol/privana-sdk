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
        id: '0xc719650e9f4b0f27d956638c54518932ef9d15e720a1a2b2850250bcd0816514' as Bytes32,
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
