/**
 * Opt-in persistence for the direct (in-app) SIWE auth flow.
 *
 * Storage access fails softly: when `localStorage` is blocked (e.g. private browsing) or a write
 * fails, the session continues in memory only and a single warning is emitted. Storing long-lived
 * refresh credentials in `localStorage` exposes them to XSS exfiltration; integrations must weigh
 * that risk before opting in.
 */

import type { JwtRefreshResponse, SiweLoginResponse } from '../types'
import { AUTH_CLOCK_SKEW_MS } from './auth-clock-skew'

export const PERSISTED_SIWE_AUTH_RECORD_VERSION = 2

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** Structurally `SiweAuthTokens`, but typed with plain strings since the values come from JSON. */
export interface PersistedSiweAuthTokens {
  siwe_token: string
  jwt_access_token: string
  jwt_refresh_token: string
  address: string
}

export interface PersistedSiweAuthRecord {
  version: number
  tokens: PersistedSiweAuthTokens
  accessTokenExpiresAt: number
  refreshTokenExpiresAt: number
  /** Absolute expiry (ms epoch) of the SIWE token, established at login and preserved across JWT refreshes. */
  siweTokenExpiresAt: number
  updatedAt: number
}

let warnedBlockedStorage = false

function warnBlockedStorageOnce(): void {
  if (warnedBlockedStorage) return
  warnedBlockedStorage = true
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(
      'Privana SIWE auth: localStorage is unavailable or blocked; sessions will stay in memory only.'
    )
  }
}

export function createSiweAuthStorageKey(apiUrl: string, chainId: number): string {
  const normalizedApiUrl = apiUrl.replace(/\/$/, '')
  return ['privana', 'siwe-auth', normalizedApiUrl, String(chainId)].join(':')
}

export function buildPersistedSiweAuthRecordFromLogin(
  response: SiweLoginResponse,
  now: number,
  siweTokenExpiresAt: number
): PersistedSiweAuthRecord {
  return {
    version: PERSISTED_SIWE_AUTH_RECORD_VERSION,
    tokens: {
      siwe_token: response.siwe_token,
      jwt_access_token: response.jwt_access_token,
      jwt_refresh_token: response.jwt_refresh_token,
      address: response.address,
    },
    accessTokenExpiresAt: now + response.jwt_expires_in * 1000,
    refreshTokenExpiresAt: now + response.jwt_refresh_expires_in * 1000,
    siweTokenExpiresAt,
    updatedAt: now,
  }
}

export function applyRefreshToPersistedSiweAuthRecord(
  previous: PersistedSiweAuthRecord,
  response: JwtRefreshResponse,
  now = Date.now()
): PersistedSiweAuthRecord {
  return {
    ...previous,
    tokens: {
      ...previous.tokens,
      jwt_access_token: response.token,
      jwt_refresh_token: response.refresh_token,
    },
    accessTokenExpiresAt: now + response.expires_in * 1000,
    refreshTokenExpiresAt: now + response.refresh_expires_in * 1000,
    updatedAt: now,
  }
}

export function isPersistedSiweAuthRecord(value: unknown): value is PersistedSiweAuthRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (record.version !== PERSISTED_SIWE_AUTH_RECORD_VERSION) return false
  if (typeof record.accessTokenExpiresAt !== 'number') return false
  if (typeof record.refreshTokenExpiresAt !== 'number') return false
  if (typeof record.siweTokenExpiresAt !== 'number') return false
  if (typeof record.updatedAt !== 'number') return false
  const tokens = record.tokens
  if (typeof tokens !== 'object' || tokens === null) return false
  const tokenFields = tokens as Record<string, unknown>
  return (
    typeof tokenFields.siwe_token === 'string' &&
    typeof tokenFields.jwt_access_token === 'string' &&
    typeof tokenFields.jwt_refresh_token === 'string' &&
    typeof tokenFields.address === 'string' &&
    tokenFields.address.length > 0
  )
}

export function isPersistedSiweAuthAccessActive(
  record: PersistedSiweAuthRecord,
  now = Date.now()
): boolean {
  return record.accessTokenExpiresAt > now + AUTH_CLOCK_SKEW_MS
}

