'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useAccount,
  useWalletClient,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { useFlexvaultsContext } from '../context/flexvaults-provider'
import type { Bytes32, DepositQuoteResponse, BalanceResponse } from '../types'

export interface UseDepositOptions {
  onQuoteSuccess?: (quote: DepositQuoteResponse) => void
  onDepositSuccess?: (txHash: string) => void
  onIncludeSuccess?: (txHash: string) => void
  /** Called when deposit processing times out - deposit may still be processing */
  onIncludeTimeout?: (txHash: string) => void
  onError?: (error: Error) => void
  /** Polling interval in ms for checking deposit status (default: 3000) */
  pollInterval?: number
  /** Max time to wait for deposit to be processed in ms (default: 120000 = 2 minutes) */
  pollTimeout?: number
}

export interface DepositParams {
  tokenId: Bytes32
  amount: bigint
}

export interface UseDepositResult {
  quote: DepositQuoteResponse | null
  txHash: `0x${string}` | undefined
  isGettingQuote: boolean
  isSendingTransaction: boolean
  isWaitingForConfirmation: boolean
  isWaitingForProcessing: boolean
  /** True if processing timed out (deposit may still be processing in background) */
  didTimeout: boolean
  isPending: boolean
  error: Error | null
  deposit: (params: DepositParams) => Promise<void>
  getQuote: (params: DepositParams) => Promise<DepositQuoteResponse | undefined>
  executeDeposit: () => Promise<void>
  reset: () => void
}

