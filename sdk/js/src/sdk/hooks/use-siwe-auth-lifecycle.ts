'use client'

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getWalletClient } from 'wagmi/actions'
import { WagmiContext } from 'wagmi'
import type { HexString } from '../types'
import {
  getSiweAuthLocalStorage,
  readPersistedSiweAuth,
  removePersistedSiweAuth,
  resolveHydrationAction,
  resolveStorageEvent,
  writePersistedSiweAuth,
  type PersistedSiweAuthRecord,
} from '../auth/siwe-persistence'
import { resolveActiveSessionAddress, resolveAutoLoginEffectAction } from '../auth/siwe-auth-policy'
import {
  initialAuthLifecycleState,
  reduceAuthLifecycle,
  type AuthLifecycleEvent,
} from '../auth/auth-lifecycle'
import {
  ctrlHydrateViaRefresh,
  ctrlLogin,
  ctrlLogout,
  ctrlRefreshAccessToken,
  ctrlReset,
  ctrlRestoreSession,
  type SiweAuthController,
} from '../auth/siwe-auth-controller'
import { AUTH_CLOCK_SKEW_MS } from '../auth/auth-clock-skew'
import { createScopeKey, setCachedPrivateReadToken } from '../utils/private-read-token-store'
import { useSafeAccount } from './use-safe-account'
import type { SiweLifecyclePorts } from '../auth/auth-lifecycle-effects'
import type { SiweAuthSession, SiweAuthTokens } from '../auth/auth-lifecycle-effects'

export interface SiweAuthRuntimeDeps {
  storageKey: string
  apiUrl: string
  chainId: number
  persistJwt: boolean
  autoLogin: boolean
  /** The subset of PrivanaClient the lifecycle touches. */
  client: SiweLifecyclePorts['client']
  api: SiweAuthController['api']
}

export interface SiweAuthLifecycleResult {
  isAuthenticated: boolean
  isLoading: boolean
  isHydrating: boolean
  error: Error | null
  session: SiweAuthSession | null
  accessToken: string | undefined
  tokens: SiweAuthTokens | null
  login: () => Promise<void>
  logout: () => Promise<void>
}

