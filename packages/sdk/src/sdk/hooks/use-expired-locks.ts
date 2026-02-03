'use client'

import { useQuery } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { LockInfo, ExpiredLocksResponse } from '../types'

export interface UseExpiredLocksOptions {
  enabled?: boolean
}

export interface UseExpiredLocksResult {
  expiredLocks: LockInfo[]
  hasExpiredLocks: boolean
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useExpiredLocks(options: UseExpiredLocksOptions = {}): UseExpiredLocksResult {
  const { address, isConnected } = useAccount()
  const { client, pollingInterval } = useFlexvaultsContext()

  const query = useQuery<ExpiredLocksResponse, Error>({
    queryKey: ['accounting-expired-locks', address],
    queryFn: async () => {
      if (!address) throw new Error('No wallet connected')
      return client.getExpiredLocks(address)
    },
    enabled: (options.enabled ?? true) && isConnected && !!address,
    refetchInterval: pollingInterval,
  })

  const expiredLocks = query.data?.expired_locks ?? []

  return {
    expiredLocks,
    hasExpiredLocks: expiredLocks.length > 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
