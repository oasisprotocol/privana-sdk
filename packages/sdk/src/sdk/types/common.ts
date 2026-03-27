import config from '@shared/config.json'

export type Address = `0x${string}`
export type Bytes32 = `0x${string}`
export type HexString = `0x${string}`
export type IntegerLike = string | number

export type Network = keyof typeof config.networks

export interface NetworkConfig {
  chainId: number
  name: string
  accountingContract: Address
  apiUrl: string
}

export const NETWORK_CONFIG = {
  testnet: {
    ...config.networks.testnet,
    accountingContract: config.networks.testnet.accountingContract as Address,
  },
  mainnet: {
    ...config.networks.mainnet,
    accountingContract: config.networks.mainnet.accountingContract as Address,
  },
} as const satisfies Record<Network, NetworkConfig>

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
