import { describe, expect, it } from 'bun:test'
import { ctrlLogout, type SiweAuthController } from '../src/sdk/auth/siwe-auth-controller'
import type { AuthLifecycleState } from '../src/sdk/auth/auth-lifecycle'

interface ControllerFixture {
  ctrl: SiweAuthController
  calls: string[]
  logoutCalls: Array<{ refreshToken: string; revokeAll: boolean; bearerAtCallTime: string | null }>
  clearBearerCalls: number
}

function buildController(opts: {
  refreshToken: string | null
  bearerToken: string | null
  logoutThrows?: boolean
}): ControllerFixture {
  const calls: string[] = []
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
    currentRecord: null,
    autoAttemptedAddress: null,
    authenticatingAddress: null,
    hydratedAddress: null,
  }

  const ctrl = {
    config: {
      address: '0x000000000000000000000000000000000000dEaD',
      chainId: 1,
      apiUrl: 'https://privana.example.com',
      persistJwt: false,
    },
    ports: {
      persistJwt: false,
      client,
      storage: { read: () => null, write: () => {}, remove: () => {} },
      cache: { set: () => {} },
      react: {
        setSession: () => {},
        setTokens: () => {},
        setAccessTokenExpiresAt: () => {},
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
    dispatch: () => {},
  } as unknown as SiweAuthController

  return {
    ctrl,
    calls,
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
