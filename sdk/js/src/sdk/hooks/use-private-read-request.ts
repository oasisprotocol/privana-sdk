'use client'

import { useCallback, useContext, useMemo } from 'react'
import { WagmiContext } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import { isHostedAuthSessionActive } from '../auth'
import { buildSiweLoginMessage } from '../auth/siwe'
import { AccountingApiError, HostedAuthRequiredError } from '../client'
import type { PrivanaClient } from '../client'
import { usePrivanaContext } from '../context'
import type { Address, HostedAuthSession } from '../types'
import { useSafeAccount } from './use-safe-account'
import {
  createScopeKey,
  deleteCachedPrivateReadToken,
  getCachedPrivateReadToken,
  setCachedPrivateReadToken,
} from '../utils/private-read-token-store'

const INITIAL_AUTH_BACKOFF_MS = 5_000
const MAX_AUTH_BACKOFF_MS = 60_000

interface PrivateReadFailureEntry {
  backoffMs: number
  retryAt: number
}

const privateReadFailureCache = new Map<string, PrivateReadFailureEntry>()
const privateReadInflight = new Map<string, Promise<string>>()

// Unlike the SIWE path below, hosted auth still installs/clears the bearer on the SHARED client
// and hands that same client to `request`, so it needs the full PrivanaClient rather than a Pick.
export async function executeHostedAuthPrivateReadRequest<T>({
  client,
  hostedAuthSession,
  refreshHostedAuthSession,
  request,
}: {
  client: PrivanaClient
  hostedAuthSession: HostedAuthSession | null
  refreshHostedAuthSession: () => Promise<HostedAuthSession>
  request: (client: PrivanaClient) => Promise<T>
}): Promise<T> {
  const ensureHostedAuth = async (forceRefresh: boolean): Promise<string> => {
    if (!hostedAuthSession) {
      throw new HostedAuthRequiredError()
    }

    if (!forceRefresh && isHostedAuthSessionActive(hostedAuthSession)) {
      client.clearPrivateReadToken()
      client.setBearerToken(hostedAuthSession.accessToken)
      return hostedAuthSession.accessToken
    }

    const refreshed = await refreshHostedAuthSession()
    client.clearPrivateReadToken()
    client.setBearerToken(refreshed.accessToken)
    return refreshed.accessToken
  }

  await ensureHostedAuth(false)

  try {
    return await request(client)
  } catch (error) {
    if (!(error instanceof AccountingApiError) || error.statusCode !== 401) {
      throw error
    }

    await ensureHostedAuth(true)
    return request(client)
  }
}

function clearPrivateReadScope(
  scopeKey: string,
  client: Pick<PrivanaClient, 'clearPrivateReadToken'>
): void {
  deleteCachedPrivateReadToken(scopeKey)
  privateReadFailureCache.delete(scopeKey)
  client.clearPrivateReadToken()
}

export async function executeSiwePrivateReadRequest<T>({
  client,
  scopeKey,
  getToken,
  request,
}: {
  client: Pick<PrivanaClient, 'withPrivateReadToken' | 'clearPrivateReadToken'>
  scopeKey: string
  getToken: (forceRefresh: boolean) => Promise<string>
  request: (client: PrivanaClient) => Promise<T>
}): Promise<T> {
  // X-SIWE-Token is mutually exclusive with the JWT bearer, so the request runs against a scoped
  // client that carries it on a separate header set; the shared client's Authorization is untouched.
  const run = (token: string) => request(client.withPrivateReadToken(token))
  const token = await getToken(false)
  try {
    return await run(token)
  } catch (error) {
    if (!(error instanceof AccountingApiError) || error.statusCode !== 401) {
      throw error
    }
    clearPrivateReadScope(scopeKey, client)
    return run(await getToken(true))
  }
}

function recordPrivateReadFailure(scopeKey: string): void {
  const previous = privateReadFailureCache.get(scopeKey)
  const backoffMs = Math.min(
    previous ? previous.backoffMs * 2 : INITIAL_AUTH_BACKOFF_MS,
    MAX_AUTH_BACKOFF_MS
  )

  privateReadFailureCache.set(scopeKey, {
    backoffMs,
    retryAt: Date.now() + backoffMs,
  })
}

