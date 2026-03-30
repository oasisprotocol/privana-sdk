'use client'

import { useQuery } from '@tanstack/react-query'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { LockInfo, ExpiredLocksResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'
import { useSafeAccount } from './use-safe-account'

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
  const { address, isConnected } = useSafeAccount()
  const { client, pollingInterval } = useFlexvaultsContext()
  const { executePrivateRead, privateReadQueryScope } = usePrivateReadRequest()

  const query = useQuery<ExpiredLocksResponse, Error>({
    queryKey: ['accounting-expired-locks', ...privateReadQueryScope],
    queryFn: async () => {
      if (!address) throw new Error('No wallet connected')
      return executePrivateRead(() => client.getExpiredLocks(address))
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
