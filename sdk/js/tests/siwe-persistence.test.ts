import { describe, expect, it } from 'bun:test'
import { AUTH_CLOCK_SKEW_MS } from '../src/sdk/auth/auth-clock-skew'
import {
  PERSISTED_SIWE_AUTH_RECORD_VERSION,
  resolveHydrationAction,
  type PersistedSiweAuthRecord,
} from '../src/sdk/auth/siwe-persistence'

const ADDRESS = '0x000000000000000000000000000000000000dEaD'
const NOW = 1_800_000_000_000
const HOUR = 60 * 60 * 1000

const record = (overrides: Partial<PersistedSiweAuthRecord> = {}): PersistedSiweAuthRecord => ({
  version: PERSISTED_SIWE_AUTH_RECORD_VERSION,
  tokens: {
    siwe_token: '0xsiwe',
    jwt_access_token: 'access',
    jwt_refresh_token: 'refresh',
    address: ADDRESS,
  },
  accessTokenExpiresAt: NOW + HOUR,
  refreshTokenExpiresAt: NOW + 7 * 24 * HOUR,
  siweTokenExpiresAt: NOW + 2 * HOUR,
  updatedAt: NOW - HOUR,
  ...overrides,
})

describe('resolveHydrationAction', () => {
  it('restores a session whose private-read token is still valid', () => {
    expect(resolveHydrationAction(record(), ADDRESS, NOW).type).toBe('restore')
  })

  it('reports an expired private-read token even while the JWT is still active', () => {
    const expired = record({ siweTokenExpiresAt: NOW - HOUR })
    expect(resolveHydrationAction(expired, ADDRESS, NOW)).toEqual({ type: 'expired' })
  })

  it('reports it before trying a JWT refresh that would revive the session', () => {
    const expired = record({ accessTokenExpiresAt: NOW - HOUR, siweTokenExpiresAt: NOW - HOUR })
    expect(resolveHydrationAction(expired, ADDRESS, NOW)).toEqual({ type: 'expired' })
  })

  it('treats a token inside the clock-skew margin as expired', () => {
    const edge = record({ siweTokenExpiresAt: NOW + AUTH_CLOCK_SKEW_MS })
    expect(resolveHydrationAction(edge, ADDRESS, NOW)).toEqual({ type: 'expired' })
  })

  it('still removes a record that belongs to another wallet', () => {
    const other = record({ siweTokenExpiresAt: NOW - HOUR })
    expect(
      resolveHydrationAction(other, '0x000000000000000000000000000000000000bEEF', NOW)
    ).toEqual({
      type: 'remove',
    })
  })
})
