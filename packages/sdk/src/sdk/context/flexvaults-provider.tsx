'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { FlexvaultsClient } from '../client'
import type { Address, NetworkConfig } from '../types'
import {
  NETWORK_CONFIG,
  type TokenConfig,
  getTokenById,
  SUPPORTED_TOKENS,
} from '../types'

export interface FlexvaultsContextValue {
  client: FlexvaultsClient
  networkConfig: NetworkConfig
  enabledTokens: TokenConfig[]
  defaultToken: TokenConfig
  pollingInterval: number
  serviceAddress?: Address
}

const FlexvaultsContext = createContext<FlexvaultsContextValue | null>(null)

/**
 * Default network configuration (testnet).
 */
const DEFAULT_NETWORK_CONFIG = NETWORK_CONFIG.testnet

export interface FlexvaultsProviderProps {
  children: ReactNode
  /**
   * Network configuration including chainId, accountingContract, apiUrl, and name.
   * Defaults to testnet config. Partial overrides are merged with defaults.
   */
  networkConfig?: Partial<NetworkConfig>
  tokens?: string[]
  pollingInterval?: number
  /**
   * The service address for lock operations.
   */
  serviceAddress?: Address
}

export function FlexvaultsProvider({
  children,
  networkConfig: networkConfigOverride,
  tokens,
  pollingInterval = 10000,
  serviceAddress,
}: FlexvaultsProviderProps) {
  const networkConfig = useMemo<NetworkConfig>(() => {
    const config: NetworkConfig = {
      ...DEFAULT_NETWORK_CONFIG,
      ...networkConfigOverride,
    }

    // Validate that critical fields are present and valid
    if (!config.chainId || config.chainId <= 0) {
      throw new Error('FlexvaultsProvider: networkConfig.chainId must be a positive number')
    }
    if (!config.accountingContract || !config.accountingContract.startsWith('0x')) {
      throw new Error(
        'FlexvaultsProvider: networkConfig.accountingContract must be a valid address'
      )
    }
    if (!config.apiUrl) {
      throw new Error('FlexvaultsProvider: networkConfig.apiUrl must be provided')
    }

    return config
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Use individual properties for stable memoization
  }, [
    networkConfigOverride?.chainId,
    networkConfigOverride?.name,
    networkConfigOverride?.accountingContract,
    networkConfigOverride?.apiUrl,
  ])

  const enabledTokens = useMemo(() => {
    if (tokens && tokens.length > 0) {
      return tokens
        .map((id) => getTokenById(id as `0x${string}`))
        .filter((t): t is TokenConfig => t !== undefined)
    }
    return Object.values(SUPPORTED_TOKENS) as TokenConfig[]
  }, [tokens])

  const defaultToken = enabledTokens[0] as TokenConfig

  const value = useMemo<FlexvaultsContextValue>(
    () => ({
      client: new FlexvaultsClient({ baseUrl: networkConfig.apiUrl }),
      networkConfig,
      enabledTokens,
      defaultToken,
      pollingInterval,
      serviceAddress,
    }),
    [networkConfig, enabledTokens, defaultToken, pollingInterval, serviceAddress]
  )

  return <FlexvaultsContext.Provider value={value}>{children}</FlexvaultsContext.Provider>
}

export function useFlexvaultsContext(): FlexvaultsContextValue {
  const context = useContext(FlexvaultsContext)
  if (!context) {
    throw new Error('useFlexvaultsContext must be used within a FlexvaultsProvider')
  }
  return context
}

export function useSafeFlexvaultsContext(): FlexvaultsContextValue | null {
  return useContext(FlexvaultsContext)
}
