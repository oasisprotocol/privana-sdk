'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount, useWalletClient } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { Bytes32, TotalLockedBalanceResponse } from '../types'
import { ensureSiweToken, refetchUnlessRejected } from '../auth'

export interface UseTotalLockedBalanceOptions {
  tokenId: Bytes32
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
  options: UseTotalLockedBalanceOptions
): UseTotalLockedBalanceResult {
  const { address, isConnected } = useAccount()
  const { client, pollingInterval, networkConfig } = useFlexvaultsContext()
  const { data: walletClient } = useWalletClient()
  const refetchInterval = useMemo(() => refetchUnlessRejected(pollingInterval), [pollingInterval])

  const query = useQuery<TotalLockedBalanceResponse, Error>({
    queryKey: [
      'accounting-total-locked-balance',
      networkConfig.apiUrl,
      networkConfig.chainId,
      address,
      options.tokenId,
    ],
    queryFn: async () => {
      if (!address) throw new Error('No wallet connected')
      if (!walletClient) throw new Error('No wallet client')
      await ensureSiweToken({
        client,
        chainId: networkConfig.chainId,
        walletClient,
        address,
        cacheScope: networkConfig.apiUrl,
      })
      return client.getTotalLockedBalance(address, options.tokenId)
    },
    enabled: (options.enabled ?? true) && isConnected && !!address && !!walletClient,
    refetchInterval,
    retry: false,
  })

  return {
    totalLocked: query.data?.total_locked ?? '0',
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
