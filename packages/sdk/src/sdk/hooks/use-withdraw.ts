'use client'

import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useWalletClient, useSwitchChain, useReadContract } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import { signWithdrawMessage } from '../signatures'
import { getAccountingContract, getChainId } from '../types'
import type { Bytes32, TransactionSubmissionResponse } from '../types'

export interface UseWithdrawOptions {
  onSuccess?: (response: TransactionSubmissionResponse) => void
  onError?: (error: Error) => void
}

export interface WithdrawParams {
  tokenId: Bytes32
  amount: bigint
}

export type WithdrawStep = 'idle' | 'switching-chain' | 'signing' | 'submitting'

export interface UseWithdrawResult {
  withdraw: (params: WithdrawParams) => Promise<TransactionSubmissionResponse | undefined>
  isPending: boolean
  isSuccess: boolean
  currentStep: WithdrawStep
  error: Error | null
  reset: () => void
}

const ACCOUNTING_ABI = [
  {
    inputs: [{ name: 'user', type: 'address' }],
    name: 'withdrawalNonces',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export function useWithdraw(options: UseWithdrawOptions = {}): UseWithdrawResult {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { client, network } = useFlexvaultsContext()
  const queryClient = useQueryClient()
  const { switchChainAsync } = useSwitchChain()
  const [currentStep, setCurrentStep] = useState<WithdrawStep>('idle')

  const accountingContract = getAccountingContract(network)
  const signingChainId = getChainId(network)

  const { data: currentNonce, refetch: refetchNonce } = useReadContract({
    address: accountingContract,
    abi: ACCOUNTING_ABI,
    functionName: 'withdrawalNonces',
    args: address ? [address] : undefined,
    chainId: signingChainId,
    query: {
      enabled: !!address,
    },
  })

  const mutation = useMutation({
    mutationFn: async (params: WithdrawParams) => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected')
      }

      setCurrentStep('switching-chain')
      await switchChainAsync({ chainId: signingChainId })

      const { data: nonce } = await refetchNonce()
      if (nonce === undefined) {
        throw new Error('Failed to fetch withdrawal nonce')
      }

      setCurrentStep('signing')
      const signature = await signWithdrawMessage({
        walletClient,
        network,
        verifyingContract: accountingContract,
        message: {
          userAddress: address,
          tokenId: params.tokenId,
          amount: params.amount,
          nonce,
        },
      })

      setCurrentStep('submitting')
      return client.requestWithdrawal({
        user_address: address,
        token_id: params.tokenId,
        amount: Number(params.amount),
        nonce: Number(nonce),
        signature,
      })
    },
    onSuccess: (data) => {
      setCurrentStep('idle')
      options.onSuccess?.(data)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-pending-withdrawals'] })
    },
    onError: (error) => {
      setCurrentStep('idle')
      options.onError?.(error as Error)
    },
  })

  const withdraw = useCallback(
    async (params: WithdrawParams) => {
      return mutation.mutateAsync(params)
    },
    [mutation]
  )

  const reset = useCallback(() => {
    setCurrentStep('idle')
    mutation.reset()
  }, [mutation])

  return {
    withdraw,
    isPending: mutation.isPending,
    isSuccess: mutation.isSuccess,
    currentStep,
    error: mutation.error as Error | null,
    reset,
  }
}
