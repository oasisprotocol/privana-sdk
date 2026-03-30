'use client'

import { useCallback, useContext, useMemo } from 'react'
import { createSiweMessage } from 'viem/siwe'
import { WagmiContext } from 'wagmi'
import { getWalletClient } from 'wagmi/actions'
import { AccountingApiError } from '../client'
import type { FlexvaultsClient } from '../client'
import { useFlexvaultsContext } from '../context'
import { useSafeAccount } from './use-safe-account'

const AUTH_CLOCK_SKEW_MS = 30_000
const INITIAL_AUTH_BACKOFF_MS = 5_000
const MAX_AUTH_BACKOFF_MS = 60_000
const DEFAULT_SIWE_AUTH_VALIDITY_MS = 24 * 60 * 60 * 1000
const PRIVATE_READ_STATEMENT = 'Sign in to Flexvaults to access private account data.'

interface PrivateReadTokenEntry {
  expiresAt: number
  token: string
}

interface PrivateReadFailureEntry {
  backoffMs: number
  retryAt: number
}

const privateReadTokenCache = new Map<string, PrivateReadTokenEntry>()
const privateReadFailureCache = new Map<string, PrivateReadFailureEntry>()
const privateReadInflight = new Map<string, Promise<string>>()

function createScopeKey(apiUrl: string, deploymentChainId: number, address: string): string {
  return `${apiUrl.replace(/\/$/, '')}:${deploymentChainId}:${address.toLowerCase()}`
}

function getCachedPrivateReadToken(scopeKey: string): string | null {
  const cached = privateReadTokenCache.get(scopeKey)
  if (!cached) return null
  if (cached.expiresAt <= Date.now() + AUTH_CLOCK_SKEW_MS) {
    privateReadTokenCache.delete(scopeKey)
    return null
  }
  return cached.token
}

function clearPrivateReadScope(scopeKey: string, client: FlexvaultsClient): void {
  privateReadTokenCache.delete(scopeKey)
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
  privateReadQueryScope: readonly [string, number, `0x${string}` | null]
} {
  const wagmiContext = useContext(WagmiContext)
  const { client, networkConfig } = useFlexvaultsContext()
  const { address } = useSafeAccount()

  const executePrivateRead = useCallback(
    async <T>(request: () => Promise<T>): Promise<T> => {
      if (!address) {
        throw new Error('No wallet connected')
      }
      if (!wagmiContext) {
        throw new Error('WagmiProvider is required for authenticated private reads')
      }

      const walletClient = await getWalletClient(wagmiContext)
      if (!walletClient) {
        throw new Error('No wallet client available')
      }

      const apiUrl = networkConfig.apiUrl
      const scopeKey = createScopeKey(apiUrl, networkConfig.chainId, address)

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
              client.getSiweNonce(address),
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
              address,
              chainId: walletClient.chain?.id ?? networkConfig.chainId,
              domain,
              expirationTime,
              issuedAt,
              nonce: nonceResponse.nonce,
              statement: PRIVATE_READ_STATEMENT,
              uri,
              version: '1',
            })

            const signature = await walletClient.signMessage({
              account: walletClient.account ?? address,
              message,
            })

            const login = await client.loginWithSiwe({
              siwe_message: message,
              signature,
            })

            privateReadTokenCache.set(scopeKey, {
              token: login.siwe_token,
              expiresAt: expirationTime.getTime(),
            })
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
    [address, client, networkConfig.apiUrl, networkConfig.chainId, wagmiContext]
  )

  const privateReadQueryScope = useMemo(
    () => [networkConfig.apiUrl, networkConfig.chainId, address ?? null] as const,
    [networkConfig.apiUrl, networkConfig.chainId, address]
  )

  return {
    executePrivateRead,
    privateReadQueryScope,
  }
}
