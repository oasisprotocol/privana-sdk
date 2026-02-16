'use client'

import type { WalletClient } from 'viem'
import type { Address } from '../types'

export interface SiweAuthClient {
  getSiweToken: () => string | null
  setSiweToken: (token: string) => void
  clearSiweToken: () => void
  getSiweDomain: () => Promise<{ domain: string }>
  siweLogin: (request: { siwe_message: string; signature: string }) => Promise<{ token: string }>
}

// SiweAuth tokens default to 24h validity on-chain; keep a 23h client TTL to refresh
// proactively and avoid edge-case expiry during polling/read bursts.
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000

// In-flight de-duplication to avoid multiple concurrent SIWE sign popups when several
// private-read hooks mount at once for the same account+chain.
const inflight = new Map<string, Promise<string>>()

type FailureState = {
  untilMs: number
  attempts: number
  lastFailureMs: number
}

const FAILURE_COOLDOWN_BASE_MS = 60 * 1000
const FAILURE_COOLDOWN_MAX_MS = 5 * 60 * 1000
const FAILURE_COOLDOWN_RESET_WINDOW_MS = 10 * 60 * 1000

const failures = new Map<string, FailureState>()

export class SiweAuthCooldownError extends Error {
  readonly code = 'SIWE_AUTH_COOLDOWN' as const
  readonly untilMs: number
  readonly retryAfterMs: number

  constructor(args: { untilMs: number; retryAfterMs: number }) {
    const retryAfterSeconds = Math.max(1, Math.ceil(args.retryAfterMs / 1000))
    super(
      `SIWE authentication is temporarily disabled after a recent failure. Retry in ~${retryAfterSeconds}s.`
    )
    this.name = 'SiweAuthCooldownError'
    Object.setPrototypeOf(this, SiweAuthCooldownError.prototype)
    this.untilMs = args.untilMs
    this.retryAfterMs = args.retryAfterMs
  }
}

export function isSiweAuthCooldownError(error: unknown): error is SiweAuthCooldownError {
  if (!error || typeof error !== 'object') return false
  const e = error as { code?: unknown; retryAfterMs?: unknown }
  return e.code === 'SIWE_AUTH_COOLDOWN' && typeof e.retryAfterMs === 'number'
}

function cooldownMs(attempts: number): number {
  const clampedAttempts = Math.max(1, Math.min(attempts, 16))
  const ms = FAILURE_COOLDOWN_BASE_MS * 2 ** (clampedAttempts - 1)
  return Math.min(ms, FAILURE_COOLDOWN_MAX_MS)
}

function recordFailure(storageKey: string, nowMs: number): FailureState {
  const previous = failures.get(storageKey)
  const attempts =
    previous && nowMs - previous.lastFailureMs <= FAILURE_COOLDOWN_RESET_WINDOW_MS
      ? previous.attempts + 1
      : 1
  const state: FailureState = {
    untilMs: nowMs + cooldownMs(attempts),
    attempts,
    lastFailureMs: nowMs,
  }
  failures.set(storageKey, state)
  return state
}

