'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAccount } from 'wagmi'
import { usePrivanaContext } from '../context/privana-provider'
import { signWithdrawMessage } from '../signatures'
import type { Bytes32, TransactionSubmissionResponse } from '../types'
import { useSigningClient } from './use-signing-client'

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

export type WithdrawStep = 'idle' | 'preparing' | 'signing' | 'submitting' | 'processing'

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

interface WithdrawalReader {
  getWithdrawalNonce(userAddress: string): Promise<{ nonce: string }>
  getPendingWithdrawals(
    userAddress: string
  ): Promise<{ pending_withdrawals: { token_id: string; amount: string }[] }>
}

/**
 * What actually happened to a submitted withdrawal whose request errored:
 * - 'landed': this withdrawal was accepted (its nonce is spent and a pending
 *   withdrawal matches its token and amount) — show it as processing.
 * - 'lost-nonce-race': a DIFFERENT withdrawal of the user's spent the nonce
 *   (e.g. a second quick withdrawal on another chain); this one was never
 *   submitted and can simply be retried.
 * - 'failed': the nonce is unspent, or the check itself is unavailable —
 *   surface the original error.
 * The withdrawal nonce is single-use, which is what makes the first two
 * distinguishable from a plain failure at all.
 */
export async function classifyFailedSubmit(
  client: WithdrawalReader,
  userAddress: string,
  submittedNonce: bigint,
  tokenId: string,
  amount: bigint
): Promise<'landed' | 'lost-nonce-race' | 'failed'> {
  try {
    const { nonce } = await client.getWithdrawalNonce(userAddress)
    if (BigInt(nonce) <= submittedNonce) return 'failed'
  } catch {
    return 'failed'
  }
  try {
    const { pending_withdrawals } = await client.getPendingWithdrawals(userAddress)
    const mine = pending_withdrawals.some(
      (w) => w.token_id.toLowerCase() === tokenId.toLowerCase() && BigInt(w.amount) === amount
    )
    return mine ? 'landed' : 'lost-nonce-race'
  } catch {
    // Nonce advancement is already proven; without the pending list the
    // coarse verdict is the safe one.
    return 'landed'
  }
}

export function useWithdraw(options: UseWithdrawOptions = {}): UseWithdrawResult {
  const { address } = useAccount()
  const walletClient = useSigningClient()
  const { client, networkConfig } = usePrivanaContext()
  const queryClient = useQueryClient()

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
      let submittedNonce: bigint | null = null

      try {
        if (!address || !walletClient) throw new Error('Wallet not connected')

        setCurrentStep('preparing')

        // 1. Fetch nonce from API (direct Sapphire contract reads revert without encrypted calldata)
        const nonceResponse = await client.getWithdrawalNonce(address)
        if (isStale()) return undefined
        const nonce = BigInt(nonceResponse.nonce)

        // 2. Sign EIP-712 message
        setCurrentStep('signing')
        const signature = await signWithdrawMessage({
          walletClient,
          chainId: signingChainId,
          verifyingContract: networkConfig.accountingContract,
          message: {
            tokenId: params.tokenId,
            amount: params.amount,
            nonce,
          },
        })
        if (isStale()) return undefined

        // 3. Submit to API
        setCurrentStep('submitting')
        submittedNonce = nonce
        const submissionResponse = await client.requestWithdrawal({
          token_id: params.tokenId,
          amount: params.amount.toString(),
          nonce: String(nonce),
          signature,
        })
        queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
        queryClient.invalidateQueries({ queryKey: ['accounting-pending-withdrawals'] })
        if (isStale()) return submissionResponse

        onSubmitSuccessRef.current?.(submissionResponse)
        onSuccessRef.current?.(submissionResponse)

        // 4. Poll for withdrawal completion
        setCurrentStep('processing')
        const pollStartTime = Date.now()
        const withdrawalIndex = submissionResponse.index
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

        if (withdrawalIndex == null) {
          handleTimeout()
          return submissionResponse
        }

        const checkWithdrawalStatus = async (): Promise<boolean> => {
          if (isStale()) return true

          if (Date.now() - pollStartTime > pollTimeout) {
            handleTimeout()
            return true
          }

          try {
            const info = await client.getWithdrawalInfo(withdrawalIndex)
            if (isStale()) return true
            consecutiveFailures = 0
            if (info.resolved) {
              handleSuccess()
              return true
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

        const verdict =
          submittedNonce != null && address != null
            ? await classifyFailedSubmit(
                client,
                address,
                submittedNonce,
                params.tokenId,
                params.amount
              )
            : 'failed'
        if (isStale()) return undefined
        if (verdict === 'landed') {
          setCurrentStep('idle')
          setDidTimeout(true)
          onProcessingTimeoutRef.current?.()
          queryClient.refetchQueries({ queryKey: ['accounting-balance'] })
          queryClient.refetchQueries({ queryKey: ['accounting-pending-withdrawals'] })
          return undefined
        }

        const error =
          verdict === 'lost-nonce-race'
            ? new Error(
                'A previous withdrawal was just accepted; this one was not submitted. Please try again.'
              )
            : err instanceof Error
              ? err
              : new Error('Withdrawal failed')
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
      signingChainId,
      networkConfig.accountingContract,
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
