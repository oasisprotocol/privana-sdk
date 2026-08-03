import type { PrivanaClient } from '../client'
import type { Address, HexString } from '../types'
import { buildSiweLoginMessage, type SiweMessageValue } from './siwe'
import {
  applyRefreshToPersistedSiweAuthRecord,
  buildPersistedSiweAuthRecordFromLogin,
  isAdoptableRecord,
  isPersistedSiweAuthAccessActive,
  type PersistedSiweAuthRecord,
} from './siwe-persistence'
import { resolveActiveSessionAddress } from './siwe-auth-policy'
import {
  applyAccessRotation,
  armPrivateRead,
  clearSessionEffects,
  persistRecordIfEnabled,
  publishSession,
  type SiweLifecyclePorts,
} from './auth-lifecycle-effects'
import type { AuthLifecycleEvent, AuthLifecycleState, RefreshData } from './auth-lifecycle'
import { AUTH_CLOCK_SKEW_MS } from './auth-clock-skew'

/** Network surface the commands call; satisfied by a PrivanaClient or any structural stand-in. */
export type SiweLifecycleApi = Pick<
  PrivanaClient,
  'getSiweDomain' | 'getSiweNonce' | 'loginWithSiwe' | 'refreshJwtSession' | 'logoutJwtSession'
>

/** Wallet signing surface (wraps wagmi's getWalletClient + signMessage). */
export interface SiweLifecycleSigner {
  signSiweMessage(input: { account: Address; message: SiweMessageValue }): Promise<HexString>
}

/** Static-ish config read off the handle; the hook refreshes it each render. */
export interface SiweAuthControllerConfig {
  address: Address | undefined
  chainId: number
  apiUrl: string
  persistJwt: boolean
}

/** The framework-agnostic controller handle. Commands read state + config from here and
 *  dispatch events / call effect helpers through `ports`. Mutable dedup fields live here too. */
export interface SiweAuthController {
  config: SiweAuthControllerConfig
  ports: SiweLifecyclePorts
  api: SiweLifecycleApi
  signer: SiweLifecycleSigner
  loginInFlight: boolean
  /** Generation snapshot of the in-flight login, or -1 when idle. `reset` clears it so a stale
   *  login's catch/finally can detect it no longer owns the slot and must not clobber a newer
   *  scope's error/loading state — or clear flags a newer login has since claimed. This is tracked
   *  separately from `state.generation` because a successful login's own `commit` also bumps
   *  generation, which would otherwise look indistinguishable from an invalidating reset. */
  loginOwnerGeneration: number
  /** Generation snapshot of the in-flight hydration, or -1 when idle. Mirrors `loginOwnerGeneration`
   *  for the hydrating flag: `reset` clears it so a stale hydration's finally cannot pull the flag
   *  out from under a newer scope. Tracked separately from `state.generation` because a successful
   *  hydration's own `commit` (via ctrlRestoreSession) also bumps generation, which would otherwise
   *  look indistinguishable from an invalidating reset and strand the hydrating flag on success. */
  hydrateOwnerGeneration: number
  refreshPromise: Promise<void> | null
  getState(): AuthLifecycleState
  getSessionAddress(): string | null
  dispatch(event: AuthLifecycleEvent): void
}

function activeAddress(ctrl: SiweAuthController): string | null {
  return resolveActiveSessionAddress(
    ctrl.getSessionAddress(),
    ctrl.getState().currentRecord?.tokens.address
  )
}

/** Reset all live auth state + (optionally) persisted storage. Reclaims the login AND refresh slots,
 *  so a stale in-flight login or refresh (whose await may never settle) cannot block a fresh attempt
 *  or clobber the new scope's error/loading state from a late catch/finally — and a scope change
 *  during refresh cannot leave the new scope's hydration waiting on the previous backend's promise. */
export function ctrlReset(ctrl: SiweAuthController, removeStorage: boolean): void {
  ctrl.loginInFlight = false
  ctrl.loginOwnerGeneration = -1
  ctrl.hydrateOwnerGeneration = -1
  ctrl.refreshPromise = null
  ctrl.dispatch({ type: 'reset' })
  clearSessionEffects(ctrl.ports)
  if (removeStorage) persistRecordIfEnabled(ctrl.ports, null)
}

