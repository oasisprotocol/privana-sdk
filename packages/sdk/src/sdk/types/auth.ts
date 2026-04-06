import type { Address } from './common'

export interface HostedAuthConfig {
  clientId: string
  redirectUri: string
  responseMode?: 'redirect'
}

export interface HostedAuthSession {
  accessToken: string
  refreshToken: string
  idToken: string
  tokenType: string
  address: Address
  clientId: string
  redirectUri: string
  expiresAt: number
  refreshExpiresAt: number
}

export interface HostedAuthPendingTransaction {
  codeVerifier: string
  state: string
}

export interface HostedAuthCallbackSuccess {
  code: string
  state: string | null
}

export interface HostedAuthCallbackError {
  error: string
  errorDescription?: string
  state: string | null
}

export type HostedAuthCallback = HostedAuthCallbackSuccess | HostedAuthCallbackError
