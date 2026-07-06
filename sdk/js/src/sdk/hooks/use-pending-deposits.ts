'use client'

import { useContext } from 'react'
import { useQuery, QueryClientContext } from '@tanstack/react-query'
import { useSafePrivanaContext } from '../context/privana-provider'
import { AccountingApiError } from '../client/errors'
import type { Address, PendingDeposit, PendingDepositsResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'

export interface UsePendingDepositsOptions {
  /** Source chain to scan. Query is disabled while undefined. */
  chainId?: number
  enabled?: boolean
  /** Auto-poll cadence in ms, or false for manual refetch only (default: 30s, the server scan-cache TTL). */
  refetchInterval?: number | false
  /** Narrow the scan to one registered ERC20. */
  tokenAddress?: Address
  /** Scan window in blocks (server default ≈ 1h, clamped ≈ 24h). */
  lookbackBlocks?: number
}

export interface UsePendingDepositsResult {
  pending: PendingDeposit[]
  scannedToBlock: number | undefined
  isFetching: boolean
  isError: boolean
  error: Error | null
  isRateLimited: boolean
  refetch: () => Promise<PendingDepositsResponse | undefined>
}

function statusCodeOf(error: unknown): number | undefined {
  return error instanceof AccountingApiError ? error.statusCode : undefined
}

export function usePendingDeposits(
  options: UsePendingDepositsOptions = {}
): UsePendingDepositsResult {
  const queryClient = useContext(QueryClientContext)
  const accountingContext = useSafePrivanaContext()

  const hasProviders = !!queryClient && !!accountingContext
  const client = accountingContext?.client
  const { executePrivateRead, privateReadAddress, privateReadQueryScope, privateReadReady } =
    usePrivateReadRequest()

  const { chainId, tokenAddress, lookbackBlocks } = options

  const query = useQuery<PendingDepositsResponse, Error>({
    queryKey: ['accounting-pending-deposits', ...privateReadQueryScope, chainId, tokenAddress],
    queryFn: async () => {
      if (!privateReadAddress) throw new Error('No authenticated account available')
      if (!chainId) throw new Error('No chain ID provided')
      if (!client) throw new Error('No accounting client')
      try {
        return await executePrivateRead(() =>
          client.getPendingDeposits({
            chain_id: chainId,
            token_address: tokenAddress,
            lookback_blocks: lookbackBlocks,
          })
        )
      } catch (error: unknown) {
        if (statusCodeOf(error) === 404) {
          return { pending: [], scanned_from_block: 0, scanned_to_block: 0 }
        }
        throw error
      }
    },
    enabled:
      hasProviders &&
      (options.enabled ?? true) &&
      privateReadReady &&
      !!privateReadAddress &&
      !!chainId &&
      !!client,
    refetchInterval: options.refetchInterval ?? 30_000,
    staleTime: 25_000,
    retry: (failureCount, error) => {
      const status = statusCodeOf(error)
      if (status === 429 || status === 404) return false
      return failureCount < 2
    },
  })

  return {
    pending: query.data?.pending ?? [],
    scannedToBlock: query.data?.scanned_to_block,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    isRateLimited: statusCodeOf(query.error) === 429,
    refetch: async () => (await query.refetch()).data,
  }
}
