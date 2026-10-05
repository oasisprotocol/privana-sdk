'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { PrivanaClient } from '../client'
import type {
  Address,
  HostedAuthConfig,
  HostedAuthSession,
  NetworkConfig,
  OnRampConfig,
  TokenConfig,
} from '../types'
import type { ChainConfig } from '../types/chains'

// Kept apart from PrivanaProvider: hooks import the context from here, so the
// provider can render hook-backed children without an import cycle.

export type TokensStatus = 'loading' | 'ready' | 'error'

export interface PrivanaContextValue {
  client: PrivanaClient
  networkConfig: NetworkConfig
  /** Explicit product on-ramp selection. Undefined preserves legacy MoonPay behavior. */
  onRamp?: OnRampConfig
  enabledTokens: TokenConfig[]
  defaultToken: TokenConfig | undefined
  getTokenById: (id: string) => TokenConfig | undefined
  getChainById: (id: number) => ChainConfig | undefined
  chains: ChainConfig[]
  tokensStatus: TokensStatus
  tokensError?: Error
  pollingInterval: number
  serviceAddress?: Address
  serviceName?: string
  serviceIcon?: ReactNode
  hostedAuthConfig: HostedAuthConfig | null
  hostedAuthSession: HostedAuthSession | null
  setHostedAuthSession: (session: HostedAuthSession | null) => void
  clearHostedAuthSession: () => void
  refreshHostedAuthSession: () => Promise<HostedAuthSession>
}

export const PrivanaContext = createContext<PrivanaContextValue | null>(null)

export function usePrivanaContext(): PrivanaContextValue {
  const context = useContext(PrivanaContext)
  if (!context) {
    throw new Error('usePrivanaContext must be used within a PrivanaProvider')
  }
  return context
}

export function useSafePrivanaContext(): PrivanaContextValue | null {
  return useContext(PrivanaContext)
}