export function isPersistedSiweAuthRefreshActive(
  record: PersistedSiweAuthRecord,
  now = Date.now()
): boolean {
  return record.refreshTokenExpiresAt > now + AUTH_CLOCK_SKEW_MS
}

/** Validates a raw payload without touching storage. Used for cross-tab `storage` events. */
export function parsePersistedSiweAuthRecord(
  raw: string,
  now = Date.now()
): PersistedSiweAuthRecord | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!isPersistedSiweAuthRecord(parsed)) return null
  if (!isPersistedSiweAuthRefreshActive(parsed, now)) return null
  return parsed
}

/**
 * Reads and validates the persisted record, removing malformed, unsupported, or expired entries.
 * Returns `null` (without writing) when storage access itself throws.
 */
export function readPersistedSiweAuth(
  storage: StorageLike,
  key: string,
  now = Date.now()
): PersistedSiweAuthRecord | null {
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch {
    return null
  }
  if (raw == null) return null

  const record = parsePersistedSiweAuthRecord(raw, now)
  if (!record) removePersistedSiweAuth(storage, key)
  return record
}

export function writePersistedSiweAuth(
  storage: StorageLike,
  key: string,
  record: PersistedSiweAuthRecord
): void {
  try {
    storage.setItem(key, JSON.stringify(record))
  } catch {
    warnBlockedStorageOnce()
  }
}

export function removePersistedSiweAuth(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key)
  } catch {
    // Ignored: a blocked remove must never invalidate an otherwise successful session.
  }
}

let localStorageProbe: Storage | null | undefined

/**
 * Returns the shared `localStorage`, or `null` on the server or when access is blocked. Probes
 * with a read once per process so Safari private mode (which throws on access) is detected.
 */
export function getSiweAuthLocalStorage(): Storage | null {
  if (localStorageProbe !== undefined) return localStorageProbe
  if (typeof window === 'undefined') return null
  try {
    const storage = window.localStorage
    storage.getItem('__privana_siwe_probe__')
    localStorageProbe = storage
  } catch {
    warnBlockedStorageOnce()
    localStorageProbe = null
  }
  return localStorageProbe
}

/**
 * A record is adoptable when it targets the same wallet and is newer than the record this tab last
 * applied. Used to adopt another tab's rotations before/after a refresh.
 */
export function isAdoptableRecord(
  record: PersistedSiweAuthRecord | null,
  currentAddress: string | null,
  currentUpdatedAt: number | null
): boolean {
  if (!record || !currentAddress) return false
  if (record.tokens.address.toLowerCase() !== currentAddress.toLowerCase()) return false
  return record.updatedAt > (currentUpdatedAt ?? -1)
}

export type HydrationAction =
  | { type: 'restore'; record: PersistedSiweAuthRecord }
  | { type: 'refresh'; record: PersistedSiweAuthRecord }
  | { type: 'remove' }
  | { type: 'dormant' }

/** Decides what to do with a persisted record once a wallet has settled. */
export function resolveHydrationAction(
  record: PersistedSiweAuthRecord | null,
  connectedAddress: string | null,
  now = Date.now()
): HydrationAction {
  if (!connectedAddress) return { type: 'dormant' }
  if (!record) return { type: 'dormant' }
  if (record.tokens.address.toLowerCase() !== connectedAddress.toLowerCase()) {
    return { type: 'remove' }
  }
  if (isPersistedSiweAuthAccessActive(record, now)) return { type: 'restore', record }
  if (isPersistedSiweAuthRefreshActive(record, now)) return { type: 'refresh', record }
  return { type: 'remove' }
}

export type StorageEventAction =
  | { type: 'logout' }
  | { type: 'adopt'; record: PersistedSiweAuthRecord }
  | { type: 'ignore' }

/** Decides how to react to a cross-tab `storage` event for the SIWE auth key. */
export function resolveStorageEvent(
  newValue: string | null,
  currentAddress: string | null,
  currentUpdatedAt: number | null,
  now = Date.now()
): StorageEventAction {
  if (!currentAddress) return { type: 'ignore' }
  if (newValue == null) return { type: 'logout' }
  const record = parsePersistedSiweAuthRecord(newValue, now)
  if (!record) return { type: 'ignore' }
  if (!isAdoptableRecord(record, currentAddress, currentUpdatedAt)) return { type: 'ignore' }
  return { type: 'adopt', record }
}
