import type { PersistedSiweAuthRecord } from './siwe-persistence'

export type RefreshData = { refreshToken: string; refreshExpiresAt: number }

/**
 * Mutable lifecycle state for the SIWE auth session. Folded into a single object so that
 * multi-field transitions (reset, commit) are atomic and testable.
 */
export interface AuthLifecycleState {
  /** Monotonic generation; bumped on every authoritative transition so stale
   *  async ops can detect invalidation by capturing before an await and
   *  re-checking after. */
  generation: number
  /** Refresh credentials for the current session. */
  refreshData: RefreshData | null
  /** Last persisted record applied in this tab; drives cross-tab "newer record"
   *  comparisons and refresh-record updates. */
  currentRecord: PersistedSiweAuthRecord | null
  /** Address auto-login has been attempted for (suppresses re-login after
   *  explicit logout). */
  autoAttemptedAddress: string | null
  /** Address owning an in-flight login/hydration; feeds disconnect/mismatch
   *  invalidation so a pending op is cancelled before any session is published.
   *  Cleared only by the reset transition, never in an op finally, so a stale
   *  op can't clobber the owner a newer op has claimed. */
  authenticatingAddress: string | null
  /** Address hydration has already been attempted for, so it runs once per
   *  wallet. */
  hydratedAddress: string | null
}

/** Lifecycle events. Authoritative transitions (`reset`, `commit`) bump generation; `refresh` and
 *  the single-field marker events do not. Every lifecycle mutation flows through one of these, so
 *  an event log fully determines state. */
export type AuthLifecycleEvent =
  | { type: 'reset' }
  | { type: 'commit'; record: PersistedSiweAuthRecord }
  | { type: 'refresh'; refreshData: RefreshData; record: PersistedSiweAuthRecord | null }
  | { type: 'setAutoAttemptedAddress'; address: string | null }
  | { type: 'setAuthenticatingAddress'; address: string | null }
  | { type: 'setHydratedAddress'; address: string | null }
  | { type: 'clearCurrentRecord' }

export function initialAuthLifecycleState(): AuthLifecycleState {
  return {
    generation: 0,
    refreshData: null,
    currentRecord: null,
    autoAttemptedAddress: null,
    authenticatingAddress: null,
    hydratedAddress: null,
  }
}

export function reduceAuthLifecycle(
  state: AuthLifecycleState,
  event: AuthLifecycleEvent
): AuthLifecycleState {
  switch (event.type) {
    case 'reset':
      return {
        generation: state.generation + 1,
        refreshData: null,
        currentRecord: null,
        autoAttemptedAddress: null,
        authenticatingAddress: null,
        hydratedAddress: null,
      }
    case 'commit':
      return {
        ...state,
        generation: state.generation + 1,
        refreshData: {
          refreshToken: event.record.tokens.jwt_refresh_token,
          refreshExpiresAt: event.record.refreshTokenExpiresAt,
        },
        currentRecord: event.record,
      }
    case 'refresh':
      return {
        ...state,
        refreshData: event.refreshData,
        currentRecord: event.record,
      }
    case 'setAutoAttemptedAddress':
      return { ...state, autoAttemptedAddress: event.address }
    case 'setAuthenticatingAddress':
      return { ...state, authenticatingAddress: event.address }
    case 'setHydratedAddress':
      return { ...state, hydratedAddress: event.address }
    case 'clearCurrentRecord':
      return { ...state, currentRecord: null }
  }
}