function ensureFailureBackoff(scopeKey: string): void {
  const failure = privateReadFailureCache.get(scopeKey)
  if (!failure) return
  if (failure.retryAt <= Date.now()) {
    privateReadFailureCache.delete(scopeKey)
    return
  }

  throw new Error(
    `Private-read authentication is temporarily paused after a recent failure. Retry in ${Math.ceil(
      (failure.retryAt - Date.now()) / 1000
    )}s.`
  )
}

export function usePrivateReadRequest(): {
  executePrivateRead<T>(request: (client: PrivanaClient) => Promise<T>): Promise<T>
  privateReadAddress: Address | null
  privateReadReady: boolean
  privateReadQueryScope: readonly [string, number, Address | null]
} {
  const wagmiContext = useContext(WagmiContext)
  const { client, networkConfig, hostedAuthConfig, hostedAuthSession, refreshHostedAuthSession } =
    usePrivanaContext()
  const { address: walletAddress } = useSafeAccount()
  const privateReadAddress = hostedAuthConfig
    ? (hostedAuthSession?.address ?? null)
    : (walletAddress ?? null)
  const privateReadReady = hostedAuthConfig ? !!hostedAuthSession : !!walletAddress

  const executePrivateRead = useCallback(
    async <T>(request: (client: PrivanaClient) => Promise<T>): Promise<T> => {
      if (hostedAuthConfig) {
        return executeHostedAuthPrivateReadRequest({
          client,
          hostedAuthSession,
          refreshHostedAuthSession,
          request,
        })
      }

      if (!wagmiContext) {
        throw new Error('WagmiProvider is required for authenticated private reads')
      }
      if (!walletAddress) {
        throw new Error('No wallet connected')
      }

      const apiUrl = networkConfig.apiUrl
      const scopeKey = createScopeKey(apiUrl, networkConfig.chainId, walletAddress)

      const getToken = async (forceRefresh: boolean): Promise<string> => {
        const inflight = privateReadInflight.get(scopeKey)
        if (inflight) return inflight

        if (!forceRefresh) {
          const cached = getCachedPrivateReadToken(scopeKey)
          if (cached) return cached
        }

        ensureFailureBackoff(scopeKey)

        const authPromise = (async () => {
          try {
            // Resolved here rather than up front so cache hits never pay a connector round-trip.
            const walletClient = await getWalletClient(wagmiContext)
            if (!walletClient) {
              throw new Error('No wallet client available')
            }

            const { message, expirationTime } = await buildSiweLoginMessage(client, {
              address: walletAddress,
              chainId: networkConfig.chainId,
              apiUrl,
            })

            const signature = await walletClient.signMessage({
              account: walletClient.account ?? walletAddress,
              message,
            })

            const login = await client.loginWithSiwe({
              siwe_message: message,
              signature,
            })

            setCachedPrivateReadToken(scopeKey, login.siwe_token, expirationTime.getTime())
            privateReadFailureCache.delete(scopeKey)
            return login.siwe_token
          } catch (error) {
            const authError =
              error instanceof Error ? error : new Error('Failed to authenticate private reads')
            clearPrivateReadScope(scopeKey, client)
            recordPrivateReadFailure(scopeKey)
            throw authError
          } finally {
            privateReadInflight.delete(scopeKey)
          }
        })()

        // Store the auth promise immediately so concurrent callers reuse it.
        privateReadInflight.set(scopeKey, authPromise)
        return authPromise
      }

      return executeSiwePrivateReadRequest({ client, scopeKey, getToken, request })
    },
    [
      client,
      hostedAuthConfig,
      hostedAuthSession,
      networkConfig.apiUrl,
      networkConfig.chainId,
      refreshHostedAuthSession,
      walletAddress,
      wagmiContext,
    ]
  )

  const privateReadQueryScope = useMemo(
    () => [networkConfig.apiUrl, networkConfig.chainId, privateReadAddress] as const,
    [networkConfig.apiUrl, networkConfig.chainId, privateReadAddress]
  )

  return {
    executePrivateRead,
    privateReadAddress,
    privateReadReady,
    privateReadQueryScope,
  }
}
