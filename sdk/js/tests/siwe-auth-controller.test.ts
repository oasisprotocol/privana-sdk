import { describe, expect, it } from 'bun:test'
import {
  ctrlExpireIfCurrentToken,
  ctrlExpireSession,
  ctrlLogout,
  type SiweAuthController,
} from '../src/sdk/auth/siwe-auth-controller'
import {
  PERSISTED_SIWE_AUTH_RECORD_VERSION,
  type PersistedSiweAuthRecord,
} from '../src/sdk/auth/siwe-persistence'
import type { AuthLifecycleEvent, AuthLifecycleState } from '../src/sdk/auth/auth-lifecycle'

const record = (overrides: Partial<PersistedSiweAuthRecord> = {}): PersistedSiweAuthRecord => ({
  version: PERSISTED_SIWE_AUTH_RECORD_VERSION,
  tokens: {
    siwe_token: '0xsiwe',
    jwt_access_token: 'access',
    jwt_refresh_token: 'refresh',
    address: '0x000000000000000000000000000000000000dEaD',
  },
  accessTokenExpiresAt: Date.now() + 60 * 60 * 1000,
  refreshTokenExpiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
  siweTokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000,
  updatedAt: Date.now(),
  ...overrides,
})

interface ControllerFixture {
  ctrl: SiweAuthController
  calls: string[]
  cacheDeletes: string[]
  events: AuthLifecycleEvent[]
  expiredFlags: boolean[]
  storageRemoves: number
  logoutCalls: Array<{ refreshToken: string; revokeAll: boolean; bearerAtCallTime: string | null }>
  clearBearerCalls: number
}

function buildController(opts: {
  refreshToken: string | null
  bearerToken: string | null
  logoutThrows?: boolean
  persistJwt?: boolean
  /** What storage holds when the controller reads it. */
  stored?: PersistedSiweAuthRecord | null
  currentRecord?: PersistedSiweAuthRecord | null
}): ControllerFixture {
  const persistJwt = opts.persistJwt ?? false
  const calls: string[] = []
  const cacheDeletes: string[] = []
  const events: AuthLifecycleEvent[] = []
  const expiredFlags: boolean[] = []
  let storageRemoves = 0
  const logoutCalls: Array<{
    refreshToken: string
    revokeAll: boolean
    bearerAtCallTime: string | null
  }> = []
  let bearerToken: string | null = opts.bearerToken
  let clearBearerCalls = 0

  const client = {
    setBearerToken(t: string) {
      bearerToken = t
    },
    clearBearerToken() {
      calls.push(`clearBearer:bearer=${bearerToken}`)
      clearBearerCalls += 1
      bearerToken = null
    },
    clearPrivateReadToken() {},
  }

  const api = {
    logoutJwtSession(req: { refresh_token: string; revoke_all?: boolean }) {
      if (opts.logoutThrows) throw new Error('401 Unauthorized')
      logoutCalls.push({
        refreshToken: req.refresh_token,
        revokeAll: req.revoke_all === true,
        bearerAtCallTime: bearerToken,
      })
      calls.push(`logout:bearer=${bearerToken}`)
      return Promise.resolve({ message: 'ok', revoked_tokens: 1 })
    },
  }

  const state: AuthLifecycleState = {
    generation: 0,
    refreshData: opts.refreshToken
      ? { refreshToken: opts.refreshToken, refreshExpiresAt: 0 }
      : null,
    currentRecord: opts.currentRecord ?? null,
    autoAttemptedAddress: null,
    authenticatingAddress: null,
    hydratedAddress: null,
  }

  const ctrl = {
    config: {
      address: '0x000000000000000000000000000000000000dEaD',
      chainId: 1,
      apiUrl: 'https://privana.example.com',
      persistJwt,
    },
    ports: {
      persistJwt,
      client,
      storage: {
        read: () => opts.stored ?? null,
        write: () => {},
        remove: () => {
          storageRemoves += 1
        },
      },
      cache: {
        set: () => {},
        delete: (scopeKey: string) => {
          cacheDeletes.push(scopeKey)
        },
      },
      react: {
        setSession: () => {},
        setTokens: () => {},
        setAccessTokenExpiresAt: () => {},
        setSiweTokenExpiresAt: () => {},
        setSessionExpired: (expired: boolean) => {
          expiredFlags.push(expired)
        },
        setIsLoading: () => {},
        setIsHydrating: () => {},
        setError: () => {},
      },
      makeScopeKey: (addr: string) => addr,
    },
    api,
    signer: { signSiweMessage: async () => '0x' },
    loginInFlight: false,
    loginOwnerGeneration: -1,
    hydrateOwnerGeneration: -1,
    refreshPromise: null,
    getState: () => state,
    getSessionAddress: () => null,
    dispatch: (event: AuthLifecycleEvent) => {
      events.push(event)
    },
  } as unknown as SiweAuthController

  return {
    ctrl,
    calls,
    cacheDeletes,
    events,
    expiredFlags,
    get storageRemoves() {
      return storageRemoves
    },
    logoutCalls,
    get clearBearerCalls() {
      return clearBearerCalls
    },
  }
}

