'use client'

import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { HistoryEntry, HistoryResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'

export interface UseHistoryOptions {
  offset?: number
  limit?: number
  enabled?: boolean
}

export interface UseHistoryResult {
  history: HistoryEntry[]
  total: number
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useHistory(options: UseHistoryOptions = {}): UseHistoryResult {
  const { client, pollingInterval } = useFlexvaultsContext()
  const { executePrivateRead, privateReadAddress, privateReadQueryScope, privateReadReady } =
    usePrivateReadRequest()

  const offset = options.offset ?? -1
  const limit = options.limit ?? 50

  const query = useQuery<HistoryResponse, Error>({
    queryKey: ['accounting-history', ...privateReadQueryScope, offset, limit],
    queryFn: async () => {
      if (!privateReadAddress) throw new Error('No authenticated account available')
      return executePrivateRead(() => client.getHistory({ offset, limit }))
    },
    enabled: (options.enabled ?? true) && privateReadReady && !!privateReadAddress && !!client,
    refetchInterval: pollingInterval,
    placeholderData: keepPreviousData,
    staleTime: 5000,
  })

  return {
    history: query.data?.history ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
