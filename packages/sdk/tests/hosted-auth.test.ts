import { describe, expect, it } from 'bun:test'
import { AccountingApiError, FlexvaultsClient, HttpClient } from '../src/sdk/client'
import {
  buildHostedAuthSession,
  clearHostedAuthPendingTransaction,
  createHostedAuthPendingStorageKey,
  createPkceChallenge,
  createPkceVerifier,
  parseHostedAuthCallback,
  persistHostedAuthPendingTransaction,
  readHostedAuthPendingTransaction,
  stripHostedAuthCallbackParams,
} from '../src/sdk/auth'
import {
  readStoredHostedAuthSession,
  syncHostedAuthSessionToClient,
} from '../src/sdk/context/flexvaults-provider'
import { executeHostedAuthPrivateReadRequest } from '../src/sdk/hooks/use-private-read-request'

function createStorageMock(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const values = new Map<string, string>()

  return {
    getItem(key: string) {
      return values.has(key) ? values.get(key)! : null
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    },
    removeItem(key: string) {
      values.delete(key)
    },
  }
}

function createClientMock(): {
  clearBearerTokenCalls: number
  clearPrivateReadTokenCalls: number
  lastBearerToken: string | null
  clearBearerToken(): void
  clearPrivateReadToken(): void
  setBearerToken(token: string): void
} {
  return {
    clearBearerTokenCalls: 0,
    clearPrivateReadTokenCalls: 0,
    lastBearerToken: null,
    clearBearerToken() {
      this.clearBearerTokenCalls += 1
      this.lastBearerToken = null
    },
    clearPrivateReadToken() {
      this.clearPrivateReadTokenCalls += 1
    },
    setBearerToken(token: string) {
      this.lastBearerToken = token
    },
  }
}

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

  it('persists and clears a pending hosted auth transaction', () => {
    const storage = createStorageMock()
    const key = createHostedAuthPendingStorageKey('https://flexvaults.example.com/', {
      clientId: 'honoroll-web',
      redirectUri: 'https://honoroll.test/auth/callback',
    })

    persistHostedAuthPendingTransaction(storage, key, {
      codeVerifier: 'verifier',
      state: 'state',
    })
    expect(readHostedAuthPendingTransaction(storage, key)).toEqual({
      codeVerifier: 'verifier',
      state: 'state',
    })

    clearHostedAuthPendingTransaction(storage, key)
    expect(readHostedAuthPendingTransaction(storage, key)).toBeNull()
  })

  it('parses redirect callback query parameters', () => {
    expect(
      parseHostedAuthCallback(
        new URL('https://honoroll.test/auth/callback?code=auth-code&state=callback-state'),
        'https://honoroll.test/auth/callback'
      )
    ).toEqual({
      code: 'auth-code',
      state: 'callback-state',
    })

    expect(
      parseHostedAuthCallback(
        new URL(
          'https://honoroll.test/auth/callback?error=access_denied&error_description=cancelled&state=callback-state'
        ),
        'https://honoroll.test/auth/callback'
      )
    ).toEqual({
      error: 'access_denied',
      errorDescription: 'cancelled',
      state: 'callback-state',
    })
  })

  it('returns null when the current path does not match the registered redirect URI', () => {
    expect(
      parseHostedAuthCallback(
        new URL('https://honoroll.test/some/other/page?code=auth-code&state=callback-state'),
        'https://honoroll.test/auth/callback'
      )
    ).toBeNull()
  })

  it('returns null when the current origin does not match the registered redirect URI', () => {
    expect(
      parseHostedAuthCallback(
        new URL('https://attacker.test/auth/callback?code=auth-code&state=callback-state'),
        'https://honoroll.test/auth/callback'
      )
    ).toBeNull()
  })

  it('strips hosted auth callback params while preserving other url parts', () => {
    expect(
      stripHostedAuthCallbackParams(
        new URL(
          'https://honoroll.test/auth/callback?code=auth-code&state=callback-state&foo=bar#section'
        )
      )
    ).toBe('/auth/callback?foo=bar#section')
  })

  it('restores an active hosted auth session from storage and drops invalid entries', () => {
    const storage = createStorageMock()
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

    storage.setItem('active', JSON.stringify(session))
    expect(readStoredHostedAuthSession(storage, 'active', 1_700_000_100_000)).toEqual(session)

    storage.setItem('expired', JSON.stringify({ ...session, refreshExpiresAt: 1_699_999_999_000 }))
    expect(readStoredHostedAuthSession(storage, 'expired', 1_700_000_000_000)).toBeNull()
    expect(storage.getItem('expired')).toBeNull()

    storage.setItem('broken', '{')
    expect(readStoredHostedAuthSession(storage, 'broken', 1_700_000_000_000)).toBeNull()
    expect(storage.getItem('broken')).toBeNull()
  })

  it('syncs an active hosted auth session to the client bearer token', () => {
    const client = createClientMock()
    const now = Date.now()
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
      now
    )

    syncHostedAuthSessionToClient(client, { clientId: 'honoroll-web', redirectUri: 'x' }, session)
    expect(client.lastBearerToken).toBe('access-token')
    expect(client.clearPrivateReadTokenCalls).toBe(1)

    syncHostedAuthSessionToClient(client, null, session)
    expect(client.lastBearerToken).toBeNull()
    expect(client.clearBearerTokenCalls).toBe(1)
    expect(client.clearPrivateReadTokenCalls).toBe(2)
  })

  it('clears private-read auth when the hosted session is inactive', () => {
    const client = createClientMock()

    syncHostedAuthSessionToClient(
      client,
      { clientId: 'honoroll-web', redirectUri: 'https://honoroll.test/auth/callback' },
      {
        accessToken: 'expired-access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        tokenType: 'Bearer',
        address: '0x000000000000000000000000000000000000dEaD',
        clientId: 'honoroll-web',
        redirectUri: 'https://honoroll.test/auth/callback',
        expiresAt: Date.now() - 1,
        refreshExpiresAt: Date.now() + 60_000,
      }
    )

    expect(client.lastBearerToken).toBeNull()
    expect(client.clearBearerTokenCalls).toBe(1)
    expect(client.clearPrivateReadTokenCalls).toBe(1)
  })
})

