'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { FlexvaultsClient } from '../client'
import type { Network } from '../types'
import {
  getApiUrl,
  type SupportedToken,
  type TokenConfig,
  getTokenConfig,
  SUPPORTED_TOKENS,
} from '../types'

export interface FlexvaultsContextValue {
  client: FlexvaultsClient
  network: Network
  enabledTokens: TokenConfig[]
  defaultToken: TokenConfig
  pollingInterval: number
}

const FlexvaultsContext = createContext<FlexvaultsContextValue | null>(null)

export interface FlexvaultsProviderProps {
  network: Network
  children: ReactNode
  tokens?: SupportedToken[]
  baseUrl?: string
  pollingInterval?: number
}

export function FlexvaultsProvider({
  network,
  children,
  tokens,
  baseUrl,
  pollingInterval = 10000,
}: FlexvaultsProviderProps) {
  const apiUrl = baseUrl ?? getApiUrl(network)

  const enabledTokens = useMemo(() => {
    if (tokens && tokens.length > 0) {
      return tokens.map((t) => getTokenConfig(t))
    }
    return Object.values(SUPPORTED_TOKENS) as TokenConfig[]
  }, [tokens])

  const defaultToken = enabledTokens[0] as TokenConfig

  const value = useMemo<FlexvaultsContextValue>(
    () => ({
      client: new FlexvaultsClient({ baseUrl: apiUrl }),
      network,
      enabledTokens,
      defaultToken,
      pollingInterval,
    }),
    [apiUrl, network, enabledTokens, defaultToken, pollingInterval]
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
