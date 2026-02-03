'use client'

import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useWalletClient } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import { signWithdrawMessage } from '../signatures'
import { getAccountingContract } from '../types'
import type { Bytes32, TransactionSubmissionResponse } from '../types'

export interface UseWithdrawOptions {
  onSuccess?: (response: TransactionSubmissionResponse) => void
  onError?: (error: Error) => void
}

export interface WithdrawParams {
  tokenId: Bytes32
  amount: bigint
}

export interface UseWithdrawResult {
  withdraw: (params: WithdrawParams) => Promise<TransactionSubmissionResponse | undefined>
  isPending: boolean
  isSuccess: boolean
  error: Error | null
  reset: () => void
}

export function useWithdraw(options: UseWithdrawOptions = {}): UseWithdrawResult {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { client, network } = useFlexvaultsContext()
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (params: WithdrawParams) => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected')
      }

      // Fetch the user's current withdrawal nonce
      const { nonce } = await client.getWithdrawalNonce(address)

      const signature = await signWithdrawMessage({
        walletClient,
        network,
        verifyingContract: getAccountingContract(network),
        message: {
          userAddress: address,
          tokenId: params.tokenId,
          amount: params.amount,
          nonce: BigInt(nonce),
        },
      })

      return client.requestWithdrawal({
        user_address: address,
        token_id: params.tokenId,
        amount: Number(params.amount),
        nonce,
        signature,
      })
    },
    onSuccess: (data) => {
      options.onSuccess?.(data)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-pending-withdrawals'] })
    },
    onError: (error) => {
      options.onError?.(error as Error)
    },
  })

  const withdraw = useCallback(
    async (params: WithdrawParams) => {
      return mutation.mutateAsync(params)
    },
    [mutation]
  )

  return {
    withdraw,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}
