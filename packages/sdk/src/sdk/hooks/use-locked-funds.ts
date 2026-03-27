'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { LockInfo, LockedFundsResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'
import { useSafeAccount } from './use-safe-account'

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
  const { address, isConnected } = useSafeAccount()
  const { client, pollingInterval, serviceAddress } = useFlexvaultsContext()
  const { executePrivateRead, privateReadQueryScope } = usePrivateReadRequest()

  const query = useQuery<LockedFundsResponse, Error>({
    queryKey: ['accounting-locked-funds', ...privateReadQueryScope, serviceAddress ?? null],
    queryFn: async () => {
      if (!address) throw new Error('No wallet connected')
      return executePrivateRead(() => client.getLockedFunds(address, serviceAddress))
    },
    enabled: (options.enabled ?? true) && isConnected && !!address,
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
