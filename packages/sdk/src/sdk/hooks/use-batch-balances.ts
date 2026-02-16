'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useWalletClient } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { Bytes32, BatchBalancesResponse, TokenBalance } from '../types'
import { MAX_BATCH_BALANCES_TOKEN_IDS } from '../types'
import { ensureSiweToken, refetchUnlessRejected } from '../auth'

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
  const { address, isConnected } = useAccount()
  const { client, pollingInterval, networkConfig } = useFlexvaultsContext()
  const { data: walletClient } = useWalletClient()
  const refetchInterval = useMemo(() => refetchUnlessRejected(pollingInterval), [pollingInterval])

  const query = useQuery<BatchBalancesResponse, Error>({
    queryKey: [
      'accounting-batch-balances',
      networkConfig.apiUrl,
      networkConfig.chainId,
      address,
      options.tokenIds,
    ],
    queryFn: async () => {
      if (!address) throw new Error('No wallet connected')
      if (options.tokenIds.length > MAX_BATCH_BALANCES_TOKEN_IDS) {
        throw new Error(
          `tokenIds length must be <= ${MAX_BATCH_BALANCES_TOKEN_IDS} (received ${options.tokenIds.length}); paginate requests`
        )
      }
      if (!walletClient) throw new Error('No wallet client')
      await ensureSiweToken({
        client,
        chainId: networkConfig.chainId,
        walletClient,
        address,
        cacheScope: networkConfig.apiUrl,
      })
      return client.getBatchBalances({
        user_address: address,
        token_ids: options.tokenIds,
      })
    },
    enabled:
      (options.enabled ?? true) &&
      isConnected &&
      !!address &&
      !!walletClient &&
      options.tokenIds.length > 0,
    refetchInterval,
    retry: false,
  })

  return {
    balances: query.data?.balances ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