/** Make a record the live session: commit + private-read arming + session publish. */
export function ctrlRestoreSession(
  ctrl: SiweAuthController,
  record: PersistedSiweAuthRecord
): void {
  ctrl.dispatch({ type: 'commit', record })
  armPrivateRead(ctrl.ports, {
    siweToken: record.tokens.siwe_token,
    siweExpiry: record.siweTokenExpiresAt,
    scopeKey: ctrl.ports.makeScopeKey(record.tokens.address),
  })
  publishSession(ctrl.ports, record)
}

/** Before/after a refresh, adopt a concurrent cross-tab rotation instead of a redundant call.
 *  Adoption is a FULL restore because the newer record may come from another tab's fresh login,
 *  which rotated the SIWE token — a JWT-only apply would leave this tab reading against a stale
 *  private-read token. */
export function ctrlAdoptNewerRecordIfAvailable(ctrl: SiweAuthController): boolean {
  if (!ctrl.config.persistJwt) return false
  const record = ctrl.ports.storage.read()
  if (!record) return false
  const current = activeAddress(ctrl)
  if (!isAdoptableRecord(record, current, ctrl.getState().currentRecord?.updatedAt ?? null)) {
    return false
  }
  ctrlRestoreSession(ctrl, record)
  return true
}

/** Auto-login signature flow. Owns generation capture/recheck so a mid-flight logout, wallet
 *  switch, or network change aborts, and marks the address auto-attempted only once the slot is
 *  claimed — a no-op (slot busy) never suppresses a future auto-login for this address. */
export async function ctrlLogin(ctrl: SiweAuthController): Promise<void> {
  const address = ctrl.config.address
  if (!address) throw new Error('No wallet connected')
  if (ctrl.loginInFlight) return
  ctrl.loginInFlight = true
  ctrl.dispatch({ type: 'setAutoAttemptedAddress', address })
  ctrl.dispatch({ type: 'setAuthenticatingAddress', address })
  ctrl.ports.react.setIsLoading(true)
  ctrl.ports.react.setError(null)
  // Snapshot the network scope + api at command start. A runtime networkConfig/client change
  // (or any generation bump) invalidates this attempt; the snapshot guarantees the assembled SIWE
  // message never mixes a nonce/domain from one backend with a chain id asserted to another.
  const generation = ctrl.getState().generation
  ctrl.loginOwnerGeneration = generation
  const { chainId, apiUrl } = ctrl.config
  const api = ctrl.api
  try {
    const { message, expirationTime } = await buildSiweLoginMessage(api, {
      address,
      chainId,
      apiUrl,
    })
    const signature = await ctrl.signer.signSiweMessage({ account: address, message })
    const res = await api.loginWithSiwe({ siwe_message: message, signature })
    if (ctrl.getState().generation !== generation) return
    const record = buildPersistedSiweAuthRecordFromLogin(res, Date.now(), expirationTime.getTime())
    ctrlRestoreSession(ctrl, record)
    persistRecordIfEnabled(ctrl.ports, record)
  } catch (err) {
    // Only surface the error if this operation still owns the slot; a stale op (wallet/network
    // switched mid-sign, which cleared loginOwnerGeneration via reset) must not write into the new
    // scope's shared React state. Ownership is checked via loginOwnerGeneration (not state.generation)
    // because a successful login's own commit also bumps generation.
    if (ctrl.loginOwnerGeneration === generation) {
      ctrl.ports.react.setError(err instanceof Error ? err : new Error('Sign-in failed'))
    }
    throw err
  } finally {
    // Only clear if this op still owns the slot. A reset already reclaimed the slot + loading
    // flag for the new scope, and a newer login may have claimed the slot since — clearing
    // unconditionally would clobber that newer login's flags.
    if (ctrl.loginOwnerGeneration === generation) {
      ctrl.ports.react.setIsLoading(false)
      ctrl.loginInFlight = false
      ctrl.loginOwnerGeneration = -1
    }
  }
}

/** Best-effort revoke all refresh tokens (log out everywhere, including any stolen token) while
 *  the bearer is still set, then clear local state and suppress same-wallet re-login. */
export async function ctrlLogout(ctrl: SiweAuthController): Promise<void> {
  const refreshToken = ctrl.getState().refreshData?.refreshToken
  try {
    if (refreshToken) {
      try {
        await ctrl.api.logoutJwtSession({ refresh_token: refreshToken, revoke_all: true })
      } catch {
        // Best-effort: local state clears in finally regardless; don't block logout on revocation.
      }
    }
  } finally {
    // Reset AFTER the revocation call: /auth/jwt/logout authenticates via the JWT bearer
    // (Depends(get_current_user)), so clearing the bearer first would 401 and revoke nothing.
    ctrlReset(ctrl, ctrl.config.persistJwt)
    ctrl.dispatch({ type: 'setAutoAttemptedAddress', address: ctrl.config.address ?? null })
  }
}

