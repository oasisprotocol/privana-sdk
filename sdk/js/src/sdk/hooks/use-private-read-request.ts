'use client'

import { useCallback, useContext, useMemo } from 'react'
import { createSiweMessage } from 'viem/siwe'
import { WagmiContext } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import { buildSiweStatement, isHostedAuthSessionActive } from '../auth'
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
} from './private-read-token-store'

const INITIAL_AUTH_BACKOFF_MS = 5_000
const MAX_AUTH_BACKOFF_MS = 60_000
const DEFAULT_SIWE_AUTH_VALIDITY_MS = 24 * 60 * 60 * 1000

interface PrivateReadFailureEntry {
  backoffMs: number
  retryAt: number
}

const privateReadFailureCache = new Map<string, PrivateReadFailureEntry>()
const privateReadInflight = new Map<string, Promise<string>>()

export async function executeHostedAuthPrivateReadRequest<T>({
  client,
  hostedAuthSession,
  refreshHostedAuthSession,
  request,
}: {
  client: Pick<PrivanaClient, 'clearPrivateReadToken' | 'setBearerToken'>
  hostedAuthSession: HostedAuthSession | null
  refreshHostedAuthSession: () => Promise<HostedAuthSession>
  request: () => Promise<T>
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
    return await request()
  } catch (error) {
    if (!(error instanceof AccountingApiError) || error.statusCode !== 401) {
      throw error
    }

    await ensureHostedAuth(true)
    return request()
  }
}

function clearPrivateReadScope(scopeKey: string, client: PrivanaClient): void {
  deleteCachedPrivateReadToken(scopeKey)
  privateReadFailureCache.delete(scopeKey)
  client.clearPrivateReadToken()
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
  executePrivateRead<T>(request: () => Promise<T>): Promise<T>
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
    async <T>(request: () => Promise<T>): Promise<T> => {
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

      const walletClient = await getWalletClient(wagmiContext)
      if (!walletClient) {
        throw new Error('No wallet client available')
      }

      const apiUrl = networkConfig.apiUrl
      const scopeKey = createScopeKey(apiUrl, networkConfig.chainId, walletAddress)

      const getToken = async (forceRefresh: boolean): Promise<string> => {
        const inflight = privateReadInflight.get(scopeKey)
        if (inflight) {
          const token = await inflight
          client.setPrivateReadToken(token)
          return token
        }

        if (!forceRefresh) {
          const cached = getCachedPrivateReadToken(scopeKey)
          if (cached) {
            client.setPrivateReadToken(cached)
            return cached
          }
        }

        ensureFailureBackoff(scopeKey)

        const authPromise = (async () => {
          try {
            const [{ domain }, nonceResponse] = await Promise.all([
              client.getSiweDomain(),
              client.getSiweNonce(walletAddress),
            ])
            const issuedAt = new Date()
            // The nonce must be consumed within its short expiry window, but the backend
            // expects the signed SIWE session itself to be valid for the auth-token window.
            const expirationTime = new Date(issuedAt.getTime() + DEFAULT_SIWE_AUTH_VALIDITY_MS)
            const uri =
              typeof window !== 'undefined' && window.location.origin
                ? window.location.origin
                : apiUrl

            const message = createSiweMessage({
              address: walletAddress,
              chainId: networkConfig.chainId,
              domain,
              expirationTime,
              issuedAt,
              nonce: nonceResponse.nonce,
              statement: buildSiweStatement(networkConfig.chainId),
              uri,
              version: '1',
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
            client.setPrivateReadToken(login.siwe_token)
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

      await getToken(false)

      try {
        return await request()
      } catch (error) {
        if (!(error instanceof AccountingApiError) || error.statusCode !== 401) {
          throw error
        }

        clearPrivateReadScope(scopeKey, client)
        await getToken(true)
        return request()
      }
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
