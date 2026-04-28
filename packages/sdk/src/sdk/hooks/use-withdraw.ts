'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount, useWalletClient } from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import { useEnsureCorrectChain } from './use-ensure-correct-chain'
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

export function useWithdraw(options: UseWithdrawOptions = {}): UseWithdrawResult {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { client, networkConfig } = useFlexvaultsContext()
  const queryClient = useQueryClient()
  const { chainId, ensureCorrectChain } = useEnsureCorrectChain()

  const pollInterval = options.pollInterval ?? 3000
  const pollTimeout = options.pollTimeout ?? 180000

  const [currentStep, setCurrentStep] = useState<WithdrawStep>('idle')
  const [didTimeout, setDidTimeout] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [withdrawError, setWithdrawError] = useState<Error | null>(null)

  const generationRef = useRef(0)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Use refs for callbacks to avoid stale closures in the long-running withdraw flow
  const onSubmitSuccessRef = useRef(options.onSubmitSuccess)
  const onProcessingSuccessRef = useRef(options.onProcessingSuccess)
  const onProcessingTimeoutRef = useRef(options.onProcessingTimeout)
  const onSuccessRef = useRef(options.onSuccess)
  const onErrorRef = useRef(options.onError)

  useEffect(() => {
    onSubmitSuccessRef.current = options.onSubmitSuccess
    onProcessingSuccessRef.current = options.onProcessingSuccess
    onProcessingTimeoutRef.current = options.onProcessingTimeout
    onSuccessRef.current = options.onSuccess
    onErrorRef.current = options.onError
  }, [
    options.onSubmitSuccess,
    options.onProcessingSuccess,
    options.onProcessingTimeout,
    options.onSuccess,
    options.onError,
  ])

  const { chainId: signingChainId } = networkConfig

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current)
      }
    }
  }, [])

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }, [])

  const reset = useCallback(() => {
    generationRef.current++
    stopPolling()
    setCurrentStep('idle')
    setDidTimeout(false)
    setIsSuccess(false)
    setWithdrawError(null)
  }, [stopPolling])

  const withdraw = useCallback(
    async (params: WithdrawParams): Promise<TransactionSubmissionResponse | undefined> => {
      reset()
      const generation = generationRef.current
      const isStale = () => generation !== generationRef.current

      try {
        if (!address || !walletClient) throw new Error('Wallet not connected')

        // Snapshot pending withdrawal indices so we can detect the new one after submission
        const pendingResponse = await client.getPendingWithdrawals(address)
        if (isStale()) return undefined
        const knownIndices = new Set(pendingResponse.pending_withdrawals.map((w) => w.index))

        // 1. Switch to signing chain
        if (chainId !== signingChainId) {
          setCurrentStep('switching-chain')
        }
        await ensureCorrectChain(signingChainId)
        if (isStale()) return undefined

        // 2. Fetch nonce from API (direct Sapphire contract reads revert without encrypted calldata)
        const nonceResponse = await client.getWithdrawalNonce(address)
        if (isStale()) return undefined
        const nonce = BigInt(nonceResponse.nonce)

        // 3. Sign EIP-712 message
        setCurrentStep('signing')
        const signature = await signWithdrawMessage({
          walletClient,
          chainId: signingChainId,
          verifyingContract: networkConfig.accountingContract,
          message: {
            userAddress: address,
            tokenId: params.tokenId,
            amount: params.amount,
            nonce,
          },
        })
        if (isStale()) return undefined

        // 4. Submit to API
        setCurrentStep('submitting')
        const submissionResponse = await client.requestWithdrawal({
          user_address: address,
          token_id: params.tokenId,
          amount: params.amount.toString(),
          nonce: String(nonce),
          signature,
        })
        if (isStale()) return submissionResponse

        onSubmitSuccessRef.current?.(submissionResponse)
        onSuccessRef.current?.(submissionResponse)

        // 5. Poll for withdrawal completion
        setCurrentStep('processing')
        const pollStartTime = Date.now()
        let withdrawalIndex: number | null = null
        let consecutiveFailures = 0

        const handleSuccess = () => {
          stopPolling()
          setCurrentStep('idle')
          setIsSuccess(true)
          onProcessingSuccessRef.current?.()
          queryClient.refetchQueries({ queryKey: ['accounting-balance'] })
          queryClient.refetchQueries({ queryKey: ['accounting-pending-withdrawals'] })
        }

        const handleTimeout = () => {
          stopPolling()
          setCurrentStep('idle')
          setDidTimeout(true)
          onProcessingTimeoutRef.current?.()
          queryClient.refetchQueries({ queryKey: ['accounting-balance'] })
          queryClient.refetchQueries({ queryKey: ['accounting-pending-withdrawals'] })
        }

        const checkWithdrawalStatus = async (): Promise<boolean> => {
          if (isStale()) return true

          if (Date.now() - pollStartTime > pollTimeout) {
            handleTimeout()
            return true
          }

          try {
            if (withdrawalIndex !== null) {
              const info = await client.getWithdrawalInfo(withdrawalIndex)
              if (isStale()) return true
              consecutiveFailures = 0
              if (info.resolved) {
                handleSuccess()
                return true
              }
              return false
            }

            // Find our new withdrawal in the pending list by matching against the
            // pre-submission snapshot. This avoids sequential index scanning.
            const pending = await client.getPendingWithdrawals(address)
            if (isStale()) return true
            consecutiveFailures = 0
            const match = pending.pending_withdrawals.find(
              (w) =>
                !knownIndices.has(w.index) &&
                w.user_address.toLowerCase() === address.toLowerCase() &&
                w.token_id.toLowerCase() === params.tokenId.toLowerCase() &&
                w.amount === String(params.amount)
            )

            if (match) {
              withdrawalIndex = match.index
              if (match.resolved) {
                handleSuccess()
                return true
              }
            }
          } catch (err) {
            if (isStale()) return true
            consecutiveFailures++
            console.warn('Error polling withdrawal status:', err)
            if (consecutiveFailures >= 3) {
              handleTimeout()
              return true
            }
          }
          return false
        }

        const pollLoop = async () => {
          const done = await checkWithdrawalStatus()
          if (!done && !isStale() && pollIntervalRef.current !== null) {
            pollIntervalRef.current = setTimeout(pollLoop, pollInterval)
          }
        }
        pollIntervalRef.current = setTimeout(pollLoop, 0)

        return submissionResponse
      } catch (err) {
        if (isStale()) return undefined
        const error = err instanceof Error ? err : new Error('Withdrawal failed')
        setCurrentStep('idle')
        setWithdrawError(error)
        onErrorRef.current?.(error)
        return undefined
      }
    },
    [
      address,
      walletClient,
      client,
      chainId,
      signingChainId,
      networkConfig.accountingContract,
      ensureCorrectChain,
      pollInterval,
      pollTimeout,
      queryClient,
      stopPolling,
      reset,
    ]
  )

  const isPending = currentStep !== 'idle'

  return {
    withdraw,
    isPending,
    isSuccess,
    currentStep,
    didTimeout,
    error: withdrawError,
    reset,
  }
}