/** Refresh the access token; adopt cross-tab rotations; clear on terminal failure. */
export async function ctrlRefreshAccessToken(ctrl: SiweAuthController): Promise<void> {
  const data = ctrl.getState().refreshData
  if (!data) return
  if (Date.now() >= data.refreshExpiresAt - AUTH_CLOCK_SKEW_MS) {
    ctrlReset(ctrl, ctrl.config.persistJwt)
    return
  }
  if (ctrl.refreshPromise) return ctrl.refreshPromise
  const generation = ctrl.getState().generation
  const promise = (async () => {
    try {
      if (ctrlAdoptNewerRecordIfAvailable(ctrl)) return
      const res = await ctrl.api.refreshJwtSession({ refresh_token: data.refreshToken })
      if (ctrl.getState().generation !== generation) return
      const refreshedAt = Date.now()
      const refreshData: RefreshData = {
        refreshToken: res.refresh_token,
        refreshExpiresAt: refreshedAt + res.refresh_expires_in * 1000,
      }
      const previous = ctrl.getState().currentRecord
      // refreshData always rotates (it holds the token for the NEXT refresh); currentRecord
      // rotates only when it exists AND we persist.
      if (previous && ctrl.config.persistJwt) {
        const nextRecord = applyRefreshToPersistedSiweAuthRecord(previous, res, refreshedAt)
        ctrl.dispatch({ type: 'refresh', refreshData, record: nextRecord })
        ctrl.ports.storage.write(nextRecord)
      } else {
        ctrl.dispatch({ type: 'refresh', refreshData, record: previous })
      }
      applyAccessRotation(ctrl.ports, {
        accessToken: res.token,
        refreshToken: res.refresh_token,
        accessTokenExpiresAt: refreshedAt + res.expires_in * 1000,
      })
    } catch {
      if (ctrl.getState().generation !== generation) return
      if (!ctrlAdoptNewerRecordIfAvailable(ctrl)) ctrlReset(ctrl, ctrl.config.persistJwt)
    }
  })()
  ctrl.refreshPromise = promise
  try {
    await promise
  } finally {
    // Only null the slot if this op still owns it. A reset since it started (network/client change)
    // reclaims the slot for a newer scope, and a newer refresh may have since claimed it — clearing
    // unconditionally would evict that newer refresh's in-flight promise.
    if (ctrl.refreshPromise === promise) ctrl.refreshPromise = null
  }
}

/** Refresh-first hydration: seed markers, commit, await refresh, publish if still active. */
export async function ctrlHydrateViaRefresh(
  ctrl: SiweAuthController,
  record: PersistedSiweAuthRecord,
  address: string
): Promise<void> {
  ctrl.dispatch({ type: 'setAutoAttemptedAddress', address })
  ctrl.dispatch({ type: 'setAuthenticatingAddress', address })
  ctrl.ports.react.setIsHydrating(true)
  ctrl.dispatch({ type: 'commit', record })
  const hydrationGen = ctrl.getState().generation
  ctrl.hydrateOwnerGeneration = hydrationGen
  try {
    await ctrlRefreshAccessToken(ctrl).catch(() => {})
    const fresh = ctrl.getState().currentRecord
    if (
      fresh &&
      fresh.tokens.address.toLowerCase() === address.toLowerCase() &&
      isPersistedSiweAuthAccessActive(fresh)
    ) {
      ctrlRestoreSession(ctrl, fresh)
    } else if (ctrl.getState().generation === hydrationGen) {
      ctrl.dispatch({ type: 'setAutoAttemptedAddress', address: null })
    }
  } finally {
    // Only clear if this hydration still owns the slot. A reset since it started (network/client
    // change) reclaimed the flag for the new scope — clearing unconditionally would pull it out
    // from under a newer hydration still in flight. Ownership is checked via hydrateOwnerGeneration
    // (not state.generation) because a successful hydration's own ctrlRestoreSession commit also
    // bumps generation, which would otherwise strand the flag on the happy path.
    if (ctrl.hydrateOwnerGeneration === hydrationGen) {
      ctrl.ports.react.setIsHydrating(false)
      ctrl.hydrateOwnerGeneration = -1
    }
  }
}
