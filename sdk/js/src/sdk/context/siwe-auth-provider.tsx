'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createSiweMessage } from 'viem/siwe'
import { WagmiContext } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import type { PrivanaClient } from '../client'
import type { Address, NetworkConfig, SiweLoginResponse } from '../types'
import { useSafeAccount } from '../hooks/use-safe-account'
import { createScopeKey, setCachedPrivateReadToken } from '../hooks/private-read-token-store'

const DEFAULT_SIWE_VALIDITY_MS = 24 * 60 * 60 * 1000
const DEFAULT_STATEMENT = 'Sign in to access your private account data.'

export type SiweAuthSession = { address: Address }

// Raw tokens exposed so apps with own backend can forward them
export type SiweAuthTokens = Pick<
  SiweLoginResponse,
  'siwe_token' | 'jwt_access_token' | 'jwt_refresh_token' | 'address'
>

export interface SiweAuthContextValue {
  isAuthenticated: boolean
  isLoading: boolean
  error: Error | null
  session: SiweAuthSession | null
  accessToken: string | undefined
  tokens: SiweAuthTokens | null
  login: () => Promise<void>
  logout: () => void
}

const SiweAuthContext = createContext<SiweAuthContextValue | null>(null)

export interface SiweAuthConfig {
  autoLogin?: boolean
  statement?: string
}

export interface SiweAuthProviderProps extends SiweAuthConfig {
  children: ReactNode
  client: PrivanaClient
  networkConfig: NetworkConfig
}

export function SiweAuthProvider({
  children,
  client,
  networkConfig,
  autoLogin = true,
  statement,
}: SiweAuthProviderProps) {
  const wagmiContext = useContext(WagmiContext)
  const { address, isConnected, status } = useSafeAccount()

  const [session, setSession] = useState<SiweAuthSession | null>(null)
  const [tokens, setTokens] = useState<SiweAuthTokens | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const loginInFlight = useRef(false)
  const autoAttemptedAddress = useRef<string | null>(null)

  const logout = useCallback(() => {
    client.clearPrivateReadToken()
    client.clearBearerToken()
    setSession(null)
    setTokens(null)
    setError(null)
    autoAttemptedAddress.current = null
  }, [client])

  const login = useCallback(async () => {
    if (!wagmiContext) throw new Error('WagmiProvider is required for SIWE auth')
    if (!address) throw new Error('No wallet connected')
    if (loginInFlight.current) return
    loginInFlight.current = true
    setIsLoading(true)
    setError(null)
    try {
      const walletClient = await getWalletClient(wagmiContext)
      if (!walletClient) throw new Error('No wallet client available')

      const [{ domain }, nonceRes] = await Promise.all([
        client.getSiweDomain(),
        client.getSiweNonce(address),
      ])
      const issuedAt = new Date()
      const expirationTime = new Date(issuedAt.getTime() + DEFAULT_SIWE_VALIDITY_MS)
      const uri =
        typeof window !== 'undefined' && window.location.origin
          ? window.location.origin
          : networkConfig.apiUrl
      const message = createSiweMessage({
        address,
        chainId: networkConfig.chainId,
        domain,
        uri,
        version: '1',
        nonce: nonceRes.nonce,
        statement: statement ?? DEFAULT_STATEMENT,
        issuedAt,
        expirationTime,
      })
      const signature = await walletClient.signMessage({
        account: walletClient.account ?? address,
        message,
      })
      const res = await client.loginWithSiwe({ siwe_message: message, signature })
      client.setPrivateReadToken(res.siwe_token)
      client.setBearerToken(res.jwt_access_token)
      // Seed the shared private-read cache so reads reuse this token instead of triggering a second SIWE signature
      setCachedPrivateReadToken(
        createScopeKey(networkConfig.apiUrl, networkConfig.chainId, address),
        res.siwe_token,
        expirationTime.getTime()
      )
      setSession({ address: res.address })
      setTokens({
        siwe_token: res.siwe_token,
        jwt_access_token: res.jwt_access_token,
        jwt_refresh_token: res.jwt_refresh_token,
        address: res.address,
      })
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Sign-in failed'))
      throw err
    } finally {
      setIsLoading(false)
      loginInFlight.current = false
    }
  }, [wagmiContext, address, client, networkConfig.chainId, networkConfig.apiUrl, statement])

  useEffect(() => {
    if (!autoLogin) return
    // Avoids transient logout/re-auth
    if (status === 'connecting' || status === 'reconnecting') return

    if (!isConnected && session) {
      logout()
      return
    }
    if (
      isConnected &&
      address &&
      session &&
      address.toLowerCase() !== session.address.toLowerCase()
    ) {
      logout()
      return
    }
    if (
      isConnected &&
      address &&
      !session &&
      !isLoading &&
      autoAttemptedAddress.current !== address
    ) {
      autoAttemptedAddress.current = address
      void login().catch(() => {})
    }
  }, [autoLogin, status, isConnected, address, session, isLoading, login, logout])

  const value = useMemo<SiweAuthContextValue>(
    () => ({
      isAuthenticated: !!session,
      isLoading,
      error,
      session,
      accessToken: tokens?.jwt_access_token,
      tokens,
      login,
      logout,
    }),
    [session, isLoading, error, tokens, login, logout]
  )

  return <SiweAuthContext.Provider value={value}>{children}</SiweAuthContext.Provider>
}

export function useSiweAuth(): SiweAuthContextValue {
  const ctx = useContext(SiweAuthContext)
  if (!ctx) throw new Error('useSiweAuth must be used within SiweAuthProvider')
  return ctx
}
