'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useWalletClient, useSwitchChain, useReadContract } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import { signWithdrawMessage } from '../signatures'
import type { Bytes32, TransactionSubmissionResponse } from '../types'

export interface UseWithdrawOptions {
  onSuccess?: (response: TransactionSubmissionResponse) => void
  /** Called when withdrawal is submitted to the backend */
  onSubmitSuccess?: (response: TransactionSubmissionResponse) => void
  /** Called when withdrawal is fully processed (broadcast to destination chain) */
  onProcessingSuccess?: () => void
  /** Called when processing times out - withdrawal may still be processing */
  onProcessingTimeout?: () => void
  onError?: (error: Error) => void
  /** Polling interval in ms for checking withdrawal status (default: 3000) */
  pollInterval?: number
  /** Max time to wait for withdrawal to be processed in ms (default: 180000 = 3 minutes) */
  pollTimeout?: number
}

export interface WithdrawParams {
  tokenId: Bytes32
  amount: bigint
}

export type WithdrawStep = 'idle' | 'switching-chain' | 'signing' | 'submitting' | 'processing'

export interface UseWithdrawResult {
  withdraw: (params: WithdrawParams) => Promise<TransactionSubmissionResponse | undefined>
  isPending: boolean
  isSuccess: boolean
  currentStep: WithdrawStep
  /** True if processing timed out (withdrawal may still be processing in background) */
  didTimeout: boolean
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
  {
    inputs: [],
    name: 'withdrawalCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

export function useWithdraw(options: UseWithdrawOptions = {}): UseWithdrawResult {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { client, networkConfig } = useFlexvaultsContext()
  const queryClient = useQueryClient()
  const { switchChainAsync } = useSwitchChain()

  const pollInterval = options.pollInterval ?? 3000
  const pollTimeout = options.pollTimeout ?? 180000 // 3 minutes

  const [currentStep, setCurrentStep] = useState<WithdrawStep>('idle')
  const [didTimeout, setDidTimeout] = useState(false)

  // Refs for polling
  const expectedIndexRef = useRef<number | null>(null)
  const withdrawalIndexRef = useRef<number | null>(null)
  const withdrawParamsRef = useRef<{ tokenId: Bytes32; amount: bigint } | null>(null)
  const pollStartTimeRef = useRef<number | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollingCompletedRef = useRef(false)

  // Refs for callbacks to avoid re-triggering effects
  const onSubmitSuccessRef = useRef(options.onSubmitSuccess)
  const onProcessingSuccessRef = useRef(options.onProcessingSuccess)
  const onProcessingTimeoutRef = useRef(options.onProcessingTimeout)
  const onSuccessRef = useRef(options.onSuccess)

  useEffect(() => {
    onSubmitSuccessRef.current = options.onSubmitSuccess
    onProcessingSuccessRef.current = options.onProcessingSuccess
    onProcessingTimeoutRef.current = options.onProcessingTimeout
    onSuccessRef.current = options.onSuccess
  }, [
    options.onSubmitSuccess,
    options.onProcessingSuccess,
    options.onProcessingTimeout,
    options.onSuccess,
  ])

  const { accountingContract, chainId: signingChainId } = networkConfig

  const { refetch: refetchNonce } = useReadContract({
    address: accountingContract,
    abi: ACCOUNTING_ABI,
    functionName: 'withdrawalNonces',
    args: address ? [address] : undefined,
    chainId: signingChainId,
    query: {
      enabled: !!address,
    },
  })

  const { refetch: refetchWithdrawalCount } = useReadContract({
    address: accountingContract,
    abi: ACCOUNTING_ABI,
    functionName: 'withdrawalCount',
    chainId: signingChainId,
  })

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  const startPolling = useCallback(() => {
    if (!address || pollingCompletedRef.current || expectedIndexRef.current === null) return

    setCurrentStep('processing')
    pollStartTimeRef.current = Date.now()

    const handleSuccess = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
      pollingCompletedRef.current = true
      setCurrentStep('idle')
      onProcessingSuccessRef.current?.()
      queryClient.refetchQueries({ queryKey: ['accounting-balance'] })
      queryClient.refetchQueries({ queryKey: ['accounting-pending-withdrawals'] })
    }

    const checkWithdrawalStatus = async () => {
      try {
        const elapsed = Date.now() - (pollStartTimeRef.current ?? Date.now())
        const params = withdrawParamsRef.current
        const expectedIndex = expectedIndexRef.current

        if (!params || expectedIndex === null) return

        // Check for timeout
        if (elapsed > pollTimeout) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current)
            pollIntervalRef.current = null
          }
          pollingCompletedRef.current = true
          setCurrentStep('idle')
          setDidTimeout(true)
          onProcessingTimeoutRef.current?.()
          queryClient.refetchQueries({ queryKey: ['accounting-balance'] })
          queryClient.refetchQueries({ queryKey: ['accounting-pending-withdrawals'] })
          return
        }

        // If we already found our withdrawal index, just poll for resolution
        if (withdrawalIndexRef.current !== null) {
          const info = await client.getWithdrawalInfo(withdrawalIndexRef.current)
          if (info.resolved) {
            handleSuccess()
          }
          return
        }

        // Find our withdrawal starting from expected index
        // Check a few indexes in case of race condition with other withdrawals
        for (let i = expectedIndex; i < expectedIndex + 5; i++) {
          try {
            const info = await client.getWithdrawalInfo(i)
            if (
              info.user_address.toLowerCase() === address.toLowerCase() &&
              info.token_id.toLowerCase() === params.tokenId.toLowerCase() &&
              info.amount === String(params.amount)
            ) {
              withdrawalIndexRef.current = i
              if (info.resolved) {
                handleSuccess()
              }
              return
            }
          } catch {
            // Index doesn't exist yet, will retry next poll
            break
          }
        }
      } catch (err) {
        // Don't fail on polling errors, just keep trying
        console.warn('Error polling withdrawal status:', err)
      }
    }

