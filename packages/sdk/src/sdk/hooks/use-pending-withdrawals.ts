'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { PendingWithdrawal, PendingWithdrawalsResponse } from '../types'

export interface UsePendingWithdrawalsOptions {
  enabled?: boolean
}

export interface UsePendingWithdrawalsResult {
  withdrawals: PendingWithdrawal[]
  hasPendingWithdrawals: boolean
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function usePendingWithdrawals(
  options: UsePendingWithdrawalsOptions = {}
): UsePendingWithdrawalsResult {
  const { address, isConnected } = useAccount()
  const { client, pollingInterval } = useFlexvaultsContext()

  const query = useQuery<PendingWithdrawalsResponse, Error>({
    queryKey: ['accounting-pending-withdrawals', address],
    queryFn: async (): Promise<PendingWithdrawalsResponse> => {
      if (!address) throw new Error('No wallet connected')
      try {
        return await client.getPendingWithdrawals(address)
      } catch (error: unknown) {
        if (
          error &&
          typeof error === 'object' &&
          'statusCode' in error &&
          error.statusCode === 404
        ) {
          return { user_address: address, withdrawals: [] }
        }
        throw error
      }
    },
    enabled: (options.enabled ?? true) && isConnected && !!address,
    refetchInterval: pollingInterval,
    placeholderData: keepPreviousData,
    staleTime: 5000,
    retry: (failureCount, error) => {
      if (error && typeof error === 'object' && 'statusCode' in error && error.statusCode === 404) {
        return false
      }
      return failureCount < 3
    },
  })

  const withdrawals = query.data?.withdrawals ?? []

  return {
    withdrawals,
    hasPendingWithdrawals: withdrawals.length > 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
