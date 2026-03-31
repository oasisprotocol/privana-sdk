import { describe, expect, it } from 'bun:test'
import { AccountingApiError, FlexvaultsClient, HttpClient } from '../src/sdk/client'
import {
  buildHostedAuthSession,
  createHostedAuthState,
  createPkceChallenge,
  createPkceVerifier,
  isHostedAuthMessage,
} from '../src/sdk/auth'

describe('hosted auth helpers', () => {
  it('creates a PKCE verifier and S256 challenge', async () => {
    const verifier = createPkceVerifier()
    expect(verifier.length).toBe(64)
    expect(/^[A-Za-z0-9\-._~]+$/.test(verifier)).toBe(true)

    const challenge = await createPkceChallenge(verifier)
    expect(challenge.length).toBeGreaterThanOrEqual(43)
    expect(/^[A-Za-z0-9\-_]+$/.test(challenge)).toBe(true)
  })

  it('builds a hosted auth session from token exchange response', () => {
    const session = buildHostedAuthSession(
      {
        access_token: 'access-token',
        id_token: 'id-token',
        refresh_token: 'refresh-token',
        token_type: 'Bearer',
        expires_in: 300,
        refresh_expires_in: 1800,
        address: '0x000000000000000000000000000000000000dEaD',
      },
      {
        clientId: 'honoroll-web',
        redirectUri: 'https://honoroll.test/auth/callback',
      },
      1_700_000_000_000
    )

    expect(session.clientId).toBe('honoroll-web')
    expect(session.redirectUri).toBe('https://honoroll.test/auth/callback')
    expect(session.expiresAt).toBe(1_700_000_300_000)
    expect(session.refreshExpiresAt).toBe(1_700_001_800_000)
  })

  it('recognizes hosted auth web_message payloads', () => {
    const state = createHostedAuthState(16)
    expect(
      isHostedAuthMessage({
        type: 'flexvaults-auth-response',
        code: 'auth-code',
        state,
      })
    ).toBe(true)
    expect(
      isHostedAuthMessage({
        type: 'flexvaults-auth-response',
        error: 'access_denied',
        error_description: 'cancelled',
        state,
      })
    ).toBe(true)
    expect(isHostedAuthMessage({ type: 'something-else', state })).toBe(false)
  })
})

describe('FlexvaultsClient hosted auth methods', () => {
  it('builds the hosted auth authorize url with exact query params', () => {
    const client = new FlexvaultsClient({ baseUrl: 'https://flexvaults.example.com/' })
    const url = new URL(
      client.getHostedAuthAuthorizeUrl({
        client_id: 'honoroll-web',
        redirect_uri: 'https://honoroll.test/auth/callback',
        code_challenge: 'challenge',
        chain_id: 23295,
        state: 'state',
      })
    )

    expect(url.origin).toBe('https://flexvaults.example.com')
    expect(url.pathname).toBe('/v1/accounting/auth/authorize')
    expect(url.searchParams.get('client_id')).toBe('honoroll-web')
    expect(url.searchParams.get('redirect_uri')).toBe('https://honoroll.test/auth/callback')
    expect(url.searchParams.get('code_challenge')).toBe('challenge')
    expect(url.searchParams.get('chain_id')).toBe('23295')
    expect(url.searchParams.get('state')).toBe('state')
    expect(url.searchParams.get('response_mode')).toBe('web_message')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('preserves a baseUrl path prefix when building the hosted auth authorize url', () => {
    const client = new FlexvaultsClient({ baseUrl: 'https://flexvaults.example.com/api' })
    const url = new URL(
      client.getHostedAuthAuthorizeUrl({
        client_id: 'honoroll-web',
        redirect_uri: 'https://honoroll.test/auth/callback',
        code_challenge: 'challenge',
        chain_id: 84532,
        state: 'state',
      })
    )

    expect(url.toString()).toContain('/api/v1/accounting/auth/authorize')
    expect(url.searchParams.get('chain_id')).toBe('84532')
  })

  it('revokes the current refresh token on hosted auth logout', async () => {
    const originalFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? '{}'))
      return new Response(
        JSON.stringify({
          message: 'Logged out successfully',
          revoked_tokens: 1,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    try {
      const client = new FlexvaultsClient({ baseUrl: 'https://flexvaults.example.com' })
      client.setBearerToken('access-token')
      const response = await client.logoutJwtSession({
        refresh_token: 'refresh-token',
      })

      expect(requestBody).toEqual({
        refresh_token: 'refresh-token',
        revoke_all: false,
      })
      expect(response.revoked_tokens).toBe(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('HttpClient auth error handling', () => {
  it('preserves backend error_description for hosted auth failures', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: 'invalid_grant',
          error_description: 'PKCE verification failed',
        }),
        {
          status: 400,
          statusText: 'Bad Request',
          headers: { 'Content-Type': 'application/json' },
        }
      )

    try {
      const client = new HttpClient({ baseUrl: 'https://flexvaults.example.com' })
      await expect(client.post('/v1/accounting/auth/token', {})).rejects.toMatchObject({
        name: AccountingApiError.name,
        detail: 'PKCE verification failed',
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
