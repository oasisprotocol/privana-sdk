'use client'

import { useCallback, useEffect, useRef } from 'react'
import { MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS } from './recovery'
import {
  isTransakWidgetSessionLoadable,
  resolveTransakWidgetMessage,
  transakOnRampAdapter,
  type TransakWidgetAction,
  type TransakWidgetSession,
} from './transak-adapter'

export interface TransakWidgetFrameProps {
  session: TransakWidgetSession
  getCurrentGeneration: () => number
  shouldPollPending: boolean
  refreshPending: () => Promise<void>
  onReady: (generation: number) => void
  onAction: (generation: number, action: TransakWidgetAction) => void | Promise<void>
  onExpired: (generation: number) => void
  title?: string
  className?: string
}

export function isTransakWidgetFrameRenderable(
  session: TransakWidgetSession,
  loadedGeneration: number | null,
  now: number = Date.now()
): boolean {
  return loadedGeneration === session.generation || isTransakWidgetSessionLoadable(session, now)
}

/** The provider-specific browser boundary. It never interprets order data. */
export function TransakWidgetFrame({
  session,
  getCurrentGeneration,
  shouldPollPending,
  refreshPending,
  onReady,
  onAction,
  onExpired,
  title = 'Transak secure checkout',
  className,
}: TransakWidgetFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const loadedGenerationRef = useRef<number | null>(null)
  const renderable = isTransakWidgetFrameRenderable(session, loadedGenerationRef.current)
  const readyRef = useRef(false)
  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const callbacksRef = useRef({
    getCurrentGeneration,
    refreshPending,
    onReady,
    onAction,
    onExpired,
  })
  callbacksRef.current = {
    getCurrentGeneration,
    refreshPending,
    onReady,
    onAction,
    onExpired,
  }

  const expireUnloadedSession = useCallback(() => {
    if (loadedGenerationRef.current === session.generation) return
    callbacksRef.current.onExpired(session.generation)
  }, [session.generation])

  useEffect(() => {
    loadedGenerationRef.current = null
    readyRef.current = false
    const remaining = session.expiresAt * 1000 - Date.now()
    if (remaining <= 0) {
      expireUnloadedSession()
      return
    }
    expiryTimerRef.current = setTimeout(expireUnloadedSession, remaining)
    return () => {
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current)
      expiryTimerRef.current = null
    }
  }, [expireUnloadedSession, session.expiresAt])

  useEffect(() => {
    const handleMessage = (message: MessageEvent<unknown>) => {
      const action = resolveTransakWidgetMessage({
        message,
        iframeWindow: iframeRef.current?.contentWindow ?? null,
        session,
        currentGeneration: callbacksRef.current.getCurrentGeneration(),
      })
      if (!action) return
      // A valid message from the exact frame proves the single-use URL loaded,
      // even if it raced the iframe's load event.
      loadedGenerationRef.current = session.generation
      if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current)
      expiryTimerRef.current = null
      void callbacksRef.current.onAction(session.generation, action)
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [session])

  useEffect(() => {
    if (!renderable || !transakOnRampAdapter.pollPendingWhileOpen || !shouldPollPending) return
    const id = setInterval(
      () => void callbacksRef.current.refreshPending(),
      MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS
    )
    return () => clearInterval(id)
  }, [renderable, shouldPollPending])

  const handleLoad = useCallback(() => {
    if (!isTransakWidgetSessionLoadable(session)) {
      expireUnloadedSession()
      return
    }
    loadedGenerationRef.current = session.generation
    if (expiryTimerRef.current) clearTimeout(expiryTimerRef.current)
    expiryTimerRef.current = null
    if (readyRef.current) return
    readyRef.current = true
    callbacksRef.current.onReady(session.generation)
  }, [expireUnloadedSession, session])

  if (!renderable) return null

  return (
    <iframe
      ref={iframeRef}
      src={session.url}
      title={title}
      className={className}
      allow="camera; microphone; payment"
      referrerPolicy="strict-origin-when-cross-origin"
      onLoad={handleLoad}
      data-privana-transak-widget
    />
  )
}
