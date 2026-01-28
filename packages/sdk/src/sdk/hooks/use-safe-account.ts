'use client'

import { useContext, useSyncExternalStore, useRef, useCallback } from 'react'
import { WagmiContext } from 'wagmi'
import { getAccount, watchAccount } from 'wagmi/actions'
import type { Address } from 'viem'

interface SafeAccountResult {
  address: Address | undefined
  isConnected: boolean
}

const defaultResult: SafeAccountResult = {
  address: undefined,
  isConnected: false,
}

export function useSafeAccount(): SafeAccountResult {
  const context = useContext(WagmiContext)
  const cacheRef = useRef<SafeAccountResult>(defaultResult)

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!context) return () => {}
      return watchAccount(context, { onChange })
    },
    [context]
  )

  const getSnapshot = useCallback(() => {
    if (!context) return defaultResult
    const account = getAccount(context)
    if (
      cacheRef.current.address !== account.address ||
      cacheRef.current.isConnected !== account.isConnected
    ) {
      cacheRef.current = { address: account.address, isConnected: account.isConnected }
    }
    return cacheRef.current
  }, [context])

  const getServerSnapshot = useCallback(() => defaultResult, [])

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
