'use client'

import { useQuery } from '@tanstack/react-query'
import { usePrivanaContext } from '../context/privana-provider'
import type { Bytes32, TokenInfoResponse } from '../types'

export interface UseTokenInfoOptions {
  tokenId?: Bytes32 | string
  enabled?: boolean
}

export interface UseTokenInfoResult {
  data: TokenInfoResponse | undefined
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

export function useTokenInfo(options: UseTokenInfoOptions = {}): UseTokenInfoResult {
  const { client } = usePrivanaContext()
  const { tokenId } = options

  const query = useQuery<TokenInfoResponse, Error>({
    queryKey: ['accounting-token-info', tokenId],
    queryFn: () => {
      if (!tokenId) throw new Error('No token ID provided')
      return client.getTokenInfo(tokenId)
    },
    enabled: (options.enabled ?? true) && !!tokenId && !!client,
    staleTime: Infinity,
  })

  return {
    data: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
