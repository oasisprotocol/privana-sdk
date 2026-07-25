/**
 * Pure auth-policy planners for the direct (in-app) SIWE auth flow: what the connection-driven
 * effect should do (auto-login / disconnect / address-mismatch invalidation) and which address this
 * tab treats as its active auth authority. Pure so the provider stays a thin executor and each rule
 * is unit-testable in isolation.
 */

/**
 * The address this tab currently treats as its cross-tab authority, taken from the first available
 * candidate: the published session's address, then — before the session is published (e.g. during
 * refresh-first hydration) — the pending persisted record's address, then the authenticating
 * address of an in-flight login. Storage listeners and adoption use this so a logout or a newer
 * rotation in another tab is honored even while hydration/login is in flight, instead of being
 * ignored (which could let a successful login resurrect a session another tab just ended, or let a
 * doomed refresh discard another tab's successful rotation).
 */
export function resolveActiveSessionAddress(
  ...candidates: (string | null | undefined)[]
): string | null {
  return candidates.find((candidate) => !!candidate) ?? null
}

export type AutoLoginEffectAction =
  | { type: 'wait' }
  | { type: 'reset-on-disconnect' }
  | { type: 'clear-on-mismatch' }
  | { type: 'auto-login' }
  | { type: 'noop' }

export interface AutoLoginEffectInput {
  status: string
  isConnected: boolean
  address: string | null
  sessionAddress: string | null
  autoLogin: boolean
  isLoading: boolean
  /** True while a persisted session is being refreshed on load; suppresses auto-login until it settles. */
  isHydrating: boolean
  autoAttemptedAddress: string | null
  /**
   * Address that owns an in-flight login/hydration. Before a session is published this is the only
   * signal that a pending op must be invalidated on disconnect or address change; it is folded into
   * the disconnect/mismatch guards below alongside `sessionAddress`.
   */
  authenticatingAddress: string | null
}

/**
 * Decides what the connection-driven effect should do. Disconnect and address-mismatch
 * invalidation run regardless of `autoLogin` so a manually authenticated session is always
 * dropped when the wallet changes or disconnects; `autoLogin` only gates the automatic
 * `login()` branch.
 */
export function resolveAutoLoginEffectAction(input: AutoLoginEffectInput): AutoLoginEffectAction {
  const {
    status,
    isConnected,
    address,
    sessionAddress,
    autoLogin,
    isLoading,
    isHydrating,
    autoAttemptedAddress,
    authenticatingAddress,
  } = input
  // Guarding on the in-flight owner too means a pending op is cancelled even with no session yet,
  // so its stale async result cannot then be committed.
  const activeAddress = resolveActiveSessionAddress(sessionAddress, authenticatingAddress)
  if (status === 'connecting' || status === 'reconnecting') return { type: 'wait' }
  if (!isConnected && activeAddress) return { type: 'reset-on-disconnect' }
  if (
    isConnected &&
    address &&
    activeAddress &&
    address.toLowerCase() !== activeAddress.toLowerCase()
  ) {
    return { type: 'clear-on-mismatch' }
  }
  if (!autoLogin) return { type: 'noop' }
  // Defer auto-login while a persisted session is hydrating: the refresh may yet publish a session,
  // and a concurrent signature would double-sign. Once isHydrating settles to false the effect
  // re-evaluates (it is a dependency) and auto-login proceeds when no session was established.
  if (isHydrating) return { type: 'wait' }
  if (isConnected && address && !sessionAddress && !isLoading && autoAttemptedAddress !== address) {
    return { type: 'auto-login' }
  }
  return { type: 'noop' }
}
