'use client'

import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { TransactionSubmissionResponse } from '../types'

export interface UseUnlockFundsOptions {
  onSuccess?: (response: TransactionSubmissionResponse) => void
  onError?: (error: Error) => void
}

export interface UnlockFundsParams {
  lockId: number
}

export interface UseUnlockFundsResult {
  unlockFunds: (params: UnlockFundsParams) => Promise<TransactionSubmissionResponse | undefined>
  unlockAllExpired: () => Promise<TransactionSubmissionResponse | undefined>
  isPending: boolean
  isSuccess: boolean
  error: Error | null
  reset: () => void
}

export function useUnlockFunds(options: UseUnlockFundsOptions = {}): UseUnlockFundsResult {
  const { address } = useAccount()
  const { client } = useFlexvaultsContext()
  const queryClient = useQueryClient()

  const unlockMutation = useMutation({
    mutationFn: async (params: UnlockFundsParams) => {
      if (!address) {
        throw new Error('Wallet not connected')
      }

      return client.unlockFunds({
        user_address: address,
        lock_id: params.lockId,
      })
    },
    onSuccess: (data) => {
      options.onSuccess?.(data)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-locked-funds'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-total-locked-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-expired-locks'] })
    },
    onError: (error) => {
      options.onError?.(error as Error)
    },
  })

  const unlockAllMutation = useMutation({
    mutationFn: async () => {
      if (!address) {
        throw new Error('Wallet not connected')
      }

      return client.unlockAllExpired({
        user_address: address,
      })
    },
    onSuccess: (data) => {
      options.onSuccess?.(data)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-locked-funds'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-total-locked-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-expired-locks'] })
    },
    onError: (error) => {
      options.onError?.(error as Error)
    },
  })

  const unlockFunds = useCallback(
    async (params: UnlockFundsParams) => {
      return unlockMutation.mutateAsync(params)
    },
    [unlockMutation]
  )

  const unlockAllExpired = useCallback(async () => {
    return unlockAllMutation.mutateAsync()
  }, [unlockAllMutation])

  const reset = useCallback(() => {
    unlockMutation.reset()
    unlockAllMutation.reset()
  }, [unlockMutation, unlockAllMutation])

  return {
    unlockFunds,
    unlockAllExpired,
    isPending: unlockMutation.isPending || unlockAllMutation.isPending,
    isSuccess: unlockMutation.isSuccess || unlockAllMutation.isSuccess,
    error: (unlockMutation.error || unlockAllMutation.error) as Error | null,
    reset,
  }
}
