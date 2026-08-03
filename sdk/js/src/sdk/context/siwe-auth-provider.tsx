'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { PrivanaClient } from '../client'
import type { NetworkConfig } from '../types'
import { createSiweAuthStorageKey } from '../auth/siwe-persistence'
import { useSiweAuthLifecycle } from '../hooks/use-siwe-auth-lifecycle'
import type { SiweAuthSession, SiweAuthTokens } from '../auth/auth-lifecycle-effects'

export type { SiweAuthSession, SiweAuthTokens }

export interface SiweAuthContextValue {
  isAuthenticated: boolean
  isLoading: boolean
  error: Error | null
  session: SiweAuthSession | null
  accessToken: string | undefined
  tokens: SiweAuthTokens | null
  login: () => Promise<void>
  logout: () => Promise<void>
}

const SiweAuthContext = createContext<SiweAuthContextValue | null>(null)

export type SiweAuthConfig =
  | boolean
  | {
      autoLogin?: boolean
      persistJwt?: boolean
    }

export interface SiweAuthProviderProps {
  children: ReactNode
  client: PrivanaClient
  networkConfig: NetworkConfig
  autoLogin?: boolean
  persistJwt?: boolean
}

export function SiweAuthProvider({
  children,
  client,
  networkConfig,
  autoLogin = true,
  persistJwt = false,
}: SiweAuthProviderProps) {
  const storageKey = useMemo(
    () => createSiweAuthStorageKey(networkConfig.apiUrl, networkConfig.chainId),
    [networkConfig.apiUrl, networkConfig.chainId]
  )

  // Referentially stable unless the PrivanaClient instance changes, so the lifecycle hook can
  // detect a client replacement (and distinguish it from an ordinary re-render).
  const lifecycleClient = useMemo(
    () => ({
      setBearerToken: (t: string) => client.setBearerToken(t),
      clearBearerToken: () => client.clearBearerToken(),
      clearPrivateReadToken: () => client.clearPrivateReadToken(),
    }),
    [client]
  )

  const value = useSiweAuthLifecycle({
    storageKey,
    apiUrl: networkConfig.apiUrl,
    chainId: networkConfig.chainId,
    persistJwt,
    autoLogin,
    client: lifecycleClient,
    api: client,
  })

  return <SiweAuthContext.Provider value={value}>{children}</SiweAuthContext.Provider>
}

export function useSiweAuth(): SiweAuthContextValue {
  const ctx = useContext(SiweAuthContext)
  if (!ctx) throw new Error('useSiweAuth must be used within SiweAuthProvider')
  return ctx
}
