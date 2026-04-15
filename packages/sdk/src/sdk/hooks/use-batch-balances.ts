'use client'

import { useQuery } from '@tanstack/react-query'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { Bytes32, BatchBalancesResponse, TokenBalance } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'

export interface UseBatchBalancesOptions {
  tokenIds: Bytes32[]
  enabled?: boolean
}

export interface UseBatchBalancesResult {
  balances: TokenBalance[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useBatchBalances(options: UseBatchBalancesOptions): UseBatchBalancesResult {
  const { client, pollingInterval } = useFlexvaultsContext()
  const { executePrivateRead, privateReadAddress, privateReadQueryScope, privateReadReady } =
    usePrivateReadRequest()

  const query = useQuery<BatchBalancesResponse, Error>({
    queryKey: ['accounting-batch-balances', ...privateReadQueryScope, options.tokenIds],
    queryFn: async () => {
      if (!privateReadAddress) throw new Error('No authenticated account available')
      return executePrivateRead(() => client.getBatchBalances({ token_ids: options.tokenIds }))
    },
    enabled:
      (options.enabled ?? true) &&
      privateReadReady &&
      !!privateReadAddress &&
      options.tokenIds.length > 0 &&
      !!client,
    refetchInterval: pollingInterval,
  })

  return {
    balances: query.data?.balances ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
