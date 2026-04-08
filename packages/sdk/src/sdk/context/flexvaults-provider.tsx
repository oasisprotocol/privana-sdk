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
import { NETWORK_CONFIG, type TokenConfig } from '../types'

export type TokensStatus = 'loading' | 'ready' | 'error'

export interface FlexvaultsContextValue {
  client: FlexvaultsClient
  networkConfig: NetworkConfig
  enabledTokens: TokenConfig[]
  defaultToken: TokenConfig | undefined
  tokensStatus: TokensStatus
  tokensError?: Error
  pollingInterval: number
  serviceAddress?: Address
  hostedAuthConfig: HostedAuthConfig | null
  hostedAuthSession: HostedAuthSession | null
  setHostedAuthSession: (session: HostedAuthSession | null) => void
  clearHostedAuthSession: () => void
  refreshHostedAuthSession: () => Promise<HostedAuthSession>
}

const FlexvaultsContext = createContext<FlexvaultsContextValue | null>(null)

export function readStoredHostedAuthSession(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  hostedAuthStorageKey: string,
  now = Date.now()
): HostedAuthSession | null {
  const raw = storage.getItem(hostedAuthStorageKey)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as HostedAuthSession
    if (!isHostedAuthRefreshActive(parsed, now, 0)) {
      storage.removeItem(hostedAuthStorageKey)
      return null
    }
    return parsed
  } catch {
    storage.removeItem(hostedAuthStorageKey)
    return null
  }
}

export function syncHostedAuthSessionToClient(
  client: Pick<FlexvaultsClient, 'clearBearerToken' | 'clearPrivateReadToken' | 'setBearerToken'>,
  hostedAuthConfig: HostedAuthConfig | null,
  hostedAuthSession: HostedAuthSession | null
): void {
  if (!hostedAuthConfig) {
    client.clearBearerToken()
    client.clearPrivateReadToken()
    return
  }

  if (hostedAuthSession && isHostedAuthSessionActive(hostedAuthSession)) {
    client.setBearerToken(hostedAuthSession.accessToken)
    client.clearPrivateReadToken()
    return
  }

  client.clearBearerToken()
  client.clearPrivateReadToken()
}

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

  const client = useMemo(
    () => new FlexvaultsClient({ baseUrl: networkConfig.apiUrl }),
    [networkConfig.apiUrl]
  )

  const [allTokens, setAllTokens] = useState<TokenConfig[]>([])
  const [tokensStatus, setTokensStatus] = useState<TokensStatus>('loading')
  const [tokensError, setTokensError] = useState<Error | undefined>()

  useEffect(() => {
    setTokensStatus('loading')
    setTokensError(undefined)
    client
      .listTokens()
      .then(({ tokens: list }) => {
        setAllTokens(
          list.map((t) => ({
            id: t.token_id,
            symbol: t.symbol,
            decimals: t.decimals,
            contract: t.token_address,
            name: t.name,
            chainId: t.chain_id,
          }))
        )
        setTokensStatus('ready')
      })
      .catch((err) => {
        setTokensError(err instanceof Error ? err : new Error(String(err)))
        setTokensStatus('error')
      })
  }, [client])

  const enabledTokens = useMemo(() => {
    if (tokens && tokens.length > 0) {
      const allowed = new Set(tokens.map((id) => id.toLowerCase()))
      return allTokens.filter((t) => allowed.has(t.id.toLowerCase()))
    }
    return allTokens
  }, [allTokens, tokens])

  const hostedAuthConfig = useMemo<HostedAuthConfig | null>(() => {
    if (!hostedAuth) return null

    const clientId = hostedAuth.clientId.trim()
    const redirectUri = hostedAuth.redirectUri.trim()
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

    return {
      clientId,
      redirectUri,
    }
  }, [hostedAuth])

  const hostedAuthStorageKey = useMemo(
    () =>
      hostedAuthConfig ? createHostedAuthStorageKey(networkConfig.apiUrl, hostedAuthConfig) : null,
    [hostedAuthConfig, networkConfig.apiUrl]
  )

  const [hostedAuthSession, setHostedAuthSessionState] = useState<HostedAuthSession | null>(null)
  const hostedAuthSessionRef = useRef<HostedAuthSession | null>(null)
  const hostedAuthStateVersionRef = useRef(0)
  const hostedAuthRefreshInflight = useRef<Promise<HostedAuthSession> | null>(null)

  const clearHostedAuthSession = useCallback(() => {
    hostedAuthStateVersionRef.current += 1
    hostedAuthSessionRef.current = null
    hostedAuthRefreshInflight.current = null
    setHostedAuthSessionState(null)
    client.clearBearerToken()
    client.clearPrivateReadToken()
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

      hostedAuthStateVersionRef.current += 1
      hostedAuthSessionRef.current = session
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
    const currentSession = hostedAuthSessionRef.current
    if (!currentSession) {
      throw new HostedAuthRequiredError()
    }
    if (!isHostedAuthRefreshActive(currentSession)) {
      clearHostedAuthSession()
      throw new HostedAuthRequiredError(
        'Hosted redirect authentication has expired. Start login again.'
      )
    }

    if (hostedAuthRefreshInflight.current) {
      return hostedAuthRefreshInflight.current
    }

    const refreshPromise = (async () => {
      const refreshVersion = hostedAuthStateVersionRef.current

      try {
        const response = await client.refreshJwtSession({
          refresh_token: currentSession.refreshToken,
        })
        if (refreshVersion !== hostedAuthStateVersionRef.current) {
          const latestSession = hostedAuthSessionRef.current
          if (latestSession) {
            return latestSession
          }

          throw new HostedAuthRequiredError(
            'Hosted redirect authentication has changed. Start login again.'
          )
        }

        const nextSession = applyRefreshResponse(currentSession, response)
        setHostedAuthSession(nextSession)
        return nextSession
      } catch (error) {
        if (refreshVersion === hostedAuthStateVersionRef.current) {
          clearHostedAuthSession()
        }
        throw error
      } finally {
        hostedAuthRefreshInflight.current = null
      }
    })()

    hostedAuthRefreshInflight.current = refreshPromise
    return refreshPromise
  }, [clearHostedAuthSession, client, hostedAuthConfig, setHostedAuthSession])

  useEffect(() => {
    hostedAuthSessionRef.current = hostedAuthSession
  }, [hostedAuthSession])

  useEffect(() => {
    if (!hostedAuthStorageKey || typeof window === 'undefined') {
      hostedAuthStateVersionRef.current += 1
      hostedAuthSessionRef.current = null
      hostedAuthRefreshInflight.current = null
      setHostedAuthSessionState(null)
      return
    }
    const restoredSession = readStoredHostedAuthSession(window.sessionStorage, hostedAuthStorageKey)
    hostedAuthStateVersionRef.current += 1
    hostedAuthSessionRef.current = restoredSession
    hostedAuthRefreshInflight.current = null
    setHostedAuthSessionState(restoredSession)
  }, [hostedAuthStorageKey])

  useEffect(() => {
    syncHostedAuthSessionToClient(client, hostedAuthConfig, hostedAuthSession)
  }, [client, hostedAuthConfig, hostedAuthSession])

  const value = useMemo<FlexvaultsContextValue>(
    () => ({
      client,
      networkConfig,
      enabledTokens,
      defaultToken: enabledTokens[0],
      tokensStatus,
      tokensError,
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
      tokensStatus,
      tokensError,
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
