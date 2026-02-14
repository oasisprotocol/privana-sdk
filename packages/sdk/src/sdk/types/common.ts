export type Address = `0x${string}`
export type Bytes32 = `0x${string}`
export type HexString = `0x${string}`

export type Network = 'testnet' | 'mainnet'

export interface NetworkConfig {
  chainId: number
  name: string
  accountingContract: Address
  apiUrl: string
}

export const NETWORK_CONFIG: Record<Network, NetworkConfig> = {
  testnet: {
    chainId: 23295,
    name: 'Sapphire Testnet',
    accountingContract: '0xAb32613F406e0017B5d7D8dd7fCb6d2503A2e40c',
    apiUrl: 'https://p8000.m1356.opf-testnet-rofl-25.rofl.app',
  },
  mainnet: {
    chainId: 23294,
    name: 'Sapphire Mainnet',
    accountingContract: '0x0000000000000000000000000000000000000000',
    apiUrl: '',
  },
} as const

export function getChainId(network: Network): number {
  return NETWORK_CONFIG[network].chainId
}

export function getAccountingContract(network: Network): Address {
  return NETWORK_CONFIG[network].accountingContract
}

export function getApiUrl(network: Network): string {
  return NETWORK_CONFIG[network].apiUrl
}

export function normalizeHex(value: string): HexString {
  const normalized = value.trim().toLowerCase()
  return (normalized.startsWith('0x') ? normalized : `0x${normalized}`) as HexString
}

export function normalizeAddress(value: string): Address {
  return normalizeHex(value) as Address
}
