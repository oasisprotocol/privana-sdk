import { AUTH_CLOCK_SKEW_MS } from '../auth/auth-clock-skew'

interface PrivateReadTokenEntry {
  token: string
  expiresAt: number
}

const cache = new Map<string, PrivateReadTokenEntry>()

export function createScopeKey(apiUrl: string, chainId: number, address: string): string {
  return `${apiUrl.replace(/\/$/, '')}:${chainId}:${address.toLowerCase()}`
}

export function getCachedPrivateReadToken(scopeKey: string): string | null {
  const cached = cache.get(scopeKey)
  if (!cached) return null
  if (cached.expiresAt <= Date.now() + AUTH_CLOCK_SKEW_MS) {
    cache.delete(scopeKey)
    return null
  }
  return cached.token
}

export function setCachedPrivateReadToken(
  scopeKey: string,
  token: string,
  expiresAt: number
): void {
  cache.set(scopeKey, { token, expiresAt })
}

export function deleteCachedPrivateReadToken(scopeKey: string): void {
  cache.delete(scopeKey)
}

type RejectedTokenListener = (token: string) => void

const rejectedTokenListeners = new Set<RejectedTokenListener>()

/** Lets a session owner hear that the server rejected a private-read token. */
export function onPrivateReadTokenRejected(listener: RejectedTokenListener): () => void {
  rejectedTokenListeners.add(listener)
  return () => {
    rejectedTokenListeners.delete(listener)
  }
}

export function reportPrivateReadTokenRejected(token: string): void {
  for (const listener of rejectedTokenListeners) listener(token)
}
