'use client'

import { useCallback, useRef, useState } from 'react'
import {
  buildHostedAuthSession,
  createHostedAuthState,
  createPkceChallenge,
  createPkceVerifier,
  isHostedAuthMessage,
} from '../auth'
import {
  AccountingApiError,
  HostedAuthError,
  HostedAuthPopupBlockedError,
  HostedAuthPopupClosedError,
  HostedAuthRequiredError,
  HostedAuthStateMismatchError,
} from '../client'
import { useFlexvaultsContext } from '../context'
import type { HostedAuthSession } from '../types'

const DEFAULT_POPUP_HEIGHT = 720
const DEFAULT_POPUP_WIDTH = 520
const POPUP_CLOSE_POLL_MS = 250
const POPUP_TIMEOUT_MS = 5 * 60 * 1000

function createPopupFeatures(width: number, height: number): string {
  if (typeof window === 'undefined') {
    return `popup=yes,width=${width},height=${height}`
  }

  const left = Math.max(window.screenX + (window.outerWidth - width) / 2, 0)
  const top = Math.max(window.screenY + (window.outerHeight - height) / 2, 0)

  return [
    'popup=yes',
    'toolbar=no',
    'menubar=no',
    'location=yes',
    'resizable=yes',
    'scrollbars=yes',
    `width=${Math.round(width)}`,
    `height=${Math.round(height)}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
  ].join(',')
}

export interface UseHostedRedirectAuthResult {
  session: HostedAuthSession | null
  isAuthenticated: boolean
  isLoading: boolean
  error: Error | null
  login: () => Promise<HostedAuthSession>
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
  const loginInflight = useRef<Promise<HostedAuthSession> | null>(null)

  const login = useCallback(async (): Promise<HostedAuthSession> => {
    if (!hostedAuthConfig) {
      throw new HostedAuthRequiredError(
        'Hosted redirect authentication is not configured for this provider.'
      )
    }
    if (hostedAuthConfig.responseMode !== 'web_message') {
      throw new HostedAuthError(
        'useHostedRedirectAuth() currently supports responseMode="web_message" only.'
      )
    }
    if (typeof window === 'undefined') {
      throw new HostedAuthError('Hosted redirect authentication requires a browser environment.')
    }
    if (loginInflight.current) {
      return loginInflight.current
    }

    const loginPromise = (async () => {
      setIsLoading(true)
      setError(null)

      const popup = window.open(
        'about:blank',
        'flexvaults-hosted-auth',
        createPopupFeatures(DEFAULT_POPUP_WIDTH, DEFAULT_POPUP_HEIGHT)
      )
      if (!popup) {
        throw new HostedAuthPopupBlockedError()
      }

      try {
        const verifier = createPkceVerifier()
        const codeChallenge = await createPkceChallenge(verifier)
        const state = createHostedAuthState()
        const authorizeUrl = client.getHostedAuthAuthorizeUrl({
          client_id: hostedAuthConfig.clientId,
          redirect_uri: hostedAuthConfig.redirectUri,
          code_challenge: codeChallenge,
          chain_id: networkConfig.chainId,
          code_challenge_method: 'S256',
          response_mode: hostedAuthConfig.responseMode,
          state,
        })

        popup.location.replace(authorizeUrl)

        const expectedOrigin = new URL(client.getBaseUrl()).origin

        const code = await new Promise<string>((resolve, reject) => {
          let finished = false

          const cleanup = () => {
            finished = true
            window.removeEventListener('message', handleMessage)
            clearInterval(closeInterval)
            clearTimeout(timeoutId)
          }

          const fail = (authError: Error) => {
            cleanup()
            try {
              popup.close()
            } catch {
              // Ignore popup close errors after failed auth completion.
            }
            reject(authError)
          }

          const succeed = (value: string) => {
            cleanup()
            try {
              popup.close()
            } catch {
              // Ignore popup close errors after successful auth completion.
            }
            resolve(value)
          }

          const handleMessage = (event: MessageEvent) => {
            if (finished) return
            if (event.origin !== expectedOrigin) return
            if (event.source !== popup) return
            if (!isHostedAuthMessage(event.data)) return

            if (event.data.state !== state) {
              fail(new HostedAuthStateMismatchError())
              return
            }

            if ('error' in event.data) {
              fail(
                new HostedAuthError(
                  event.data.error_description || event.data.error || 'Hosted authentication failed'
                )
              )
              return
            }

            succeed(event.data.code)
          }

          const closeInterval = window.setInterval(() => {
            if (!finished && popup.closed) {
              fail(new HostedAuthPopupClosedError())
            }
          }, POPUP_CLOSE_POLL_MS)

          const timeoutId = window.setTimeout(() => {
            fail(new HostedAuthError('Hosted authentication timed out.'))
          }, POPUP_TIMEOUT_MS)

          window.addEventListener('message', handleMessage)
        })

        const response = await client.exchangeHostedAuthCode({
          code,
          code_verifier: verifier,
          client_id: hostedAuthConfig.clientId,
          redirect_uri: hostedAuthConfig.redirectUri,
        })

        const session = buildHostedAuthSession(response, hostedAuthConfig)
        setHostedAuthSession(session)
        return session
      } catch (loginError) {
        try {
          popup.close()
        } catch {
          // Ignore popup close errors after login setup failures.
        }
        const normalizedError =
          loginError instanceof AccountingApiError && loginError.detail
            ? new HostedAuthError(loginError.detail)
            : loginError instanceof Error
              ? loginError
              : new HostedAuthError('Hosted authentication failed.')
        setError(normalizedError)
        throw normalizedError
      } finally {
        loginInflight.current = null
        setIsLoading(false)
      }
    })()

    loginInflight.current = loginPromise
    return loginPromise
  }, [client, hostedAuthConfig, networkConfig.chainId, setHostedAuthSession])

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
    logout,
    refresh,
  }
}
