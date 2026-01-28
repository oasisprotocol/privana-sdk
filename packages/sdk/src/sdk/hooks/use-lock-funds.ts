'use client'

import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useWalletClient } from 'wagmi'
import { useAccountingContext } from '../context/accounting-provider'
import { signLockMessage } from '../signatures'
import { getAccountingContract } from '../types'
import type { Bytes32, Address, TransactionSubmissionResponse } from '../types'

export interface UseLockFundsOptions {
  onSuccess?: (response: TransactionSubmissionResponse) => void
  onError?: (error: Error) => void
}

export interface LockFundsParams {
  serviceAddress: Address
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
  const { client, network } = useAccountingContext()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: LockFundsParams) => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected')
      }

      const signature = await signLockMessage({
        walletClient,
        network,
        verifyingContract: getAccountingContract(network),
        message: {
          userAddress: address,
          serviceAddress: params.serviceAddress,
          tokenId: params.tokenId,
          amount: params.amount,
          expiry: params.expiry,
        },
      })

      return client.lockFunds({
        user_address: address,
        service_address: params.serviceAddress,
        token_id: params.tokenId,
        amount: Number(params.amount),
        expiry: Number(params.expiry),
        signature,
      })
    },
    onSuccess: (data) => {
      options.onSuccess?.(data)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-locked-funds'] })
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
