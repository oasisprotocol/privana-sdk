'use client'

import { useQuery } from '@tanstack/react-query'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { LockInfo, ExpiredLocksResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'

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
  const { client, pollingInterval } = useFlexvaultsContext()
  const { executePrivateRead, privateReadAddress, privateReadQueryScope, privateReadReady } =
    usePrivateReadRequest()

  const query = useQuery<ExpiredLocksResponse, Error>({
    queryKey: ['accounting-expired-locks', ...privateReadQueryScope],
    queryFn: async () => {
      if (!privateReadAddress) throw new Error('No authenticated account available')
      return executePrivateRead(() => client.getExpiredLocks())
    },
    enabled: (options.enabled ?? true) && privateReadReady && !!privateReadAddress && !!client,
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
