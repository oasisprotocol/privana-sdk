'use client'

import { useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAccount, useWalletClient } from 'wagmi'
import { usePrivanaContext } from '../context/privana-provider'
import { signTransferMessage, signTransferLockedMessage } from '../signatures'
import type { Bytes32, Address, TransactionSubmissionResponse } from '../types'

export interface UseTransferOptions {
  onSuccess?: (response: TransactionSubmissionResponse) => void
  onError?: (error: Error) => void
}

export interface TransferParams {
  toAddress: Address
  tokenId: Bytes32
  amount: bigint
}

export interface TransferLockedParams {
  lockId: number
  toAddress: Address
  amount: bigint
}

export interface UseTransferResult {
  transfer: (params: TransferParams) => Promise<TransactionSubmissionResponse | undefined>
  transferLocked: (
    params: TransferLockedParams
  ) => Promise<TransactionSubmissionResponse | undefined>
  isPending: boolean
  isSuccess: boolean
  error: Error | null
  reset: () => void
}

export function useTransfer(options: UseTransferOptions = {}): UseTransferResult {
  const { address } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { client, networkConfig, serviceAddress } = usePrivanaContext()
  const queryClient = useQueryClient()

  const transferMutation = useMutation({
    mutationFn: async (params: TransferParams) => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected')
      }

      const { nonce } = await client.getTransferNonce(address)

      const signature = await signTransferMessage({
        walletClient,
        chainId: networkConfig.chainId,
        verifyingContract: networkConfig.accountingContract,
        message: {
          toAddress: params.toAddress,
          tokenId: params.tokenId,
          amount: params.amount,
          nonce: BigInt(nonce),
        },
      })

      return client.transferFunds({
        to_address: params.toAddress,
        token_id: params.tokenId,
        amount: params.amount.toString(),
        nonce: String(nonce),
        signature,
      })
    },
    onSuccess: (data) => {
      options.onSuccess?.(data)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
    },
    onError: (error) => {
      options.onError?.(error as Error)
    },
  })

  const transferLockedMutation = useMutation({
    mutationFn: async (params: TransferLockedParams) => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected')
      }
      if (!serviceAddress) {
        throw new Error('Service address not configured')
      }

      const { nonce } = await client.getTransferLockedNonce(serviceAddress)

      const signature = await signTransferLockedMessage({
        walletClient,
        chainId: networkConfig.chainId,
        verifyingContract: networkConfig.accountingContract,
        message: {
          userAddress: address,
          toAddress: params.toAddress,
          lockId: BigInt(params.lockId),
          amount: params.amount,
          nonce: BigInt(nonce),
          serviceAddress,
        },
      })

      return client.transferLockedFunds({
        user_address: address,
        lock_id: params.lockId,
        to_address: params.toAddress,
        amount: params.amount.toString(),
        service_address: serviceAddress,
        nonce: String(nonce),
        signature,
      })
    },
    onSuccess: (data) => {
      options.onSuccess?.(data)
      queryClient.invalidateQueries({ queryKey: ['accounting-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-locked-funds'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-total-locked-balance'] })
      queryClient.invalidateQueries({ queryKey: ['accounting-history'] })
    },
    onError: (error) => {
      options.onError?.(error as Error)
    },
  })

  const transfer = useCallback(
    async (params: TransferParams) => {
      return transferMutation.mutateAsync(params)
    },
    [transferMutation]
  )

  const transferLocked = useCallback(
    async (params: TransferLockedParams) => {
      return transferLockedMutation.mutateAsync(params)
    },
    [transferLockedMutation]
  )

  const reset = useCallback(() => {
    transferMutation.reset()
    transferLockedMutation.reset()
  }, [transferMutation, transferLockedMutation])

  return {
    transfer,
    transferLocked,
    isPending: transferMutation.isPending || transferLockedMutation.isPending,
    isSuccess: transferMutation.isSuccess || transferLockedMutation.isSuccess,
    error: (transferMutation.error || transferLockedMutation.error) as Error | null,
    reset,
  }
}
