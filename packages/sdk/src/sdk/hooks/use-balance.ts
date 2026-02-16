'use client'

import { useContext, useMemo } from 'react'
import { useQuery, QueryClientContext } from '@tanstack/react-query'
import { useWalletClient } from 'wagmi'
import { useSafeFlexvaultsContext } from '../context/flexvaults-provider'
import type { Bytes32, BalanceResponse } from '../types'
import { formatTokenAmount } from '@/lib/utils'
import { useSafeAccount } from './use-safe-account'
import { ensureSiweToken, refetchUnlessRejected } from '../auth'

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
  const { address, isConnected } = useSafeAccount()
  const { data: walletClient } = useWalletClient()
  const accountingContext = useSafeFlexvaultsContext()

  const hasProviders = !!queryClient && !!accountingContext
  const client = accountingContext?.client
  const chainId = accountingContext?.networkConfig?.chainId
  const apiUrl = accountingContext?.networkConfig?.apiUrl
  const defaultToken = accountingContext?.defaultToken
  const pollingInterval = accountingContext?.pollingInterval ?? 10000

  const tokenId = options.tokenId ?? defaultToken?.id
  const refetchInterval = useMemo(() => refetchUnlessRejected(pollingInterval), [pollingInterval])

  const query = useQuery<BalanceResponse, Error>({
    queryKey: ['accounting-balance', apiUrl, chainId, address, tokenId],
    queryFn: async () => {
      if (!address) throw new Error('No wallet connected')
      if (!tokenId) throw new Error('No token ID provided')
      if (!client) throw new Error('No accounting client')
      if (!chainId) throw new Error('No network configured')
      if (!walletClient) throw new Error('No wallet client')
      await ensureSiweToken({ client, chainId, walletClient, address, cacheScope: apiUrl })
      return client.getBalance(address, tokenId)
    },
    enabled:
      hasProviders &&
      (options.enabled ?? true) &&
      isConnected &&
      !!address &&
      !!tokenId &&
      !!client &&
      !!chainId &&
      !!apiUrl &&
      !!walletClient,
    refetchInterval,
    retry: false,
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
