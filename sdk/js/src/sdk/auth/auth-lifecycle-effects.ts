import type { Address, HexString } from '../types'
import type { PersistedSiweAuthRecord } from './siwe-persistence'

/** Session published to consumers. */
export interface SiweAuthSession {
  address: Address
}

/** Raw tokens exposed so apps with own backend can forward them. */
export interface SiweAuthTokens {
  siwe_token: HexString
  jwt_access_token: string
  jwt_refresh_token: string
  address: Address
}

/** SetStateAction<T | null> as a plain callable so helpers are React-agnostic and testable. */
export type NullableSetter<T> = (value: T | null | ((prev: T | null) => T | null)) => void

export interface SiweLifecycleClient {
  setBearerToken(token: string): void
  clearBearerToken(): void
  clearPrivateReadToken(): void
}

/** Shared private-read token cache surface. */
export interface SiweLifecycleCache {
  set(scopeKey: string, token: string, expiresAt: number): void
}

/** localStorage-ish surface for persisted SIWE auth. */
export interface SiweLifecycleStorage {
  read(): PersistedSiweAuthRecord | null
  write(record: PersistedSiweAuthRecord): void
  remove(): void
}

export interface SiweLifecycleReact {
  setSession: NullableSetter<SiweAuthSession>
  setTokens: NullableSetter<SiweAuthTokens>
  setAccessTokenExpiresAt: NullableSetter<number>
  setIsLoading: (b: boolean) => void
  setIsHydrating: (b: boolean) => void
  setError: (e: Error | null) => void
}

/** The full dependency-injection seam. `persistJwt` is read here so storage gating is centralized. */
export interface SiweLifecyclePorts {
  persistJwt: boolean
  client: SiweLifecycleClient
  storage: SiweLifecycleStorage
  cache: SiweLifecycleCache
  react: SiweLifecycleReact
  makeScopeKey: (address: string) => string
}

/**
 * Seed the shared private-read token cache so reads reuse this token instead of triggering a
 * second signature. Private reads authenticate via a scoped client (PrivanaClient.withPrivateReadToken),
 * so the client-wide bearer is never displaced here — arming a global X-SIWE header is unnecessary.
 */
export function armPrivateRead(
  ports: SiweLifecyclePorts,
  input: { siweToken: string; siweExpiry: number; scopeKey: string }
): void {
  ports.cache.set(input.scopeKey, input.siweToken, input.siweExpiry)
}

/**
 * Apply rotated JWTs to live state without publishing a session: bearer token, a partial token
 * merge, and the access-token expiry. Used by the refresh path, where no session change occurs.
 */
export function applyAccessRotation(
  ports: SiweLifecyclePorts,
  rotation: { accessToken: string; refreshToken: string; accessTokenExpiresAt: number }
): void {
  ports.client.setBearerToken(rotation.accessToken)
  ports.react.setTokens((prev) =>
    prev
      ? {
          ...prev,
          jwt_access_token: rotation.accessToken,
          jwt_refresh_token: rotation.refreshToken,
        }
      : prev
  )
  ports.react.setAccessTokenExpiresAt(rotation.accessTokenExpiresAt)
}

/** Publish a record as the live session: bearer token, address, complete token set, and expiry. */
export function publishSession(ports: SiweLifecyclePorts, record: PersistedSiweAuthRecord): void {
  ports.client.setBearerToken(record.tokens.jwt_access_token)
  ports.react.setSession({ address: record.tokens.address as Address })
  ports.react.setTokens({
    siwe_token: record.tokens.siwe_token as HexString,
    jwt_access_token: record.tokens.jwt_access_token,
    jwt_refresh_token: record.tokens.jwt_refresh_token,
    address: record.tokens.address as Address,
  })
  ports.react.setAccessTokenExpiresAt(record.accessTokenExpiresAt)
}

/** Persist the record to storage when `persistJwt` is on; pass `null` to remove. */
export function persistRecordIfEnabled(
  ports: SiweLifecyclePorts,
  record: PersistedSiweAuthRecord | null
): void {
  if (!ports.persistJwt) return
  if (record) ports.storage.write(record)
  else ports.storage.remove()
}

/** Clear every live auth surface: both client headers and all React session state, including the
 *  loading AND hydrating flags — a reset means no operation is loading or hydrating for this scope
 *  anymore, so a stale in-flight login or refresh whose await settles late is not the only thing
 *  that can clear it (and cannot strand the flag if no newer work follows). */
export function clearSessionEffects(ports: SiweLifecyclePorts): void {
  ports.client.clearPrivateReadToken()
  ports.client.clearBearerToken()
  ports.react.setSession(null)
  ports.react.setTokens(null)
  ports.react.setAccessTokenExpiresAt(null)
  ports.react.setIsLoading(false)
  ports.react.setIsHydrating(false)
  ports.react.setError(null)
}
