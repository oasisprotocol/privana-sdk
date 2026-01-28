'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { useAccountingContext } from '../context/accounting-provider'
import type { Address, LockInfo, LockedFundsResponse } from '../types'

export interface UseLockedFundsOptions {
  serviceAddress?: Address
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
  const { client, pollingInterval } = useAccountingContext()

  const query = useQuery<LockedFundsResponse, Error>({
    queryKey: ['accounting-locked-funds', address, options.serviceAddress],
    queryFn: async () => {
      if (!address) throw new Error('No wallet connected')
      return client.getLockedFunds(address, options.serviceAddress)
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
