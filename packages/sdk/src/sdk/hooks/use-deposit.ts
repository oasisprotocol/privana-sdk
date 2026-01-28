'use client'

import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  useAccount,
  useWalletClient,
  useSendTransaction,
  useWaitForTransactionReceipt,
} from 'wagmi'
import { useAccountingContext } from '../context/accounting-provider'
import type { Bytes32, DepositQuoteResponse } from '../types'

export interface UseDepositOptions {
  onQuoteSuccess?: (quote: DepositQuoteResponse) => void
  onDepositSuccess?: (txHash: string) => void
  onIncludeSuccess?: (submissionId: string) => void
  onError?: (error: Error) => void
}

export interface DepositParams {
  tokenId: Bytes32
  amount: number
}

export interface UseDepositResult {
  quote: DepositQuoteResponse | null
  txHash: `0x${string}` | undefined
  submissionId: string | null
  isGettingQuote: boolean
  isSendingTransaction: boolean
  isWaitingForConfirmation: boolean
  isIncludingDeposit: boolean
  isPending: boolean
  error: Error | null
  getQuote: (params: DepositParams) => Promise<DepositQuoteResponse | undefined>
  executeDeposit: () => Promise<void>
  reset: () => void
}

export function useDeposit(options: UseDepositOptions = {}): UseDepositResult {
  const { address } = useAccount()
  const { client } = useAccountingContext()
  const { data: walletClient } = useWalletClient()
  const queryClient = useQueryClient()

  const [quote, setQuote] = useState<DepositQuoteResponse | null>(null)
  const [submissionId, setSubmissionId] = useState<string | null>(null)

  const quoteMutation = useMutation({
    mutationFn: async (params: DepositParams) => {
      if (!address) throw new Error('No wallet connected')
      return client.getDepositQuote({
        user_address: address,
        token_id: params.tokenId,
        amount: params.amount,
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
  } = useSendTransaction()

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({
    hash: txHash,
  })

  const includeMutation = useMutation({
    mutationFn: async (evmTxData: string) => {
      if (!address || !quote) throw new Error('Missing required data')
      return client.includeDeposit({
        user_address: address,
        token_id: quote.token_id,
        evm_transaction_data: evmTxData as `0x${string}`,
      })
    },
    onSuccess: (data) => {
      setSubmissionId(data.submission_id)
      options.onIncludeSuccess?.(data.submission_id)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
    },
    onError: (error) => {
      options.onError?.(error as Error)
    },
  })

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

  const reset = useCallback(() => {
    setQuote(null)
    setSubmissionId(null)
    quoteMutation.reset()
    includeMutation.reset()
  }, [quoteMutation, includeMutation])

  const isPending =
    quoteMutation.isPending || isSendingTx || isConfirming || includeMutation.isPending

  const error = quoteMutation.error || sendError || includeMutation.error

  return {
    quote,
    txHash,
    submissionId,
    isGettingQuote: quoteMutation.isPending,
    isSendingTransaction: isSendingTx,
    isWaitingForConfirmation: isConfirming,
    isIncludingDeposit: includeMutation.isPending,
    isPending,
    error: error as Error | null,
    getQuote,
    executeDeposit,
    reset,
  }
}
