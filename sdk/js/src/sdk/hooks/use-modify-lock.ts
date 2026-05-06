'use client'

import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useWalletClient } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import { signModifyLockMessage } from '../signatures'
import type { TransactionSubmissionResponse } from '../types'

export interface UseModifyLockOptions {
  onSuccess?: (response: TransactionSubmissionResponse) => void
  onError?: (error: Error) => void
}

export interface ModifyLockParams {
  lockId: number
  amount: bigint
  newExpiry: bigint
}

export interface UseModifyLockResult {
  modifyLock: (params: ModifyLockParams) => Promise<TransactionSubmissionResponse | undefined>
  isPending: boolean
  isSuccess: boolean
  error: Error | null
  reset: () => void
}

export function useModifyLock(options: UseModifyLockOptions = {}): UseModifyLockResult {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { client, networkConfig } = useFlexvaultsContext()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: ModifyLockParams) => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected')
      }

      const { nonce } = await client.getModifyLockNonce(address)

      const signature = await signModifyLockMessage({
        walletClient,
        chainId: networkConfig.chainId,
        verifyingContract: networkConfig.accountingContract,
        message: {
          lockId: BigInt(params.lockId),
          amount: params.amount,
          newExpiry: params.newExpiry,
          nonce: BigInt(nonce),
        },
      })

      return client.modifyLock({
        lock_id: params.lockId,
        amount: params.amount.toString(),
        new_expiry: params.newExpiry.toString(),
        nonce: String(nonce),
        signature,
      })
    },
    onSuccess: (data) => {
      options.onSuccess?.(data)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-locked-funds'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-total-locked-balance'] })
    },
    onError: (error) => {
      options.onError?.(error as Error)
    },
  })

  const modifyLock = useCallback(
    async (params: ModifyLockParams) => {
      return mutation.mutateAsync(params)
    },
    [mutation]
  )

  return {
    modifyLock,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}
