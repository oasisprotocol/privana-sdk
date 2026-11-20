'use client'

import { useContext } from 'react'
import { useQuery, QueryClientContext } from '@tanstack/react-query'
import { useSafePrivanaContext } from '../context/privana-context'
import { AccountingApiError } from '../client/errors'
import type { Bytes32, DepositCheckResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'

export interface UseDepositClaimOptions {
  tokenId?: Bytes32
  enabled?: boolean
  /** Auto-poll cadence in ms, or false for manual refetch only (default: 30s). */
  refetchInterval?: number | false
}

export interface UseDepositClaimResult {
  deposits: DepositCheckResponse[]
  isFetching: boolean
  isError: boolean
  error: Error | null
  isRateLimited: boolean
  refetch: () => Promise<DepositCheckResponse[] | undefined>
}

function statusCodeOf(error: unknown): number | undefined {
  return error instanceof AccountingApiError ? error.statusCode : undefined
}

export function useDepositClaim(options: UseDepositClaimOptions = {}): UseDepositClaimResult {
  const queryClient = useContext(QueryClientContext)
  const accountingContext = useSafePrivanaContext()

  const hasProviders = !!queryClient && !!accountingContext
  const client = accountingContext?.client
  const { executePrivateRead, privateReadAddress, privateReadQueryScope, privateReadReady } =
    usePrivateReadRequest()

  const { tokenId } = options

  const query = useQuery<DepositCheckResponse[], Error>({
    queryKey: ['accounting-deposit-claim', ...privateReadQueryScope, tokenId],
    queryFn: async () => {
      if (!privateReadAddress) throw new Error('No authenticated account available')
      if (!client) throw new Error('No accounting client')
      return executePrivateRead((readClient) => readClient.checkDeposit({ token_id: tokenId }))
    },
    enabled:
      hasProviders &&
      (options.enabled ?? true) &&
      privateReadReady &&
      !!privateReadAddress &&
      !!client,
    refetchInterval: options.refetchInterval ?? 30_000,
    staleTime: 25_000,
    retry: (failureCount, error) => statusCodeOf(error) !== 429 && failureCount < 2,
  })

  return {
    deposits: query.data ?? [],
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    isRateLimited: statusCodeOf(query.error) === 429,
    refetch: async () => (await query.refetch()).data,
  }
}
