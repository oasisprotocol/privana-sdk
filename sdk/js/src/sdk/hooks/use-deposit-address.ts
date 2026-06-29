'use client'

import { useContext } from 'react'
import { useQuery, QueryClientContext } from '@tanstack/react-query'
import { useSafePrivanaContext } from '../context/privana-provider'
import type { DepositAddressResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'

export interface UseDepositAddressOptions {
  enabled?: boolean
}

export interface UseDepositAddressResult {
  depositAddress: string | null
  isLoading: boolean
  isError: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Fetches the user's Privana deposit address via the SIWE private-read flow
 * (`POST /v1/accounting/deposits/address`) — the same authenticated path used
 * by `useFiatOnRamp`. Used by the external-wallet deposit view to show a QR
 * code / copyable address to send funds to.
 */
export function useDepositAddress(options: UseDepositAddressOptions = {}): UseDepositAddressResult {
  const queryClient = useContext(QueryClientContext)
  const accountingContext = useSafePrivanaContext()

  const hasProviders = !!queryClient && !!accountingContext
  const client = accountingContext?.client
  const { executePrivateRead, privateReadAddress, privateReadQueryScope, privateReadReady } =
    usePrivateReadRequest()

  const query = useQuery<DepositAddressResponse, Error>({
    queryKey: ['accounting-deposit-address', ...privateReadQueryScope],
    queryFn: async () => {
      if (!privateReadAddress) throw new Error('No authenticated account available')
      if (!client) throw new Error('No accounting client')
      return executePrivateRead(() => client.getDepositAddress())
    },
    enabled:
      hasProviders &&
      (options.enabled ?? true) &&
      privateReadReady &&
      !!privateReadAddress &&
      !!client,
  })

  return {
    depositAddress: query.data?.deposit_address ?? null,
    isLoading: query.isPending || query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
