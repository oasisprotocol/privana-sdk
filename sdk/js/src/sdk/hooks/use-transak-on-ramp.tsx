'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TransakWidgetFrame } from '../on-ramp/transak-frame'
import {
  requestTransakWidgetSession,
  transakOnRampAdapter,
  type TransakWidgetAction,
  type TransakWidgetSession,
} from '../on-ramp/transak-adapter'
import { matchesOnRampTransaction } from '../on-ramp/provider'
import type { OnRampRecord } from '../types'
import {
  useOnRamp,
  type OnRampDebugEvent,
  type OnRampFlowStatus,
  type UseOnRampOptions,
  type UseOnRampResult,
} from './use-on-ramp'
import { usePrivateReadRequest } from './use-private-read-request'

export type TransakOnRampStatus = OnRampFlowStatus
export type TransakOnRampDebugEvent = OnRampDebugEvent

export interface UseTransakOnRampOptions extends Omit<UseOnRampOptions, 'adapter'> {
  iframeTitle?: string
  iframeClassName?: string
}

export interface TransakOnRampLaunchRequest {
  /** Canonical configured Transak asset code, currently `usdc`. */
  providerAssetCode: string
  /** Required only when `postDepositLock` needs an amount to pre-sign. */
  quoteCurrencyAmount?: string
}

export interface UseTransakOnRampResult extends Omit<
  UseOnRampResult,
  | 'prepareOnRampIntent'
  | 'handleProviderLaunchReady'
  | 'handleProviderLaunchFailed'
  | 'handleProviderEvent'
  | 'handleProviderClosed'
> {
  isLaunching: boolean
  isWidgetOpen: boolean
  /** Hardened iframe for the current in-memory session, or null when closed. */
  widget: ReactNode
  /** Create a fresh intent and session from an explicit user launch. */
  launch: (request: TransakOnRampLaunchRequest) => Promise<void>
  /** Explicitly request a new single-use URL for the current unresolved intent. */
  recreateSession: () => Promise<void>
  closeWidget: () => Promise<void>
}

interface TransakSessionRequest {
  generation: number
  promise: Promise<void>
}

export function getMountedTransakSessionError(
  action: 'launch' | 'reopen',
  hasMountedSession: boolean
): Error | null {
  if (!hasMountedSession) return null
  return action === 'launch'
    ? new Error('Close the current Transak checkout before launching another')
    : new Error('Close or expire the current Transak checkout before reopening')
}

export function getTransakSessionContextError({
  currentGeneration,
  expectedGeneration,
  scopeChanged,
}: {
  currentGeneration: number
  expectedGeneration: number
  scopeChanged: boolean
}): Error | null {
  if (currentGeneration !== expectedGeneration) {
    return new Error('Transak checkout request was cancelled')
  }
  if (scopeChanged) {
    return new Error('On-ramp account or network changed while creating the session')
  }
  return null
}

export function getTransakSessionRequestError({
  currentGeneration,
  expectedGeneration,
  scopeChanged,
  activeIntentId,
  expectedIntentId,
}: {
  currentGeneration: number
  expectedGeneration: number
  scopeChanged: boolean
  activeIntentId: string | null
  expectedIntentId: string
}): Error | null {
  const contextError = getTransakSessionContextError({
    currentGeneration,
    expectedGeneration,
    scopeChanged,
  })
  if (contextError) return contextError
  if (activeIntentId !== expectedIntentId) {
    return new Error('The Transak purchase intent is no longer active')
  }
  return null
}

export function shouldSurfaceTransakSessionFailure({
  status,
  activeIntentId,
  activeVerificationId,
  activeVerificationRecord,
  expectedIntentId,
}: {
  status: TransakOnRampStatus
  activeIntentId: string | null
  activeVerificationId: string | null
  activeVerificationRecord: OnRampRecord | null
  expectedIntentId: string | null
}): boolean {
  if (!expectedIntentId || activeIntentId !== expectedIntentId) return false

  // Delivery polling starts before a provider row exists, so there is no
  // active verification ID to compare yet.
  if (status === 'awaiting-delivery') return false

  const ownsActiveVerification = activeVerificationRecord
    ? matchesOnRampTransaction(activeVerificationRecord, expectedIntentId)
    : activeVerificationId === expectedIntentId
  return !(ownsActiveVerification && (status === 'verifying' || status === 'credited'))
}

