'use client'

import { useQuery } from '@tanstack/react-query'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { Bytes32, TotalLockedBalanceResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'
import { useSafeAccount } from './use-safe-account'

export interface UseTotalLockedBalanceOptions {
  tokenId?: Bytes32
  enabled?: boolean
}

export interface UseTotalLockedBalanceResult {
  totalLocked: string
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useTotalLockedBalance(
  options: UseTotalLockedBalanceOptions = {}
): UseTotalLockedBalanceResult {
  const { address, isConnected } = useSafeAccount()
  const { client, pollingInterval, defaultToken } = useFlexvaultsContext()
  const { executePrivateRead, privateReadQueryScope } = usePrivateReadRequest()

  const tokenId = options.tokenId ?? defaultToken?.id

  const query = useQuery<TotalLockedBalanceResponse, Error>({
    queryKey: ['accounting-total-locked-balance', ...privateReadQueryScope, tokenId],
    queryFn: async () => {
      if (!address) throw new Error('No wallet connected')
      return executePrivateRead(() => client.getTotalLockedBalance(address, tokenId))
    },
    enabled: (options.enabled ?? true) && isConnected && !!address && !!tokenId,
    refetchInterval: pollingInterval,
  })

  return {
    totalLocked: query.data?.total_locked ?? '0',
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
