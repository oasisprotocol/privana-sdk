'use client'

import { useQuery } from '@tanstack/react-query'
import { usePrivanaContext } from '../context/privana-provider'
import type { Bytes32, TotalLockedBalanceResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'

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
  const { client, pollingInterval, defaultToken } = usePrivanaContext()
  const { executePrivateRead, privateReadAddress, privateReadQueryScope, privateReadReady } =
    usePrivateReadRequest()

  const tokenId = options.tokenId ?? defaultToken?.id

  const query = useQuery<TotalLockedBalanceResponse, Error>({
    queryKey: ['accounting-total-locked-balance', ...privateReadQueryScope, tokenId],
    queryFn: async () => {
      if (!privateReadAddress) throw new Error('No authenticated account available')
      if (!tokenId) throw new Error('No token ID provided')
      return executePrivateRead(() => client.getTotalLockedBalance(tokenId))
    },
    enabled:
      (options.enabled ?? true) &&
      privateReadReady &&
      !!privateReadAddress &&
      !!tokenId &&
      !!client,
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