/** Thin Transak session and iframe adapter over the shared on-ramp state machine. */
export function useTransakOnRamp(options: UseTransakOnRampOptions): UseTransakOnRampResult {
  const { iframeTitle, iframeClassName, ...coreOptions } = options
  const { executePrivateRead, privateReadQueryScope } = usePrivateReadRequest()
  const core = useOnRamp({ ...coreOptions, adapter: transakOnRampAdapter })
  const {
    prepareOnRampIntent,
    handleProviderLaunchReady,
    handleProviderLaunchFailed,
    handleProviderEvent,
    handleProviderClosed,
    refreshPending,
  } = core

  const [session, setSessionState] = useState<TransakWidgetSession | null>(null)
  const [isLaunching, setIsLaunching] = useState(false)
  const sessionRef = useRef<TransakWidgetSession | null>(null)
  const mountedSessionScopeRef = useRef<symbol | null>(null)
  const generationRef = useRef(0)
  const sessionRequestRef = useRef<TransakSessionRequest | null>(null)
  const activeIntentIdRef = useRef(core.activeIntentId)
  activeIntentIdRef.current = core.activeIntentId
  const activeVerificationIdRef = useRef(core.activeVerificationId)
  activeVerificationIdRef.current = core.activeVerificationId
  const activeVerificationRecord = useMemo(
    () =>
      core.activeVerificationId
        ? (core.pending.find((record) => record.transaction_id === core.activeVerificationId) ??
          null)
        : null,
    [core.activeVerificationId, core.pending]
  )
  const activeVerificationRecordRef = useRef(activeVerificationRecord)
  activeVerificationRecordRef.current = activeVerificationRecord
  const coreStatusRef = useRef(core.status)
  coreStatusRef.current = core.status
  const [apiUrl, chainId, privateReadAddress] = privateReadQueryScope
  const scopeIdentity = `${apiUrl}\u0000${chainId}\u0000${privateReadAddress ?? ''}\u0000${coreOptions.tokenId}`
  // A new symbol for every account/API/chain/token transition also catches
  // A -> B -> A changes. It prevents an old iframe or session response from
  // becoming actionable during the render before the shared core resets.
  const scopeSession = useMemo(() => Symbol(scopeIdentity), [scopeIdentity])
  const scopeSessionRef = useRef(scopeSession)
  scopeSessionRef.current = scopeSession

  const setSession = useCallback((next: TransakWidgetSession | null, nextScope: symbol | null) => {
    sessionRef.current = next
    mountedSessionScopeRef.current = nextScope
    setSessionState(next)
  }, [])

  const requestSession = useCallback(
    (intentId: string, generation: number) =>
      executePrivateRead((readClient) =>
        requestTransakWidgetSession({
          client: readClient,
          intentId,
          generation,
        })
      ),
    [executePrivateRead]
  )

  const launch = useCallback(
    (request: TransakOnRampLaunchRequest): Promise<void> => {
      const currentRequest = sessionRequestRef.current
      if (currentRequest?.generation === generationRef.current) return currentRequest.promise
      const mountedSessionError = getMountedTransakSessionError(
        'launch',
        sessionRef.current !== null
      )
      if (mountedSessionError) return Promise.reject(mountedSessionError)

      const generation = ++generationRef.current
      setIsLaunching(true)
      let launchedIntentId: string | null = null
      const pendingRequest = (async () => {
        try {
          const intent = await prepareOnRampIntent({
            providerAssetCode: request.providerAssetCode,
            quoteCurrencyAmount: request.quoteCurrencyAmount,
          })
          launchedIntentId = intent.transaction_id
          // `prepareOnRampIntent` synchronously owns this intent in the shared
          // core, but React may not have committed the wrapper's render-time
          // `activeIntentId` yet. Guard only request ownership here; the full
          // active-intent guard runs after the asynchronous session request.
          const beforeSessionError = getTransakSessionContextError({
            currentGeneration: generationRef.current,
            expectedGeneration: generation,
            scopeChanged: scopeSessionRef.current !== scopeSession,
          })
          if (beforeSessionError) throw beforeSessionError

          const next = await requestSession(intent.transaction_id, generation)
          const afterSessionError = getTransakSessionRequestError({
            currentGeneration: generationRef.current,
            expectedGeneration: generation,
            scopeChanged: scopeSessionRef.current !== scopeSession,
            activeIntentId: activeIntentIdRef.current,
            expectedIntentId: intent.transaction_id,
          })
          if (afterSessionError) throw afterSessionError
          setSession(next, scopeSession)
        } catch (error) {
          const launchError =
            error instanceof Error ? error : new Error('Failed to launch Transak checkout')
          if (
            generationRef.current === generation &&
            shouldSurfaceTransakSessionFailure({
              status: coreStatusRef.current,
              activeIntentId: activeIntentIdRef.current,
              activeVerificationId: activeVerificationIdRef.current,
              activeVerificationRecord: activeVerificationRecordRef.current,
              expectedIntentId: launchedIntentId,
            })
          ) {
            handleProviderLaunchFailed(launchError)
          }
          throw launchError
        } finally {
          if (generationRef.current === generation) setIsLaunching(false)
          if (sessionRequestRef.current?.generation === generation) {
            sessionRequestRef.current = null
          }
        }
      })()
      sessionRequestRef.current = { generation, promise: pendingRequest }
      return pendingRequest
    },
    [handleProviderLaunchFailed, prepareOnRampIntent, requestSession, scopeSession, setSession]
  )

  const recreateSession = useCallback((): Promise<void> => {
    const currentRequest = sessionRequestRef.current
    if (currentRequest?.generation === generationRef.current) return currentRequest.promise
    const mountedSessionError = getMountedTransakSessionError('reopen', sessionRef.current !== null)
    if (mountedSessionError) return Promise.reject(mountedSessionError)
    const intentId = activeIntentIdRef.current
    if (!intentId) {
      return Promise.reject(new Error('No unresolved Transak intent is available to reopen'))
    }

    const generation = ++generationRef.current
    setIsLaunching(true)
    const pendingRequest = (async () => {
      try {
        const next = await requestSession(intentId, generation)
        const requestError = getTransakSessionRequestError({
          currentGeneration: generationRef.current,
          expectedGeneration: generation,
          scopeChanged: scopeSessionRef.current !== scopeSession,
          activeIntentId: activeIntentIdRef.current,
          expectedIntentId: intentId,
        })
        if (requestError) throw requestError
        setSession(next, scopeSession)
      } catch (error) {
        const launchError =
          error instanceof Error ? error : new Error('Failed to recreate Transak checkout')
        if (
          generationRef.current === generation &&
          shouldSurfaceTransakSessionFailure({
            status: coreStatusRef.current,
            activeIntentId: activeIntentIdRef.current,
            activeVerificationId: activeVerificationIdRef.current,
            activeVerificationRecord: activeVerificationRecordRef.current,
            expectedIntentId: intentId,
          })
        ) {
          handleProviderLaunchFailed(launchError)
        }
        throw launchError
      } finally {
        if (generationRef.current === generation) setIsLaunching(false)
        if (sessionRequestRef.current?.generation === generation) {
          sessionRequestRef.current = null
        }
      }
    })()
    sessionRequestRef.current = { generation, promise: pendingRequest }
    return pendingRequest
  }, [handleProviderLaunchFailed, requestSession, scopeSession, setSession])

  const closeWidget = useCallback(async () => {
    generationRef.current++
    const shouldReconcile = Boolean(sessionRef.current || activeIntentIdRef.current)
    setSession(null, null)
    setIsLaunching(false)
    if (shouldReconcile) await handleProviderClosed()
  }, [handleProviderClosed, setSession])

  const getCurrentGeneration = useCallback(() => generationRef.current, [])

  const handleFrameReady = useCallback(
    (generation: number) => {
      const current = sessionRef.current
      if (!current || current.generation !== generation || generationRef.current !== generation)
        return
      handleProviderLaunchReady()
    },
    [handleProviderLaunchReady]
  )

  const handleFrameExpired = useCallback(
    (generation: number) => {
      const current = sessionRef.current
      if (!current || current.generation !== generation || generationRef.current !== generation)
        return
      const shouldSurfaceFailure = shouldSurfaceTransakSessionFailure({
        status: coreStatusRef.current,
        activeIntentId: activeIntentIdRef.current,
        activeVerificationId: activeVerificationIdRef.current,
        activeVerificationRecord: activeVerificationRecordRef.current,
        expectedIntentId: current.intentId,
      })
      generationRef.current++
      setSession(null, null)
      if (shouldSurfaceFailure) {
        handleProviderLaunchFailed(
          new Error(
            'Transak checkout session expired before it could be loaded; reopen to continue'
          )
        )
      }
    },
    [handleProviderLaunchFailed, setSession]
  )

  const handleFrameAction = useCallback(
    async (generation: number, action: TransakWidgetAction) => {
      const current = sessionRef.current
      if (!current || current.generation !== generation || generationRef.current !== generation)
        return

      switch (action.type) {
        case 'ready':
          handleProviderLaunchReady()
          return
        case 'refresh':
          await refreshPending()
          return
        case 'provider-event':
          await handleProviderEvent(action.event)
          return
        case 'close':
          await closeWidget()
      }
    },
    [closeWidget, handleProviderEvent, handleProviderLaunchReady, refreshPending]
  )

  useEffect(() => {
    const current = sessionRef.current
    if (!current || core.activeIntentId === current.intentId) return
    generationRef.current++
    setSession(null, null)
  }, [core.activeIntentId, setSession])

  useEffect(() => {
    generationRef.current++
    setSession(null, null)
    setIsLaunching(false)
  }, [scopeSession, setSession])

  useEffect(
    () => () => {
      generationRef.current++
      sessionRef.current = null
      mountedSessionScopeRef.current = null
    },
    []
  )

  const scopedSession = mountedSessionScopeRef.current === scopeSession ? session : null
  const widget = useMemo(
    () =>
      scopedSession ? (
        <TransakWidgetFrame
          key={scopedSession.generation}
          session={scopedSession}
          getCurrentGeneration={getCurrentGeneration}
          shouldPollPending={core.status === 'awaiting-purchase'}
          refreshPending={refreshPending}
          onReady={handleFrameReady}
          onAction={handleFrameAction}
          onExpired={handleFrameExpired}
          title={iframeTitle}
          className={iframeClassName}
        />
      ) : null,
    [
      core.status,
      getCurrentGeneration,
      handleFrameAction,
      handleFrameExpired,
      handleFrameReady,
      iframeClassName,
      iframeTitle,
      refreshPending,
      scopedSession,
    ]
  )

  return {
    status: core.status,
    activeIntentId: core.activeIntentId,
    pending: core.pending,
    activeVerificationId: core.activeVerificationId,
    error: core.error,
    finalityProgress: core.finalityProgress,
    depositAddress: core.depositAddress,
    minDepositBaseUnits: core.minDepositBaseUnits,
    selectedToken: core.selectedToken,
    finishPendingVerification: core.finishPendingVerification,
    refreshPending,
    isLaunching,
    isWidgetOpen: scopedSession !== null,
    widget,
    launch,
    recreateSession,
    closeWidget,
  }
}
