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
