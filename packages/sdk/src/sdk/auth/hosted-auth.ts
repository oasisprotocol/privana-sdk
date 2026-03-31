import type {
  HostedAuthConfig,
  HostedAuthMessage,
  HostedAuthSession,
  HostedAuthTokenExchangeResponse,
  JwtRefreshResponse,
} from '../types'

export const HOSTED_AUTH_CLOCK_SKEW_MS = 30_000

const PKCE_CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
const DEFAULT_RANDOM_LENGTH = 64

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
    'flexvaults',
    'hosted-auth',
    normalizedApiUrl,
    config.clientId.trim(),
    config.redirectUri.trim(),
  ].join(':')
}

export function isHostedAuthMessage(value: unknown): value is HostedAuthMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return (
    message.type === 'flexvaults-auth-response' &&
    typeof message.state === 'string' &&
    (typeof message.code === 'string' || typeof message.error === 'string')
  )
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
