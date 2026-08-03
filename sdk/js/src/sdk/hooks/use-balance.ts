'use client'

import { useContext } from 'react'
import { useQuery, QueryClientContext } from '@tanstack/react-query'
import { useSafePrivanaContext } from '../context/privana-provider'
import type { Bytes32, BalanceResponse } from '../types'
import { formatTokenAmount } from '@/lib/utils'
import { usePrivateReadRequest } from './use-private-read-request'

export interface UseBalanceOptions {
  tokenId?: Bytes32
  enabled?: boolean
}

export interface UseBalanceResult {
  balance: string
  balanceWei: string
  balanceFormatted: string
  tokenSymbol: string
  chainId: string
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useBalance(options: UseBalanceOptions = {}): UseBalanceResult {
  const queryClient = useContext(QueryClientContext)
  const accountingContext = useSafePrivanaContext()

  const hasProviders = !!queryClient && !!accountingContext
  const client = accountingContext?.client
  const defaultToken = accountingContext?.defaultToken
  const pollingInterval = accountingContext?.pollingInterval ?? 10000
  const { executePrivateRead, privateReadAddress, privateReadQueryScope, privateReadReady } =
    usePrivateReadRequest()

  const tokenId = options.tokenId ?? defaultToken?.id

  const query = useQuery<BalanceResponse, Error>({
    queryKey: ['accounting-balance', ...privateReadQueryScope, tokenId],
    queryFn: async () => {
      if (!privateReadAddress) throw new Error('No authenticated account available')
      if (!tokenId) throw new Error('No token ID provided')
      if (!client) throw new Error('No accounting client')
      return executePrivateRead((readClient) => readClient.getBalance(tokenId))
    },
    enabled:
      hasProviders &&
      (options.enabled ?? true) &&
      privateReadReady &&
      !!privateReadAddress &&
      !!tokenId &&
      !!client,
    refetchInterval: pollingInterval,
  })

  const balanceWei = query.data?.balance ?? '0'

  return {
    balance: balanceWei,
    balanceWei,
    balanceFormatted: formatTokenAmount(balanceWei),
    tokenSymbol: query.data?.token_symbol ?? '',
    chainId: query.data?.chain_id ?? '',
    isLoading: query.isPending || query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
