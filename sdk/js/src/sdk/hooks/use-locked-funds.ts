'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { usePrivanaContext } from '../context/privana-provider'
import type { LockInfo, LockedFundsResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'

export interface UseLockedFundsOptions {
  enabled?: boolean
}

export interface UseLockedFundsResult {
  locks: LockInfo[]
  totalLocked: string
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useLockedFunds(options: UseLockedFundsOptions = {}): UseLockedFundsResult {
  const { client, pollingInterval, serviceAddress } = usePrivanaContext()
  const { executePrivateRead, privateReadAddress, privateReadQueryScope, privateReadReady } =
    usePrivateReadRequest()

  const query = useQuery<LockedFundsResponse, Error>({
    queryKey: ['accounting-locked-funds', ...privateReadQueryScope, serviceAddress ?? null],
    queryFn: async () => {
      if (!privateReadAddress) throw new Error('No authenticated account available')
      return executePrivateRead((readClient) => readClient.getLockedFunds(serviceAddress))
    },
    enabled: (options.enabled ?? true) && privateReadReady && !!privateReadAddress && !!client,
    refetchInterval: pollingInterval,
    placeholderData: keepPreviousData,
    staleTime: 5000,
  })

  return {
    locks: query.data?.locks ?? [],
    totalLocked: query.data?.total_locked ?? '0',
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