function clearFailure(storageKey: string): void {
  failures.delete(storageKey)
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function safeGetItem(key: string): string | null {
  const storage = getSessionStorage()
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function safeSetItem(key: string, value: string): void {
  const storage = getSessionStorage()
  if (!storage) return
  try {
    storage.setItem(key, value)
  } catch {
    // ignore
  }
}

function safeRemoveItem(key: string): void {
  const storage = getSessionStorage()
  if (!storage) return
  try {
    storage.removeItem(key)
  } catch {
    // ignore
  }
}

function normalizeCacheScope(cacheScope?: string): string | null {
  if (!cacheScope) return null
  try {
    const url = new URL(cacheScope)
    return url.origin
  } catch {
    return cacheScope
  }
}

function getStorageKey(args: { chainId: number; address: Address; cacheScope?: string }): string {
  const scope = normalizeCacheScope(args.cacheScope)
  const addr = args.address.toLowerCase()
  return scope
    ? `flexvaults:siweToken:${scope}:${args.chainId}:${addr}`
    : `flexvaults:siweToken:${args.chainId}:${addr}`
}

type CachedToken = {
  token: string
  expiresAt: number
}

function isExpired(expiresAt: number, nowMs: number): boolean {
  return expiresAt - nowMs <= TOKEN_REFRESH_SKEW_MS
}

function parseCachedToken(raw: string): CachedToken | null {
  try {
    const parsed = JSON.parse(raw) as Partial<CachedToken>
    if (typeof parsed?.token === 'string' && typeof parsed?.expiresAt === 'number') {
      return parsed as CachedToken
    }
  } catch {
    // fall through
  }

  return null
}

function generateNonce(length = 8): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const values = new Uint8Array(length)
  if (typeof globalThis.crypto?.getRandomValues !== 'function') {
    throw new Error('Secure randomness is required for SIWE nonce generation')
  }
  globalThis.crypto.getRandomValues(values)
  return Array.from(values, (v) => charset[v % charset.length]).join('')
}

function buildSiweMessage(args: {
  domain: string
  address: Address
  uri: string
  chainId: number
  statement?: string
}): string {
  const statement = args.statement ?? 'Sign in to Flexvaults'
  const nonce = generateNonce()
  const issuedAt = new Date().toISOString()

  return [
    `${args.domain} wants you to sign in with your Ethereum account:`,
    `${args.address}`,
    '',
    statement,
    '',
    `URI: ${args.uri}`,
    'Version: 1',
    `Chain ID: ${args.chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n')
}

/**
 * Returns true if the error is a wallet user-rejection (EIP-1193 code 4001).
 * Used by polling hooks to stop retrying/polling when the user declines signing.
 */
export function isUserRejection(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 6; depth++) {
    if (!current || typeof current !== 'object') return false
    const maybe = current as { name?: unknown; code?: unknown; cause?: unknown }

    if (maybe.name === 'UserRejectedRequestError') return true
    if (maybe.code === 4001 || maybe.code === '4001') return true

    current = maybe.cause
  }

  return false
}

/**
 * React Query refetchInterval callback factory for SIWE-authenticated polling hooks.
 * Stops polling entirely on user rejection (the user must manually refetch).
 * Pauses polling during auth cooldown, then resumes normally.
 */
export const refetchUnlessRejected =
  (pollingInterval: number) =>
  (query: { state: { error: Error | null } }): number | false => {
    const error = query.state.error
    if (isUserRejection(error)) return false
    if (isSiweAuthCooldownError(error)) {
      return Math.max(pollingInterval, error.retryAfterMs)
    }
    return pollingInterval
  }

export async function ensureSiweToken(args: {
  client: SiweAuthClient
  chainId: number
  walletClient: WalletClient
  address: Address
  /**
   * Optional namespace for token caching (e.g., API base URL). This avoids token collisions
   * if a consumer uses multiple accounting deployments on the same chain.
   */
  cacheScope?: string
}): Promise<string> {
  const storageKey = getStorageKey({
    chainId: args.chainId,
    address: args.address,
    cacheScope: args.cacheScope,
  })
  const nowMs = Date.now()

  const existing = args.client.getSiweToken()
  if (existing) {
    const cachedRaw = safeGetItem(storageKey)
    if (cachedRaw) {
      const cached = parseCachedToken(cachedRaw)
      if (cached && cached.token === existing && !isExpired(cached.expiresAt, nowMs)) {
        clearFailure(storageKey)
        return existing
      }
    }

    // In-memory token is stale unless it matches the active account/network cache key.
    // Keep sessionStorage intact so switching back to another account/network can reuse
    // its scoped cached token without forcing an unnecessary re-sign.
    args.client.clearSiweToken()
  }

  const cached = safeGetItem(storageKey)
  if (cached) {
    const parsed = parseCachedToken(cached)
    if (parsed && !isExpired(parsed.expiresAt, nowMs)) {
      args.client.setSiweToken(parsed.token)
      clearFailure(storageKey)
      return parsed.token
    }

    safeRemoveItem(storageKey)
  }

  const pending = inflight.get(storageKey)
  if (pending) return pending

  const failure = failures.get(storageKey)
  if (failure && nowMs < failure.untilMs) {
    throw new SiweAuthCooldownError({
      untilMs: failure.untilMs,
      retryAfterMs: failure.untilMs - nowMs,
    })
  }

  const promise = (async () => {
    try {
      const { domain } = await args.client.getSiweDomain()
      const chainId = args.chainId

      const message = buildSiweMessage({
        domain,
        uri: `https://${domain}`,
        chainId,
        address: args.address,
        statement: 'Sign in to Flexvaults',
      })

      const signature = await args.walletClient.signMessage({
        account: args.address,
        message,
      })

      const { token } = await args.client.siweLogin({
        siwe_message: message,
        signature,
      })

      args.client.setSiweToken(token)
      const entry: CachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS }
      safeSetItem(storageKey, JSON.stringify(entry))
      clearFailure(storageKey)
      return token
    } catch (error) {
      if (!isUserRejection(error)) {
        recordFailure(storageKey, Date.now())
      }
      throw error
    }
  })().finally(() => inflight.delete(storageKey))

  inflight.set(storageKey, promise)
  return promise
}
