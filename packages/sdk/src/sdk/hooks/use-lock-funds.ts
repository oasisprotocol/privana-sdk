'use client'

import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useWalletClient } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import { signLockMessage } from '../signatures'
import type { Bytes32, TransactionSubmissionResponse } from '../types'

export interface UseLockFundsOptions {
  onSuccess?: (response: TransactionSubmissionResponse) => void
  onError?: (error: Error) => void
}

export interface LockFundsParams {
  tokenId: Bytes32
  amount: bigint
  expiry: bigint
}

export interface UseLockFundsResult {
  lockFunds: (params: LockFundsParams) => Promise<TransactionSubmissionResponse | undefined>
  isPending: boolean
  isSuccess: boolean
  error: Error | null
  reset: () => void
}

export function useLockFunds(options: UseLockFundsOptions = {}): UseLockFundsResult {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { client, networkConfig, serviceAddress } = useFlexvaultsContext()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: LockFundsParams) => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected')
      }
      if (!serviceAddress) {
        throw new Error('Service address not configured')
      }

      const { nonce } = await client.getLockNonce(address)

      const signature = await signLockMessage({
        walletClient,
        chainId: networkConfig.chainId,
        verifyingContract: networkConfig.accountingContract,
        message: {
          userAddress: address,
          serviceAddress,
          tokenId: params.tokenId,
          amount: params.amount,
          expiry: params.expiry,
          nonce: BigInt(nonce),
        },
      })

      return client.lockFunds({
        user_address: address,
        service_address: serviceAddress,
        token_id: params.tokenId,
        amount: params.amount.toString(),
        expiry: params.expiry.toString(),
        nonce: String(nonce),
        signature,
      })
    },
    onSuccess: (data) => {
      options.onSuccess?.(data)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-locked-funds'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-total-locked-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
    },
    onError: (error) => {
      options.onError?.(error as Error)
    },
  })

  const lockFunds = useCallback(
    async (params: LockFundsParams) => {
      return mutation.mutateAsync(params)
    },
    [mutation]
  )

  return {
    lockFunds,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}
