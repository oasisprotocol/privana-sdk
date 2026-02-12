'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { LockInfo, LockedFundsResponse } from '../types'

export interface UseLockedFundsOptions {
  enabled?: boolean
}

export interface UseLockedFundsResult {
  locks: LockInfo[]
  totalLocked: number
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useLockedFunds(options: UseLockedFundsOptions = {}): UseLockedFundsResult {
  const { address, isConnected } = useAccount()
  const { client, pollingInterval, serviceAddress } = useFlexvaultsContext()

  const query = useQuery<LockedFundsResponse, Error>({
    queryKey: ['accounting-locked-funds', address, serviceAddress],
    queryFn: async () => {
      if (!address) throw new Error('No wallet connected')
      return client.getLockedFunds(address, serviceAddress)
    },
    enabled: (options.enabled ?? true) && isConnected && !!address,
    refetchInterval: pollingInterval,
    placeholderData: keepPreviousData,
    staleTime: 5000,
  })

  return {
    locks: query.data?.locks ?? [],
    totalLocked: query.data?.total_locked ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
