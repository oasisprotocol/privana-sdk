import type {
  HostedAuthCallback,
  HostedAuthConfig,
  HostedAuthPendingTransaction,
  HostedAuthSession,
  HostedAuthTokenExchangeResponse,
  JwtRefreshResponse,
} from '../types'

import { AUTH_CLOCK_SKEW_MS } from './auth-clock-skew'

export const HOSTED_AUTH_CLOCK_SKEW_MS = AUTH_CLOCK_SKEW_MS

const PKCE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
const DEFAULT_RANDOM_LENGTH = 64
const HOSTED_AUTH_CALLBACK_QUERY_KEYS = ['code', 'error', 'error_description', 'state'] as const

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

function randomString(length: number): string {
  const values = new Uint8Array(length)
  crypto.getRandomValues(values)
  let output = ''
  for (const value of values) {
    output += PKCE_CHARSET[value % PKCE_CHARSET.length]
  }
  return output
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function createPkceVerifier(length = DEFAULT_RANDOM_LENGTH): string {
  return randomString(length)
}

export async function createPkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return toBase64Url(new Uint8Array(digest))
}

export function createHostedAuthState(length = DEFAULT_RANDOM_LENGTH): string {
  return randomString(length)
}

export function createHostedAuthStorageKey(apiUrl: string, config: HostedAuthConfig): string {
  const normalizedApiUrl = apiUrl.replace(/\/$/, '')
  return [
    'privana',
    'hosted-auth',
    normalizedApiUrl,
    config.clientId.trim(),
    config.redirectUri.trim(),
  ].join(':')
}

export function createHostedAuthPendingStorageKey(
  apiUrl: string,
  config: HostedAuthConfig
): string {
  return `${createHostedAuthStorageKey(apiUrl, config)}:pending`
}

export function persistHostedAuthPendingTransaction(
  storage: StorageLike,
  key: string,
  transaction: HostedAuthPendingTransaction
): void {
  storage.setItem(key, JSON.stringify(transaction))
}

export function readHostedAuthPendingTransaction(
  storage: StorageLike,
  key: string
): HostedAuthPendingTransaction | null {
  const raw = storage.getItem(key)
  if (!raw) return null

  try {
    const parsed = JSON.parse(raw) as Partial<HostedAuthPendingTransaction>
    if (typeof parsed.codeVerifier !== 'string' || typeof parsed.state !== 'string') {
      return null
    }

    return {
      codeVerifier: parsed.codeVerifier,
      state: parsed.state,
    }
  } catch {
    return null
  }
}

export function clearHostedAuthPendingTransaction(storage: StorageLike, key: string): void {
  storage.removeItem(key)
}

export function parseHostedAuthCallback(url: URL, redirectUri: string): HostedAuthCallback | null {
  const expectedUrl = new URL(redirectUri)
  if (url.origin !== expectedUrl.origin || url.pathname !== expectedUrl.pathname) {
    return null
  }

  const code = url.searchParams.get('code')
  if (code) {
    return {
      code,
      state: url.searchParams.get('state'),
    }
  }

  const error = url.searchParams.get('error')
  if (error) {
    return {
      error,
      errorDescription: url.searchParams.get('error_description') ?? undefined,
      state: url.searchParams.get('state'),
    }
  }

  return null
}

export function stripHostedAuthCallbackParams(url: URL): string {
  const nextUrl = new URL(url.toString())
  HOSTED_AUTH_CALLBACK_QUERY_KEYS.forEach((key) => {
    nextUrl.searchParams.delete(key)
  })

  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

export function buildHostedAuthSession(
  response: HostedAuthTokenExchangeResponse,
  config: HostedAuthConfig,
  now = Date.now()
): HostedAuthSession {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    idToken: response.id_token,
    tokenType: response.token_type,
    address: response.address,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    expiresAt: now + response.expires_in * 1000,
    refreshExpiresAt: now + response.refresh_expires_in * 1000,
  }
}

export function applyRefreshResponse(
  session: HostedAuthSession,
  response: JwtRefreshResponse,
  now = Date.now()
): HostedAuthSession {
  return {
    ...session,
    accessToken: response.token,
    refreshToken: response.refresh_token,
    expiresAt: now + response.expires_in * 1000,
    refreshExpiresAt: now + response.refresh_expires_in * 1000,
  }
}

export function isHostedAuthSessionActive(
  session: HostedAuthSession,
  now = Date.now(),
  skewMs = HOSTED_AUTH_CLOCK_SKEW_MS
): boolean {
  return session.expiresAt > now + skewMs
}

export function isHostedAuthRefreshActive(
  session: HostedAuthSession,
  now = Date.now(),
  skewMs = HOSTED_AUTH_CLOCK_SKEW_MS
): boolean {
  return session.refreshExpiresAt > now + skewMs
}
