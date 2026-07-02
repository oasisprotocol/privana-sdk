import config from '@shared/config.json'

export type Address = `0x${string}`
export type Bytes32 = `0x${string}`
export type HexString = `0x${string}`
export type IntegerLike = string | number
// Mirrors backend protocol support for authorize URL construction.
// High-level hosted auth in the provider/hooks layer is intentionally redirect-only.
export type HostedAuthResponseMode = 'web_message' | 'redirect'

export type Network = keyof typeof config.networks

export interface NetworkConfig {
  chainId: number
  name: string
  accountingContract: Address
  apiUrl: string
  /** Versioned MoonPay REST API base URL (default: 'https://api.moonpay.com/v3'). */
  moonpayApiUrl?: string
  /**
   * MoonPay publishable API key ('pk_test_…' / 'pk_live_…' — MoonPay infers the
   * environment from the prefix). Enables the credit-card deposit flow: the SDK
   * mounts its own MoonPayProvider around the credit-card subtree, so consumers
   * don't wrap the app in one (and don't pay MoonPay's CDN script cost at app start).
   */
  moonpayApiKey?: string
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
