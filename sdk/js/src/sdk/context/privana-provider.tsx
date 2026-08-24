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
import { zeroAddress } from 'viem'
import { PrivanaClient } from '../client'
import {
  applyRefreshResponse,
  createHostedAuthStorageKey,
  isHostedAuthRefreshActive,
  isHostedAuthSessionActive,
} from '../auth'
import { HostedAuthRequiredError } from '../client'
import type {
  Address,
  HostedAuthConfig,
  HostedAuthSession,
  NetworkConfig,
  OnRampConfig,
} from '../types'
import { NETWORK_CONFIG, type TokenConfig } from '../types'
import { SUPPORTED_CHAINS, type ChainConfig } from '../types/chains'
import { resolveMoonpayCurrencyCode } from '../moonpay-currency-codes'
import { SiweAuthProvider, type SiweAuthConfig } from './siwe-auth-provider'

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

const PrivanaContext = createContext<PrivanaContextValue | null>(null)

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
  client: Pick<PrivanaClient, 'clearBearerToken' | 'clearPrivateReadToken' | 'setBearerToken'>,
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

export interface PrivanaProviderProps {
  children: ReactNode
  /**
   * Network configuration including chainId, accountingContract, apiUrl, and name.
   * Defaults to testnet config. Partial overrides are merged with defaults.
   */
  networkConfig?: Partial<NetworkConfig>
  /**
   * Optional product-level card on-ramp selection. When omitted, the deposit
   * modal preserves its legacy MoonPay behavior. An explicit selection locks
   * card deposits to one provider, Privana token, and provider asset code.
   */
  onRamp?: OnRampConfig
  /**
   * Optional list of token IDs to filter from the API response.
   * When provided, only tokens whose ID matches this list are enabled.
   * When omitted, all tokens returned by the API are enabled.
   */
  tokens?: string[]
  /**
   * Chain configurations to use. Defaults to SDK built-in chains from config.json.
   * Pass custom ChainConfig[] for deployments targeting different chains.
   */
  chains?: ChainConfig[]
  pollingInterval?: number
  /**
   * The service address for lock operations.
   */
  serviceAddress?: Address
  /**
   * Display name of the host application/service. Shown as the title in
   * Privana modals (e.g. the deposit modal header). Defaults to "Privana".
   */
  serviceName?: string
  /**
   * Optional icon/logo for the host application/service.
   */
  serviceIcon?: ReactNode
  /**
   * Optional hosted redirect auth configuration for cross-domain browser apps.
   */
  hostedAuth?: HostedAuthConfig
  /**
   * Optional direct (in-app) SIWE auth. When provided, the connected wallet
   * signs an EIP-4361 message in-app and `useSiweAuth()` becomes available.
   * Mutually exclusive with `hostedAuth`: providing both throws, because
   * `usePrivateReadRequest()` prefers `hostedAuthConfig` and would otherwise
   * ignore the SIWE login.
   */
  siweAuth?: SiweAuthConfig
}

export function PrivanaProvider({
  children,
  networkConfig: networkConfigOverride,
  onRamp,
  tokens,
  chains,
  pollingInterval = 10000,
  serviceAddress,
  serviceName,
  serviceIcon,
  hostedAuth,
  siweAuth,
}: PrivanaProviderProps) {
  if (hostedAuth && siweAuth) {
    throw new Error(
      'PrivanaProvider: `hostedAuth` and `siweAuth` are mutually exclusive - provide only one. ' +
        'When both are set, private reads use hosted auth and the in-app SIWE login is ignored.'
    )
  }

  const networkConfig = useMemo<NetworkConfig>(() => {
    const config: NetworkConfig = {
      ...DEFAULT_NETWORK_CONFIG,
      ...networkConfigOverride,
    }

    // Validate that critical fields are present and valid
    if (!config.chainId || config.chainId <= 0) {
      throw new Error('PrivanaProvider: networkConfig.chainId must be a positive number')
    }
    if (!config.accountingContract || !config.accountingContract.startsWith('0x')) {
      throw new Error('PrivanaProvider: networkConfig.accountingContract must be a valid address')
    }
    if (!config.apiUrl) {
      throw new Error('PrivanaProvider: networkConfig.apiUrl must be provided')
    }

    return config
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Use individual properties for stable memoization
  }, [
    networkConfigOverride?.chainId,
    networkConfigOverride?.name,
    networkConfigOverride?.accountingContract,
    networkConfigOverride?.apiUrl,
    networkConfigOverride?.moonpayApiUrl,
    networkConfigOverride?.moonpayApiKey,
  ])

  const resolvedChains = useMemo(() => {
    if (chains && chains.length > 0) return chains
    return SUPPORTED_CHAINS
  }, [chains])

  const client = useMemo(
    () => new PrivanaClient({ baseUrl: networkConfig.apiUrl }),
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
            contract: t.token_address ?? zeroAddress,
            name: t.name,
            chainId: t.chain_id,
            moonpayCurrencyCode: resolveMoonpayCurrencyCode(t.token_id),
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

  const tokenById = useMemo(
    () => Object.fromEntries(enabledTokens.map((t) => [t.id.toLowerCase(), t])),
    [enabledTokens]
  )

  const getTokenById = useMemo(() => (id: string) => tokenById[id.toLowerCase()], [tokenById])

  const chainById = useMemo(
    () => Object.fromEntries(resolvedChains.map((c) => [c.id, c])),
    [resolvedChains]
  )

  const getChainById = useMemo(() => (id: number) => chainById[id], [chainById])

  const hostedAuthConfig = useMemo<HostedAuthConfig | null>(() => {
    if (!hostedAuth) return null

    const clientId = hostedAuth.clientId.trim()
    const redirectUri = hostedAuth.redirectUri.trim()
    if (!clientId) {
      throw new Error(
        'PrivanaProvider: hostedAuth.clientId must be provided when hostedAuth is enabled'
      )
    }
    if (!redirectUri) {
      throw new Error(
        'PrivanaProvider: hostedAuth.redirectUri must be provided when hostedAuth is enabled'
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

  const value = useMemo<PrivanaContextValue>(
    () => ({
      client,
      networkConfig,
      onRamp,
      enabledTokens,
      defaultToken: enabledTokens[0],
      getTokenById,
      getChainById,
      chains: resolvedChains,
      tokensStatus,
      tokensError,
      pollingInterval,
      serviceAddress,
      serviceName,
      serviceIcon,
      hostedAuthConfig,
      hostedAuthSession,
      setHostedAuthSession,
      clearHostedAuthSession,
      refreshHostedAuthSession,
    }),
    [
      client,
      networkConfig,
      onRamp,
      enabledTokens,
      getTokenById,
      getChainById,
      resolvedChains,
      tokensStatus,
      tokensError,
      pollingInterval,
      serviceAddress,
      serviceName,
      serviceIcon,
      hostedAuthConfig,
      hostedAuthSession,
      setHostedAuthSession,
      clearHostedAuthSession,
      refreshHostedAuthSession,
    ]
  )

  return (
    <PrivanaContext.Provider value={value}>
      {siweAuth ? (
        <SiweAuthProvider
          client={client}
          networkConfig={networkConfig}
          autoLogin={typeof siweAuth === 'object' ? siweAuth.autoLogin : undefined}
          persistJwt={typeof siweAuth === 'object' ? siweAuth.persistJwt : undefined}
        >
          {children}
        </SiweAuthProvider>
      ) : (
        children
      )}
    </PrivanaContext.Provider>
  )
}

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