export function useDeposit(options: UseDepositOptions = {}): UseDepositResult {
  const { address } = useAccount()
  const { client } = useFlexvaultsContext()
  const { data: walletClient } = useWalletClient()
  const queryClient = useQueryClient()

  const pollInterval = options.pollInterval ?? 3000
  const pollTimeout = options.pollTimeout ?? 120000 // 2 minutes

  const [quote, setQuote] = useState<DepositQuoteResponse | null>(null)
  const [isWaitingForProcessing, setIsWaitingForProcessing] = useState(false)
  const [didTimeout, setDidTimeout] = useState(false)
  const [processingError, setProcessingError] = useState<Error | null>(null)

  // Store initial balance before deposit to detect when it changes
  const initialBalanceRef = useRef<bigint | null>(null)
  const initialBalanceFetchedRef = useRef(false)
  const pollStartTimeRef = useRef<number | null>(null)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  // Track when polling has completed (success or timeout) to prevent effect re-triggering
  const pollingCompletedRef = useRef(false)
  // Store the original tokenId from deposit params to ensure query key consistency
  const depositTokenIdRef = useRef<Bytes32 | null>(null)

  // Use refs for callbacks to avoid re-triggering effects when options object changes
  const onDepositSuccessRef = useRef(options.onDepositSuccess)
  const onIncludeSuccessRef = useRef(options.onIncludeSuccess)
  const onIncludeTimeoutRef = useRef(options.onIncludeTimeout)
  useEffect(() => {
    onDepositSuccessRef.current = options.onDepositSuccess
    onIncludeSuccessRef.current = options.onIncludeSuccess
    onIncludeTimeoutRef.current = options.onIncludeTimeout
  }, [options.onDepositSuccess, options.onIncludeSuccess, options.onIncludeTimeout])

  const quoteMutation = useMutation({
    mutationFn: async (params: DepositParams) => {
      if (!address) throw new Error('No wallet connected')

      // Store the original tokenId to ensure query key consistency later
      // (API response might have different casing)
      depositTokenIdRef.current = params.tokenId

      // Fetch initial balance FIRST before getting quote
      // This ensures we have a baseline to compare against when polling
      // TODO: This polling approach is a workaround. Ideally we should have a dedicated
      // endpoint to check deposit status by source chain tx hash, or the Deposit event
      // on Sapphire should include the source tx hash so we can query it directly.
      try {
        const balanceResponse = await client.getBalance(address, params.tokenId)
        initialBalanceRef.current = BigInt(balanceResponse.balance)
        initialBalanceFetchedRef.current = true
      } catch {
        // If we can't get initial balance (e.g., user has no balance yet), start from 0
        initialBalanceRef.current = BigInt(0)
        initialBalanceFetchedRef.current = true
      }

      return client.getDepositQuote({
        user_address: address,
        token_id: params.tokenId,
        amount: params.amount.toString(),
      })
    },
    onSuccess: (data) => {
      setQuote(data)
      options.onQuoteSuccess?.(data)
    },
    onError: (error) => {
      options.onError?.(error as Error)
    },
  })

  const {
    sendTransaction,
    data: txHash,
    isPending: isSendingTx,
    error: sendError,
    reset: resetSendTransaction,
  } = useSendTransaction()

  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
      }
    }
  }, [])

  // When tx is confirmed, start polling for deposit to be processed
  // TODO: Replace balance polling with a proper deposit status check.
  // The accounting module's deposit listener processes deposits automatically,
  // but we don't have a clean way to check if a specific deposit has been processed.
  // Polling balance works but could give false positives if balance changes for other reasons.
  useEffect(() => {
    if (
      isConfirmed &&
      txHash &&
      quote &&
      address &&
      !isWaitingForProcessing &&
      !didTimeout &&
      !pollingCompletedRef.current
    ) {
      // Ensure we have initial balance before starting to poll
      if (!initialBalanceFetchedRef.current) {
        console.warn('Initial balance not fetched, cannot poll for deposit confirmation')
        return
      }

      onDepositSuccessRef.current?.(txHash)
      setIsWaitingForProcessing(true)
      pollStartTimeRef.current = Date.now()

      // Invalidate wagmi wallet balance queries since tokens have left the wallet
      // This refreshes the "Amount X USDC" display in the deposit form
      queryClient.invalidateQueries({ queryKey: ['readContract'] })

      const checkBalance = async () => {
        try {
          const balanceResponse = await client.getBalance(address, quote.token_id)
          const currentBalance = BigInt(balanceResponse.balance)
          const initialBalance = initialBalanceRef.current ?? BigInt(0)

          // Deposit is processed when balance has changed (increased)
          if (currentBalance > initialBalance) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            pollingCompletedRef.current = true
            setIsWaitingForProcessing(false)
            // Directly update the query cache with the balance we already fetched
            // Use depositTokenIdRef (original param) instead of quote.token_id to ensure
            // the query key matches what useBalance uses (avoiding casing mismatches)
            if (depositTokenIdRef.current) {
              queryClient.setQueryData<BalanceResponse>(
                ['accounting-balance', address, depositTokenIdRef.current],
                balanceResponse
              )
            }
            onIncludeSuccessRef.current?.(txHash)
            return
          }

          // Check for timeout
          if (pollStartTimeRef.current && Date.now() - pollStartTimeRef.current > pollTimeout) {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current)
              pollIntervalRef.current = null
            }
            pollingCompletedRef.current = true
            setIsWaitingForProcessing(false)
            setDidTimeout(true)
            // Call timeout callback - deposit may still be processing in background
            onIncludeTimeoutRef.current?.(txHash)
            // Invalidate balance queries so they refetch when observed
            queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
          }
        } catch (err) {
          // Don't fail on polling errors, just keep trying
          console.warn('Error polling balance:', err)
        }
      }

      // Start polling
      pollIntervalRef.current = setInterval(checkBalance, pollInterval)
      // Also check immediately
      checkBalance()
    }
  }, [
    isConfirmed,
    txHash,
    quote,
    address,
    isWaitingForProcessing,
    didTimeout,
    client,
    queryClient,
    pollInterval,
    pollTimeout,
  ])

  const getQuote = useCallback(
    async (params: DepositParams) => {
      return quoteMutation.mutateAsync(params)
    },
    [quoteMutation]
  )

  const executeDeposit = useCallback(async () => {
    if (!quote || !walletClient) {
      throw new Error('No quote available or wallet not connected')
    }

    sendTransaction({
      to: quote.transaction.to,
      value: BigInt(quote.transaction.value),
      data: quote.transaction.data as `0x${string}`,
    })
  }, [quote, walletClient, sendTransaction])

  const deposit = useCallback(
    async (params: DepositParams) => {
      const quoteResult = await quoteMutation.mutateAsync(params)
      if (!quoteResult || !walletClient) {
        throw new Error('Failed to get quote or wallet not connected')
      }
      sendTransaction({
        to: quoteResult.transaction.to,
        value: BigInt(quoteResult.transaction.value),
        data: quoteResult.transaction.data as `0x${string}`,
      })
    },
    [quoteMutation, walletClient, sendTransaction]
  )

  const reset = useCallback(() => {
    setQuote(null)
    setIsWaitingForProcessing(false)
    setDidTimeout(false)
    setProcessingError(null)
    initialBalanceRef.current = null
    initialBalanceFetchedRef.current = false
    pollStartTimeRef.current = null
    pollingCompletedRef.current = false
    depositTokenIdRef.current = null
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
    quoteMutation.reset()
    resetSendTransaction()
  }, [quoteMutation, resetSendTransaction])

  const isPending = quoteMutation.isPending || isSendingTx || isConfirming || isWaitingForProcessing

  const error = quoteMutation.error || sendError || processingError

  return {
    quote,
    txHash,
    isGettingQuote: quoteMutation.isPending,
    isSendingTransaction: isSendingTx,
    isWaitingForConfirmation: isConfirming,
    isWaitingForProcessing,
    didTimeout,
    isPending,
    error: error as Error | null,
    deposit,
    getQuote,
    executeDeposit,
    reset,
  }
}