describe('ctrlLogout', () => {
  it('revokes server-side while the bearer is still set, before clearing it', async () => {
    const fixture = buildController({ refreshToken: 'refresh-token', bearerToken: 'access-token' })
    await ctrlLogout(fixture.ctrl)

    expect(fixture.logoutCalls).toHaveLength(1)
    expect(fixture.logoutCalls[0].refreshToken).toBe('refresh-token')
    expect(fixture.logoutCalls[0].revokeAll).toBe(true)
    expect(fixture.logoutCalls[0].bearerAtCallTime).toBe('access-token')
    expect(fixture.calls).toEqual(['logout:bearer=access-token', 'clearBearer:bearer=access-token'])
    expect(fixture.clearBearerCalls).toBe(1)
  })

  it('drops the cached private-read token for the wallet', async () => {
    const fixture = buildController({ refreshToken: null, bearerToken: 'access-token' })
    await ctrlLogout(fixture.ctrl)
    expect(fixture.cacheDeletes).toEqual(['0x000000000000000000000000000000000000dEaD'])
  })

  it('still clears local state when no refresh token is present', async () => {
    const fixture = buildController({ refreshToken: null, bearerToken: 'access-token' })
    await ctrlLogout(fixture.ctrl)
    expect(fixture.logoutCalls).toHaveLength(0)
    expect(fixture.clearBearerCalls).toBe(1)
  })

  it('still clears local state when the revocation call throws', async () => {
    const fixture = buildController({
      refreshToken: 'refresh-token',
      bearerToken: 'access-token',
      logoutThrows: true,
    })
    await ctrlLogout(fixture.ctrl)
    expect(fixture.clearBearerCalls).toBe(1)
  })
})

describe('ctrlExpireSession', () => {
  const ADDRESS = '0x000000000000000000000000000000000000dEaD'

  it('ends the session and drops the ended stored record and cached private-read token', () => {
    const fixture = buildController({
      refreshToken: 'refresh-token',
      bearerToken: 'access-token',
      persistJwt: true,
      stored: record({ siweTokenExpiresAt: Date.now() - 1 }),
    })
    ctrlExpireSession(fixture.ctrl)
    expect(fixture.clearBearerCalls).toBe(1)
    expect(fixture.storageRemoves).toBe(1)
    expect(fixture.cacheDeletes).toEqual([ADDRESS])
  })

  it('keeps a fresh sign-in another tab stored in the meantime', () => {
    const fixture = buildController({
      refreshToken: 'refresh-token',
      bearerToken: 'access-token',
      persistJwt: true,
      stored: record({ siweTokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000 }),
    })
    ctrlExpireSession(fixture.ctrl)
    expect(fixture.storageRemoves).toBe(0)
    expect(fixture.expiredFlags.at(-1)).toBe(true)
  })

  it('marks the session expired and keeps auto-login off for the wallet', () => {
    const fixture = buildController({ refreshToken: 'refresh-token', bearerToken: 'access-token' })
    ctrlExpireSession(fixture.ctrl)
    // The reset clears the auto-login marker; it has to be set again after it.
    expect(fixture.events.map((e) => e.type)).toEqual(['reset', 'setAutoAttemptedAddress'])
    expect(fixture.events[1]).toEqual({ type: 'setAutoAttemptedAddress', address: ADDRESS })
    expect(fixture.expiredFlags.at(-1)).toBe(true)
  })

  it('is not reported as an expiry when the user logs out', async () => {
    const fixture = buildController({ refreshToken: null, bearerToken: 'access-token' })
    await ctrlLogout(fixture.ctrl)
    expect(fixture.expiredFlags.at(-1)).toBe(false)
  })
})

describe('ctrlExpireIfCurrentToken', () => {
  const current = record({ tokens: { ...record().tokens, siwe_token: '0xcurrent' } })

  it('ends the session whose private-read token the server rejected', () => {
    const fixture = buildController({
      refreshToken: null,
      bearerToken: null,
      currentRecord: current,
    })
    ctrlExpireIfCurrentToken(fixture.ctrl, '0xcurrent')
    expect(fixture.expiredFlags.at(-1)).toBe(true)
  })

  it('leaves a newer session alone when an older token is rejected', () => {
    const fixture = buildController({
      refreshToken: null,
      bearerToken: null,
      currentRecord: current,
    })
    ctrlExpireIfCurrentToken(fixture.ctrl, '0xold')
    expect(fixture.events).toEqual([])
    expect(fixture.expiredFlags).toEqual([])
  })
})
