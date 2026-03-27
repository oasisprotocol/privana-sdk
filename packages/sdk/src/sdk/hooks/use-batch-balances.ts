'use client'

import { useQuery } from '@tanstack/react-query'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { Bytes32, BatchBalancesResponse, TokenBalance } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'
import { useSafeAccount } from './use-safe-account'

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
  const { address, isConnected } = useSafeAccount()
  const { client, pollingInterval } = useFlexvaultsContext()
  const { executePrivateRead, privateReadQueryScope } = usePrivateReadRequest()

  const query = useQuery<BatchBalancesResponse, Error>({
    queryKey: ['accounting-batch-balances', ...privateReadQueryScope, options.tokenIds],
    queryFn: async () => {
      if (!address) throw new Error('No wallet connected')
      return executePrivateRead(() =>
        client.getBatchBalances({
          user_address: address,
          token_ids: options.tokenIds,
        })
      )
    },
    enabled: (options.enabled ?? true) && isConnected && !!address && options.tokenIds.length > 0,
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