describe('FlexvaultsClient hosted auth methods', () => {
  it('setting a private-read token clears bearer auth', () => {
    const client = new FlexvaultsClient({ baseUrl: 'https://flexvaults.example.com/' })

    client.setBearerToken('access-token')
    client.setPrivateReadToken('0xsiwe-token')

    const http = (client as unknown as { http: HttpClient }).http
    expect(client.getPrivateReadToken()).toBe('0xsiwe-token')
    expect(http.getHeader('Authorization')).toBeUndefined()
  })

  it('setting bearer auth clears the private-read token', () => {
    const client = new FlexvaultsClient({ baseUrl: 'https://flexvaults.example.com/' })

    client.setPrivateReadToken('0xsiwe-token')
    client.setBearerToken('access-token')

    const http = (client as unknown as { http: HttpClient }).http
    expect(client.getPrivateReadToken()).toBeUndefined()
    expect(http.getHeader('Authorization')).toBe('Bearer access-token')
  })

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
    expect(url.searchParams.get('response_mode')).toBe('redirect')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('preserves an explicit hosted auth response mode for low-level callers', () => {
    const client = new FlexvaultsClient({ baseUrl: 'https://flexvaults.example.com/' })
    const url = new URL(
      client.getHostedAuthAuthorizeUrl({
        client_id: 'honoroll-web',
        redirect_uri: 'https://honoroll.test/auth/callback',
        code_challenge: 'challenge',
        chain_id: 23295,
        response_mode: 'web_message',
        state: 'state',
      })
    )

    expect(url.searchParams.get('response_mode')).toBe('web_message')
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

describe('hosted auth private read execution', () => {
  it('retries once after a hosted auth 401 using a refreshed session', async () => {
    const client = createClientMock()
    const activeSession = buildHostedAuthSession(
      {
        access_token: 'stale-access-token',
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
      Date.now()
    )

    let refreshCalls = 0
    let requestCalls = 0

    const result = await executeHostedAuthPrivateReadRequest({
      client,
      hostedAuthSession: activeSession,
      refreshHostedAuthSession: async () => {
        refreshCalls += 1
        return { ...activeSession, accessToken: 'fresh-access-token' }
      },
      request: async () => {
        requestCalls += 1
        if (requestCalls === 1) {
          throw new AccountingApiError('Unauthorized', 401)
        }
        return 'ok'
      },
    })

    expect(result).toBe('ok')
    expect(requestCalls).toBe(2)
    expect(refreshCalls).toBe(1)
    expect(client.lastBearerToken).toBe('fresh-access-token')
    expect(client.clearPrivateReadTokenCalls).toBe(2)
  })

  it('uses the active hosted auth session without refreshing on a successful request', async () => {
    const client = createClientMock()
    const activeSession = buildHostedAuthSession(
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
      Date.now()
    )

    let refreshCalls = 0

    const result = await executeHostedAuthPrivateReadRequest({
      client,
      hostedAuthSession: activeSession,
      refreshHostedAuthSession: async () => {
        refreshCalls += 1
        return activeSession
      },
      request: async () => 'ok',
    })

    expect(result).toBe('ok')
    expect(refreshCalls).toBe(0)
    expect(client.lastBearerToken).toBe('access-token')
    expect(client.clearPrivateReadTokenCalls).toBe(1)
  })
})
