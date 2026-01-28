'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { AccountingClient } from '../client'
import type { Network } from '../types'
import {
  getApiUrl,
  type SupportedToken,
  type TokenConfig,
  getTokenConfig,
  SUPPORTED_TOKENS,
} from '../types'

export interface AccountingContextValue {
  client: AccountingClient
  network: Network
  enabledTokens: TokenConfig[]
  defaultToken: TokenConfig
  pollingInterval: number
}

const AccountingContext = createContext<AccountingContextValue | null>(null)

export interface AccountingProviderProps {
  network: Network
  children: ReactNode
  tokens?: SupportedToken[]
  baseUrl?: string
  pollingInterval?: number
}

export function AccountingProvider({
  network,
  children,
  tokens,
  baseUrl,
  pollingInterval = 10000,
}: AccountingProviderProps) {
  const apiUrl = baseUrl ?? getApiUrl(network)

  const enabledTokens = useMemo(() => {
    if (tokens && tokens.length > 0) {
      return tokens.map((t) => getTokenConfig(t))
    }
    return Object.values(SUPPORTED_TOKENS) as TokenConfig[]
  }, [tokens])

  const defaultToken = enabledTokens[0] as TokenConfig

  const value = useMemo<AccountingContextValue>(
    () => ({
      client: new AccountingClient({ baseUrl: apiUrl }),
      network,
      enabledTokens,
      defaultToken,
      pollingInterval,
    }),
    [apiUrl, network, enabledTokens, defaultToken, pollingInterval]
  )

  return <AccountingContext.Provider value={value}>{children}</AccountingContext.Provider>
}

export function useAccountingContext(): AccountingContextValue {
  const context = useContext(AccountingContext)
  if (!context) {
    throw new Error('useAccountingContext must be used within an AccountingProvider')
  }
  return context
}

export function useSafeAccountingContext(): AccountingContextValue | null {
  return useContext(AccountingContext)
}