    // Start polling
    pollIntervalRef.current = setInterval(checkWithdrawalStatus, pollInterval)
    // Also check immediately
    checkWithdrawalStatus()
  }, [address, client, queryClient, pollInterval, pollTimeout])

  const mutation = useMutation({
    mutationFn: async (params: WithdrawParams) => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected')
      }

      // Reset polling state for new withdrawal
      pollingCompletedRef.current = false
      expectedIndexRef.current = null
      withdrawalIndexRef.current = null
      withdrawParamsRef.current = { tokenId: params.tokenId, amount: params.amount }
      setDidTimeout(false)

      setCurrentStep('switching-chain')
      await switchChainAsync({ chainId: signingChainId })

      // Get withdrawal count BEFORE submitting - our withdrawal will be at this index
      const { data: withdrawalCount } = await refetchWithdrawalCount()
      if (withdrawalCount === undefined) {
        throw new Error('Failed to fetch withdrawal count')
      }
      expectedIndexRef.current = Number(withdrawalCount)

      const { data: nonce } = await refetchNonce()
      if (nonce === undefined) {
        throw new Error('Failed to fetch withdrawal nonce')
      }

      setCurrentStep('signing')
      const signature = await signWithdrawMessage({
        walletClient,
        chainId: signingChainId,
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
      onSubmitSuccessRef.current?.(data)
      onSuccessRef.current?.(data)
      // Start polling for withdrawal completion
      startPolling()
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
    setDidTimeout(false)
    expectedIndexRef.current = null
    withdrawalIndexRef.current = null
    withdrawParamsRef.current = null
    pollStartTimeRef.current = null
    pollingCompletedRef.current = false
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    mutation.reset()
  }, [mutation])

  const isPending =
    mutation.isPending || currentStep === 'processing' || currentStep === 'submitting'

  return {
    withdraw,
    isPending,
    isSuccess: mutation.isSuccess && pollingCompletedRef.current && !didTimeout,
    currentStep,
    didTimeout,
    error: mutation.error as Error | null,
    reset,
  }
}
