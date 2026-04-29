'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  buildHostedAuthSession,
  clearHostedAuthPendingTransaction,
  createHostedAuthPendingStorageKey,
  createHostedAuthState,
  createPkceChallenge,
  createPkceVerifier,
  parseHostedAuthCallback,
  persistHostedAuthPendingTransaction,
  readHostedAuthPendingTransaction,
  stripHostedAuthCallbackParams,
} from '../auth'
import {
  AccountingApiError,
  HostedAuthError,
  HostedAuthRequiredError,
  HostedAuthStateMismatchError,
} from '../client'
import { useFlexvaultsContext } from '../context'
import type { HostedAuthSession } from '../types'

const hostedAuthExchangeInflight = new Map<string, Promise<HostedAuthSession>>()

function normalizeHostedAuthError(error: unknown): HostedAuthError | Error {
  if (error instanceof AccountingApiError && error.detail) {
    return new HostedAuthError(error.detail)
  }
  if (error instanceof Error) {
    return error
  }
  return new HostedAuthError('Hosted authentication failed.')
}

export interface UseHostedRedirectAuthResult {
  session: HostedAuthSession | null
  isAuthenticated: boolean
  isLoading: boolean
  error: Error | null
  login: () => Promise<void>
  completeLogin: () => Promise<HostedAuthSession | null>
  logout: () => Promise<void>
  refresh: () => Promise<HostedAuthSession>
}

