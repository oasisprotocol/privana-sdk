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
import { FlexvaultsClient } from '../client'
import {
  applyRefreshResponse,
  createHostedAuthStorageKey,
  isHostedAuthRefreshActive,
  isHostedAuthSessionActive,
} from '../auth'
import { HostedAuthRequiredError } from '../client'
import type { Address, HostedAuthConfig, HostedAuthSession, NetworkConfig } from '../types'
import { NETWORK_CONFIG, type TokenConfig, getTokenById, SUPPORTED_TOKENS } from '../types'

export interface FlexvaultsContextValue {
  client: FlexvaultsClient
  networkConfig: NetworkConfig
  enabledTokens: TokenConfig[]
  defaultToken: TokenConfig
  pollingInterval: number
  serviceAddress?: Address
  hostedAuthConfig: HostedAuthConfig | null
  hostedAuthSession: HostedAuthSession | null
  setHostedAuthSession: (session: HostedAuthSession | null) => void
  clearHostedAuthSession: () => void
  refreshHostedAuthSession: () => Promise<HostedAuthSession>
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
  /**
   * Optional hosted redirect auth configuration for cross-domain browser apps.
   */
  hostedAuth?: HostedAuthConfig
}

export function FlexvaultsProvider({
  children,
  networkConfig: networkConfigOverride,
  tokens,
  pollingInterval = 10000,
  serviceAddress,
  hostedAuth,
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

  const client = useMemo(
    () => new FlexvaultsClient({ baseUrl: networkConfig.apiUrl }),
    [networkConfig.apiUrl]
  )

  const hostedAuthConfig = useMemo<HostedAuthConfig | null>(() => {
    if (!hostedAuth) return null

    const clientId = hostedAuth.clientId.trim()
    const redirectUri = hostedAuth.redirectUri.trim()
    const responseMode = hostedAuth.responseMode ?? 'web_message'
    if (!clientId) {
      throw new Error(
        'FlexvaultsProvider: hostedAuth.clientId must be provided when hostedAuth is enabled'
      )
    }
    if (!redirectUri) {
      throw new Error(
        'FlexvaultsProvider: hostedAuth.redirectUri must be provided when hostedAuth is enabled'
      )
    }
    if (responseMode !== 'web_message') {
      throw new Error(
        'FlexvaultsProvider: hostedAuth.responseMode currently supports "web_message" only'
      )
    }

    return {
      clientId,
      redirectUri,
      responseMode,
    }
  }, [hostedAuth])

  const hostedAuthStorageKey = useMemo(
    () =>
      hostedAuthConfig ? createHostedAuthStorageKey(networkConfig.apiUrl, hostedAuthConfig) : null,
    [hostedAuthConfig, networkConfig.apiUrl]
  )

  const [hostedAuthSession, setHostedAuthSessionState] = useState<HostedAuthSession | null>(null)
  const hostedAuthRefreshInflight = useRef<Promise<HostedAuthSession> | null>(null)

  const clearHostedAuthSession = useCallback(() => {
    setHostedAuthSessionState(null)
    client.clearBearerToken()
    if (hostedAuthStorageKey && typeof window !== 'undefined') {
      window.sessionStorage.removeItem(hostedAuthStorageKey)
    }
  }, [client, hostedAuthStorageKey])

  const setHostedAuthSession = useCallback(
    (session: HostedAuthSession | null) => {
      if (!session) {
        clearHostedAuthSession()
        return
      }

      setHostedAuthSessionState(session)
      if (isHostedAuthSessionActive(session)) {
        client.setBearerToken(session.accessToken)
      } else {
        client.clearBearerToken()
      }
      client.clearPrivateReadToken()

      if (hostedAuthStorageKey && typeof window !== 'undefined') {
        window.sessionStorage.setItem(hostedAuthStorageKey, JSON.stringify(session))
      }
    },
    [clearHostedAuthSession, client, hostedAuthStorageKey]
  )

  const refreshHostedAuthSession = useCallback(async (): Promise<HostedAuthSession> => {
    if (!hostedAuthConfig) {
      throw new HostedAuthRequiredError(
        'Hosted redirect authentication is not configured for this provider.'
      )
    }
    if (!hostedAuthSession) {
      throw new HostedAuthRequiredError()
    }
    if (!isHostedAuthRefreshActive(hostedAuthSession)) {
      clearHostedAuthSession()
      throw new HostedAuthRequiredError(
        'Hosted redirect authentication has expired. Start login again.'
      )
    }

    if (hostedAuthRefreshInflight.current) {
      return hostedAuthRefreshInflight.current
    }

    const refreshPromise = (async () => {
      try {
        const response = await client.refreshJwtSession({
          refresh_token: hostedAuthSession.refreshToken,
        })
        const nextSession = applyRefreshResponse(hostedAuthSession, response)
        setHostedAuthSession(nextSession)
        return nextSession
      } catch (error) {
        clearHostedAuthSession()
        throw error
      } finally {
        hostedAuthRefreshInflight.current = null
      }
    })()

    hostedAuthRefreshInflight.current = refreshPromise
    return refreshPromise
  }, [clearHostedAuthSession, client, hostedAuthConfig, hostedAuthSession, setHostedAuthSession])

  useEffect(() => {
    if (!hostedAuthStorageKey || typeof window === 'undefined') {
      setHostedAuthSessionState(null)
      return
    }

    const raw = window.sessionStorage.getItem(hostedAuthStorageKey)
    if (!raw) {
      setHostedAuthSessionState(null)
      return
    }

    try {
      const parsed = JSON.parse(raw) as HostedAuthSession
      if (!isHostedAuthRefreshActive(parsed, Date.now(), 0)) {
        window.sessionStorage.removeItem(hostedAuthStorageKey)
        setHostedAuthSessionState(null)
        return
      }
      setHostedAuthSessionState(parsed)
    } catch {
      window.sessionStorage.removeItem(hostedAuthStorageKey)
      setHostedAuthSessionState(null)
    }
  }, [hostedAuthStorageKey])

  useEffect(() => {
    if (!hostedAuthConfig) {
      client.clearBearerToken()
      return
    }

    if (hostedAuthSession && isHostedAuthSessionActive(hostedAuthSession)) {
      client.setBearerToken(hostedAuthSession.accessToken)
      client.clearPrivateReadToken()
      return
    }

    client.clearBearerToken()
  }, [client, hostedAuthConfig, hostedAuthSession])

  const value = useMemo<FlexvaultsContextValue>(
    () => ({
      client,
      networkConfig,
      enabledTokens,
      defaultToken,
      pollingInterval,
      serviceAddress,
      hostedAuthConfig,
      hostedAuthSession,
      setHostedAuthSession,
      clearHostedAuthSession,
      refreshHostedAuthSession,
    }),
    [
      client,
      networkConfig,
      enabledTokens,
      defaultToken,
      pollingInterval,
      serviceAddress,
      hostedAuthConfig,
      hostedAuthSession,
      setHostedAuthSession,
      clearHostedAuthSession,
      refreshHostedAuthSession,
    ]
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
