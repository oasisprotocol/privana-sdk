'use client'

import { useCallback, useContext, useState, type ReactNode } from 'react'
import { QueryClientContext } from '@tanstack/react-query'
import { WagmiContext } from 'wagmi'
import {
  DepositFlowContext,
  useDepositFlow,
  type DepositFlow,
  type UseDepositOptions,
} from '../hooks/use-deposit'

type Listener = { current: UseDepositOptions }

// One deposit flow per app, outliving the modal: a deposit credits only after
// the client reports it, so it must not stop when the modal closes.
export function DepositFlowProvider({ children }: { children: ReactNode }) {
  const hasWagmi = useContext(WagmiContext) !== undefined
  const hasQueryClient = useContext(QueryClientContext) !== undefined
  if (!hasWagmi || !hasQueryClient) return children
  return <DepositFlowRunner>{children}</DepositFlowRunner>
}

function DepositFlowRunner({ children }: { children: ReactNode }) {
  const [listeners] = useState(() => new Set<Listener>())
  const [events] = useState<UseDepositOptions>(() => ({
    onDepositAddressReceived: (response) =>
      listeners.forEach((l) => l.current.onDepositAddressReceived?.(response)),
    onDepositSuccess: (txHash) => listeners.forEach((l) => l.current.onDepositSuccess?.(txHash)),
    onCredited: (txHash, response, lockPending) =>
      listeners.forEach((l) => l.current.onCredited?.(txHash, response, lockPending)),
    onLockSubmitted: (response) => listeners.forEach((l) => l.current.onLockSubmitted?.(response)),
    onLockFailed: (error) =>
      listeners.forEach((l) => (l.current.onLockFailed ?? l.current.onError)?.(error)),
    onCheckTimeout: (txHash) => listeners.forEach((l) => l.current.onCheckTimeout?.(txHash)),
    onError: (error) => listeners.forEach((l) => l.current.onError?.(error)),
  }))
  const subscribe = useCallback<DepositFlow['subscribe']>(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    [listeners]
  )
  const result = useDepositFlow(events)

  return (
    <DepositFlowContext.Provider value={{ result, subscribe }}>
      {children}
    </DepositFlowContext.Provider>
  )
}
