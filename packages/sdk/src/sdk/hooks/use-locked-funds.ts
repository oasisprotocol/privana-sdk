'use client'

import { useMemo } from 'react'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { useAccount, useWalletClient } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { LockInfo, LockedFundsResponse } from '../types'
import { ensureSiweToken, refetchUnlessRejected } from '../auth'

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
  const { client, pollingInterval, serviceAddress, networkConfig } = useFlexvaultsContext()
  const { data: walletClient } = useWalletClient()
  const refetchInterval = useMemo(() => refetchUnlessRejected(pollingInterval), [pollingInterval])

  const query = useQuery<LockedFundsResponse, Error>({
    queryKey: [
      'accounting-locked-funds',
      networkConfig.apiUrl,
      networkConfig.chainId,
      address,
      serviceAddress,
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
      return client.getLockedFunds(address, serviceAddress)
    },
    enabled: (options.enabled ?? true) && isConnected && !!address && !!walletClient,
    refetchInterval,
    retry: false,
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