export function useSiweAuthLifecycle(deps: SiweAuthRuntimeDeps): SiweAuthLifecycleResult {
  const { storageKey, apiUrl, chainId, persistJwt, autoLogin, client, api } = deps
  const wagmiContext = useContext(WagmiContext)
  const { address, isConnected, status } = useSafeAccount()

  const [session, setSession] = useState<SiweAuthSession | null>(null)
  const [tokens, setTokens] = useState<SiweAuthTokens | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isHydrating, setIsHydrating] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [accessTokenExpiresAt, setAccessTokenExpiresAt] = useState<number | null>(null)

  const sessionRef = useRef<SiweAuthSession | null>(null)
  const prevPersistJwtRef = useRef<boolean | undefined>(undefined)
  const authRef = useRef(initialAuthLifecycleState())

  const storageAdapter = useMemo(
    () => ({
      read: () => {
        const ls = getSiweAuthLocalStorage()
        return ls ? readPersistedSiweAuth(ls, storageKey) : null
      },
      write: (record: PersistedSiweAuthRecord) => {
        const ls = getSiweAuthLocalStorage()
        if (ls) writePersistedSiweAuth(ls, storageKey, record)
      },
      remove: () => {
        const ls = getSiweAuthLocalStorage()
        if (ls) removePersistedSiweAuth(ls, storageKey)
      },
    }),
    [storageKey]
  )

  // Values the once-created ports/controller closures must read live rather than capture.
  const scopeInputsRef = useRef({ apiUrl, chainId })
  scopeInputsRef.current.apiUrl = apiUrl
  scopeInputsRef.current.chainId = chainId
  const wagmiContextRef = useRef(wagmiContext)
  wagmiContextRef.current = wagmiContext

  const portsRef = useRef<SiweLifecyclePorts | null>(null)
  if (!portsRef.current) {
    portsRef.current = {
      persistJwt,
      client,
      storage: storageAdapter,
      cache: { set: setCachedPrivateReadToken },
      react: {
        setSession,
        setTokens,
        setAccessTokenExpiresAt,
        setIsLoading,
        setIsHydrating,
        setError,
      },
      makeScopeKey: (addr: string) =>
        createScopeKey(scopeInputsRef.current.apiUrl, scopeInputsRef.current.chainId, addr),
    }
  }
  const ports = portsRef.current
  // Keep mutable port fields current without rebinding commands, so a runtime networkConfig
  // (apiUrl/chainId/storageKey) or client change takes effect.
  ports.persistJwt = persistJwt
  ports.client = client
  ports.storage = storageAdapter

  const ctrlRef = useRef<SiweAuthController | null>(null)
  if (!ctrlRef.current) {
    ctrlRef.current = {
      config: { address, chainId, apiUrl, persistJwt },
      ports,
      api,
      signer: {
        signSiweMessage: async ({ account, message }) => {
          const ctx = wagmiContextRef.current
          if (!ctx) throw new Error('WagmiProvider is required for SIWE auth')
          const walletClient = await getWalletClient(ctx)
          if (!walletClient) throw new Error('No wallet client available')
          return walletClient.signMessage({
            account: walletClient.account ?? account,
            message,
          }) as Promise<HexString>
        },
      },
      loginInFlight: false,
      loginOwnerGeneration: -1,
      hydrateOwnerGeneration: -1,
      refreshPromise: null,
      getState: () => authRef.current,
      getSessionAddress: () => sessionRef.current?.address ?? null,
      dispatch: (event: AuthLifecycleEvent) => {
        authRef.current = reduceAuthLifecycle(authRef.current, event)
      },
    }
  }
  const ctrl = ctrlRef.current
  ctrl.config = { address, chainId, apiUrl, persistJwt }
  ctrl.api = api

  const login = useCallback(() => ctrlLogin(ctrl), [ctrl])
  const logout = useCallback(() => ctrlLogout(ctrl), [ctrl])
  const refreshAccessToken = useCallback(() => ctrlRefreshAccessToken(ctrl), [ctrl])
  const resetSession = useCallback(() => ctrlReset(ctrl, false), [ctrl])
  const clearSession = useCallback(() => ctrlReset(ctrl, ctrl.config.persistJwt), [ctrl])
  const restoreSession = useCallback(
    (record: PersistedSiweAuthRecord) => ctrlRestoreSession(ctrl, record),
    [ctrl]
  )
  const hydrateViaRefresh = useCallback(
    (record: PersistedSiweAuthRecord, addr: string) => ctrlHydrateViaRefresh(ctrl, record, addr),
    [ctrl]
  )

  // Refresh scheduler.
  useEffect(() => {
    if (accessTokenExpiresAt == null) return
    const delay = Math.max(accessTokenExpiresAt - AUTH_CLOCK_SKEW_MS - Date.now(), 0)
    const timer = setTimeout(() => {
      void refreshAccessToken()
    }, delay)
    return () => clearTimeout(timer)
  }, [accessTokenExpiresAt, refreshAccessToken])

  // Network scope (apiUrl/chainId/client) tracking + persisted-session hydration, combined so the
  // reset→hydrate ordering is structural rather than dependent on effect declaration order. The
  // reset is memory-only by design: it must NOT remove the destination scope's persisted record,
  // so the hydration that immediately follows can restore a session stored under the new
  // storageKey (the reset cleared hydratedAddress, so hydration re-runs against the current key).
  const scopeRef = useRef<
    { apiUrl: string; chainId: number; client: SiweLifecyclePorts['client'] } | undefined
  >(undefined)
  useEffect(() => {
    const prev = scopeRef.current
    scopeRef.current = { apiUrl, chainId, client }
    const scopeChanged =
      !!prev && !(prev.apiUrl === apiUrl && prev.chainId === chainId && prev.client === client)
    if (scopeChanged) {
      ctrlReset(ctrl, false)
    }

    if (!persistJwt) return
    if (status === 'connecting' || status === 'reconnecting') return
    if (!isConnected || !address) return
    if (ctrl.getState().hydratedAddress === address) return
    ctrl.dispatch({ type: 'setHydratedAddress', address })

    const action = resolveHydrationAction(storageAdapter.read(), address)
    switch (action.type) {
      case 'restore':
        restoreSession(action.record)
        ctrl.dispatch({ type: 'setAutoAttemptedAddress', address })
        break
      case 'refresh':
        void hydrateViaRefresh(action.record, address)
        break
      case 'remove':
        storageAdapter.remove()
        break
      case 'dormant':
        break
    }
  }, [
    apiUrl,
    chainId,
    client,
    persistJwt,
    status,
    isConnected,
    address,
    storageAdapter,
    ctrl,
    restoreSession,
    hydrateViaRefresh,
  ])

  // Auto-login / disconnect / mismatch handling.
  useEffect(() => {
    const action = resolveAutoLoginEffectAction({
      status,
      isConnected,
      address: address ?? null,
      sessionAddress: session?.address ?? null,
      autoLogin,
      isLoading,
      isHydrating,
      autoAttemptedAddress: ctrl.getState().autoAttemptedAddress,
      authenticatingAddress: ctrl.getState().authenticatingAddress,
    })
    switch (action.type) {
      case 'wait':
      case 'noop':
        return
      case 'reset-on-disconnect':
        resetSession()
        return
      case 'clear-on-mismatch':
        clearSession()
        return
      case 'auto-login':
        // autoAttemptedAddress is marked inside ctrlLogin once the slot is claimed, so a no-op
        // (slot already busy) does not suppress a future auto-login for this address.
        void login().catch(() => {})
        return
    }
  }, [
    autoLogin,
    status,
    isConnected,
    address,
    session,
    isLoading,
    isHydrating,
    ctrl,
    login,
    clearSession,
    resetSession,
  ])

  // Cross-tab storage synchronization.
  useEffect(() => {
    if (!persistJwt || typeof window === 'undefined') return
    function onStorage(event: StorageEvent) {
      if (event.key !== storageKey) return
      const currentAddress = resolveActiveSessionAddress(
        sessionRef.current?.address,
        ctrl.getState().currentRecord?.tokens.address,
        ctrl.getState().authenticatingAddress
      )
      const action = resolveStorageEvent(
        event.newValue,
        currentAddress,
        ctrl.getState().currentRecord?.updatedAt ?? null
      )
      switch (action.type) {
        case 'logout':
          resetSession()
          if (currentAddress)
            ctrl.dispatch({ type: 'setAutoAttemptedAddress', address: currentAddress })
          break
        case 'adopt':
          // A full restore, not a JWT-only apply: the other tab may have performed a fresh
          // login, rotating the SIWE token and private-read token.
          restoreSession(action.record)
          break
        case 'ignore':
          break
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [persistJwt, storageKey, ctrl, restoreSession, resetSession])

  // Only an observed runtime true->false transition removes storage. An initial `false` stays
  // dormant so a memory-only provider can never delete (and thus cross-tab log out) another tab's
  // persisted session.
  useEffect(() => {
    const prev = prevPersistJwtRef.current
    prevPersistJwtRef.current = persistJwt
    if (!(prev === true && !persistJwt)) return
    ctrl.dispatch({ type: 'clearCurrentRecord' })
    storageAdapter.remove()
  }, [persistJwt, storageAdapter, ctrl])

  // Mirror the published session for synchronous reads.
  useEffect(() => {
    sessionRef.current = session
  }, [session])

  return useMemo(
    () => ({
      isAuthenticated: !!session,
      isLoading: isLoading || isHydrating,
      isHydrating,
      error,
      session,
      accessToken: tokens?.jwt_access_token,
      tokens,
      login,
      logout,
    }),
    [session, isLoading, isHydrating, error, tokens, login, logout]
  )
}
