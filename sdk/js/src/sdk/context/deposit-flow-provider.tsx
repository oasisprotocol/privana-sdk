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
  const [events] = useState<UseDepositOptions>(() => {
    // Each consumer is called on its own: one that throws must not keep the
    // others from hearing the event, nor break the flow that emitted it.
    const emit = (call: (options: UseDepositOptions) => void) =>
      listeners.forEach((listener) => {
        try {
          call(listener.current)
        } catch (error) {
          console.error('A useDeposit callback threw:', error)
        }
      })
    return {
      onDepositAddressReceived: (response) => emit((l) => l.onDepositAddressReceived?.(response)),
      onDepositSuccess: (txHash) => emit((l) => l.onDepositSuccess?.(txHash)),
      onCredited: (txHash, response, lockPending) =>
        emit((l) => l.onCredited?.(txHash, response, lockPending)),
      onLockSubmitted: (response) => emit((l) => l.onLockSubmitted?.(response)),
      onLockFailed: (error) => emit((l) => (l.onLockFailed ?? l.onError)?.(error)),
      onCheckTimeout: (txHash) => emit((l) => l.onCheckTimeout?.(txHash)),
      onError: (error) => emit((l) => l.onError?.(error)),
    }
  })
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
