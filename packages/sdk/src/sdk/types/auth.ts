import type { Address, HostedAuthResponseMode } from './common'

export interface HostedAuthConfig {
  clientId: string
  redirectUri: string
  responseMode?: HostedAuthResponseMode
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

export interface HostedAuthMessageSuccess {
  type: 'flexvaults-auth-response'
  code: string
  state: string
}

export interface HostedAuthMessageError {
  type: 'flexvaults-auth-response'
  error: string
  error_description?: string
  state: string
}

export type HostedAuthMessage = HostedAuthMessageSuccess | HostedAuthMessageError