export function useHostedRedirectAuth(): UseHostedRedirectAuthResult {
  const {
    client,
    hostedAuthConfig,
    hostedAuthSession,
    networkConfig,
    setHostedAuthSession,
    clearHostedAuthSession,
    refreshHostedAuthSession,
  } = useFlexvaultsContext()
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const loginInflight = useRef<Promise<void> | null>(null)
  const completionInflight = useRef<Promise<HostedAuthSession | null> | null>(null)
  const pendingStorageKey = useMemo(
    () =>
      hostedAuthConfig
        ? createHostedAuthPendingStorageKey(client.getBaseUrl(), hostedAuthConfig)
        : null,
    [client, hostedAuthConfig]
  )

  const clearPendingLogin = useCallback(() => {
    if (!pendingStorageKey || typeof window === 'undefined') return
    clearHostedAuthPendingTransaction(window.sessionStorage, pendingStorageKey)
  }, [pendingStorageKey])

  const login = useCallback(async (): Promise<void> => {
    if (!hostedAuthConfig) {
      throw new HostedAuthRequiredError(
        'Hosted redirect authentication is not configured for this provider.'
      )
    }
    if (typeof window === 'undefined') {
      throw new HostedAuthError('Hosted redirect authentication requires a browser environment.')
    }
    if (!pendingStorageKey) {
      throw new HostedAuthError('Hosted redirect authentication storage is not configured.')
    }
    if (loginInflight.current) {
      return loginInflight.current
    }

    const loginPromise = (async () => {
      setIsLoading(true)
      setError(null)

      try {
        const verifier = createPkceVerifier()
        const codeChallenge = await createPkceChallenge(verifier)
        const state = createHostedAuthState()
        persistHostedAuthPendingTransaction(window.sessionStorage, pendingStorageKey, {
          codeVerifier: verifier,
          state,
        })
        const authorizeUrl = client.getHostedAuthAuthorizeUrl({
          client_id: hostedAuthConfig.clientId,
          redirect_uri: hostedAuthConfig.redirectUri,
          code_challenge: codeChallenge,
          chain_id: networkConfig.chainId,
          code_challenge_method: 'S256',
          response_mode: 'redirect',
          state,
        })

        window.location.assign(authorizeUrl)
      } catch (loginError) {
        clearPendingLogin()
        const normalizedError = normalizeHostedAuthError(loginError)
        setError(normalizedError)
        throw normalizedError
      } finally {
        loginInflight.current = null
        setIsLoading(false)
      }
    })()

    loginInflight.current = loginPromise
    return loginPromise
  }, [clearPendingLogin, client, hostedAuthConfig, networkConfig.chainId, pendingStorageKey])

  const completeLogin = useCallback(async (): Promise<HostedAuthSession | null> => {
    if (!hostedAuthConfig) {
      throw new HostedAuthRequiredError(
        'Hosted redirect authentication is not configured for this provider.'
      )
    }
    if (typeof window === 'undefined') {
      throw new HostedAuthError('Hosted redirect authentication requires a browser environment.')
    }
    if (!pendingStorageKey) {
      throw new HostedAuthError('Hosted redirect authentication storage is not configured.')
    }
    if (completionInflight.current) {
      return completionInflight.current
    }

    const completionPromise = (async () => {
      setIsLoading(true)
      setError(null)

      const callbackUrl = new URL(window.location.href)
      const cleanupCallbackUrl = () => {
        window.history.replaceState(null, '', stripHostedAuthCallbackParams(callbackUrl))
      }

      try {
        const callback = parseHostedAuthCallback(callbackUrl, hostedAuthConfig.redirectUri)
        if (!callback) {
          return null
        }

        const pending = readHostedAuthPendingTransaction(window.sessionStorage, pendingStorageKey)
        if (!pending) {
          clearPendingLogin()
          cleanupCallbackUrl()
          throw new HostedAuthError(
            'Hosted authentication response could not be matched to a pending login request.'
          )
        }
        if (!callback.state || callback.state !== pending.state) {
          clearPendingLogin()
          cleanupCallbackUrl()
          throw new HostedAuthStateMismatchError()
        }
        if ('error' in callback) {
          clearPendingLogin()
          cleanupCallbackUrl()
          throw new HostedAuthError(
            callback.errorDescription || callback.error || 'Hosted authentication failed.'
          )
        }

        const { codeVerifier } = pending
        const exchangeKey = `${pendingStorageKey}:${callback.code}:${pending.state}`
        let exchangePromise = hostedAuthExchangeInflight.get(exchangeKey)

        if (!exchangePromise) {
          exchangePromise = (async () => {
            const response = await client.exchangeHostedAuthCode({
              code: callback.code,
              code_verifier: codeVerifier,
              client_id: hostedAuthConfig.clientId,
              redirect_uri: hostedAuthConfig.redirectUri,
            })

            const session = buildHostedAuthSession(response, hostedAuthConfig)
            setHostedAuthSession(session)
            clearPendingLogin()
            cleanupCallbackUrl()
            return session
          })()

          hostedAuthExchangeInflight.set(exchangeKey, exchangePromise)
        }

        try {
          return await exchangePromise
        } finally {
          if (hostedAuthExchangeInflight.get(exchangeKey) === exchangePromise) {
            hostedAuthExchangeInflight.delete(exchangeKey)
          }
        }
      } catch (completionError) {
        const normalizedError = normalizeHostedAuthError(completionError)
        setError(normalizedError)
        throw normalizedError
      } finally {
        completionInflight.current = null
        setIsLoading(false)
      }
    })()

    completionInflight.current = completionPromise
    return completionPromise
  }, [clearPendingLogin, client, hostedAuthConfig, pendingStorageKey, setHostedAuthSession])

  const logout = useCallback(async (): Promise<void> => {
    setError(null)
    try {
      if (hostedAuthSession) {
        await client.logoutJwtSession({
          refresh_token: hostedAuthSession.refreshToken,
        })
      }
    } finally {
      clearHostedAuthSession()
    }
  }, [clearHostedAuthSession, client, hostedAuthSession])

  const refresh = useCallback(async (): Promise<HostedAuthSession> => {
    setIsLoading(true)
    setError(null)
    try {
      return await refreshHostedAuthSession()
    } catch (refreshError) {
      const normalizedError =
        refreshError instanceof Error
          ? refreshError
          : new HostedAuthError('Hosted authentication refresh failed.')
      setError(normalizedError)
      throw normalizedError
    } finally {
      setIsLoading(false)
    }
  }, [refreshHostedAuthSession])

  return {
    session: hostedAuthSession,
    isAuthenticated: !!hostedAuthSession,
    isLoading,
    error,
    login,
    completeLogin,
    logout,
    refresh,
  }
}
