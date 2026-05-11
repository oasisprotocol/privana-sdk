'use client'

import { useQuery } from '@tanstack/react-query'
import { usePrivanaContext } from '../context/privana-provider'
import type { TokenInfoResponse, TokenListResponse } from '../types'

export interface UseTokenListOptions {
  enabled?: boolean
}

export interface UseTokenListResult {
  tokens: TokenInfoResponse[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useTokenList(options: UseTokenListOptions = {}): UseTokenListResult {
  const { client } = usePrivanaContext()

  const query = useQuery<TokenListResponse, Error>({
    queryKey: ['accounting-token-list'],
    queryFn: () => client.listTokens(),
    enabled: (options.enabled ?? true) && !!client,
    staleTime: Infinity,
  })

  return {
    tokens: query.data?.tokens ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
