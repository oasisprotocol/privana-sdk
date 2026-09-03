'use client'

import { useContext } from 'react'
import { useQuery, QueryClientContext } from '@tanstack/react-query'
import { useSafePrivanaContext } from '../context/privana-provider'
import type { DepositAddressResponse } from '../types'
import { usePrivateReadRequest } from './use-private-read-request'

export interface UseDepositAddressOptions {
  enabled?: boolean
}

export function getMinDepositBaseUnits(
  response: DepositAddressResponse | undefined,
  chainId: number,
  kind: 'native' | 'erc20'
): bigint | undefined {
  const value = response?.min_deposit?.[String(chainId)]?.[kind]
  if (value === undefined) return undefined
  try {
    const amount = BigInt(value)
    return amount >= 0n ? amount : undefined
  } catch {
    return undefined
  }
}

export interface UseDepositAddressResult {
  response?: DepositAddressResponse
  depositAddress: string | null
  isReady: boolean
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
  const isReady = hasProviders && privateReadReady && !!privateReadAddress && !!client

  const query = useQuery<DepositAddressResponse, Error>({
    queryKey: ['accounting-deposit-address', ...privateReadQueryScope],
    queryFn: async () => {
      if (!privateReadAddress) throw new Error('No authenticated account available')
      if (!client) throw new Error('No accounting client')
      return executePrivateRead((readClient) => readClient.getDepositAddress())
    },
    enabled: isReady && (options.enabled ?? true),
  })

  return {
    response: query.data,
    depositAddress: query.data?.deposit_address ?? null,
    isReady,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
