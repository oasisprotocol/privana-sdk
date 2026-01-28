'use client'

import { useState } from 'react'
import { useAccount, useChainId, useSwitchChain, useReadContract } from 'wagmi'
import { useDeposit } from '@/sdk/hooks'
import type { TokenConfig } from '@/sdk/types/tokens'
import { parseTokenAmount, formatTokenAmount, cn } from '@/lib/utils'
import { getTokenIcon } from './token-icons'
import { SUPPORTED_CHAINS } from '@/sdk/types/chains'
import { erc20Abi } from 'viem'

interface DepositFormProps {
  selectedToken: TokenConfig
  onTokenSelect: () => void
}

export function DepositForm({ selectedToken, onTokenSelect }: DepositFormProps) {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const [amount, setAmount] = useState('')

  const targetChain = SUPPORTED_CHAINS[0]
  const isWrongChain = isConnected && chainId !== targetChain?.id

  const { data: walletBalance } = useReadContract({
    address: selectedToken.contract as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const formattedWalletBalance = walletBalance
    ? formatTokenAmount(walletBalance.toString(), selectedToken.decimals)
    : '0'

  const handleMaxClick = () => {
    if (formattedWalletBalance && parseFloat(formattedWalletBalance) > 0) {
      setAmount(formattedWalletBalance)
      if (quote) reset()
    }
  }

  const hasValidAmount = amount && parseFloat(amount) > 0

  const {
    quote,
    isGettingQuote,
    isSendingTransaction,
    isWaitingForConfirmation,
    isPending,
    error,
    getQuote,
    executeDeposit,
    reset,
  } = useDeposit({
    onIncludeSuccess: () => {
      setAmount('')
      reset()
    },
  })

  const handleGetQuote = async () => {
    if (!amount || !selectedToken) return
    const amountInWei = parseTokenAmount(amount, selectedToken.decimals)
    await getQuote({
      tokenId: selectedToken.id,
      amount: Number(amountInWei),
    })
  }

  const handleDeposit = async () => {
    if (!quote) return
    await executeDeposit()
  }

  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet'
    if (isSwitchingChain) return 'Switching...'
    if (isWrongChain) return `Switch to ${targetChain?.name ?? 'Base Sepolia'}`
    if (isGettingQuote) return 'Getting Quote...'
    if (isSendingTransaction) return 'Confirm in Wallet...'
    if (isWaitingForConfirmation) return 'Confirming...'
    return 'Deposit'
  }

  const handleSubmit = async () => {
    if (isWrongChain && targetChain) {
      switchChain({ chainId: targetChain.id as 84532 })
      return
    }
    if (quote) {
      handleDeposit()
    } else {
      handleGetQuote()
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Token
          </label>
        </div>
        <button
          onClick={onTokenSelect}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2 transition-colors hover:border-zinc-700"
        >
          <div className="flex items-center gap-2">
            {getTokenIcon(selectedToken.symbol, 20)}
            <span className="text-sm font-medium text-zinc-200">{selectedToken.symbol}</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-zinc-500">
            <path
              d="M3 5L6 8L9 5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
            Amount
          </label>
          <span className="text-[10px] text-zinc-500">{formattedWalletBalance}</span>
        </div>
        <div className="relative">
          <input
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9.]/g, '')
              if (value.split('.').length <= 2) {
                setAmount(value)
                if (quote) reset()
              }
            }}
            className={cn(
              'h-10 w-full rounded-lg bg-zinc-800/50 px-3 pr-14 text-sm text-white',
              'border border-zinc-800 placeholder:text-zinc-600',
              'focus:border-zinc-600 focus:outline-none',
              'transition-colors',
              isPending && 'opacity-50'
            )}
            disabled={isPending}
          />
          <button
            onClick={handleMaxClick}
            disabled={isPending}
            className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer px-2 py-0.5 text-[10px] font-medium text-zinc-400 transition-colors hover:text-zinc-200"
          >
            MAX
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
          {error.message.length > 80 ? `${error.message.slice(0, 80)}...` : error.message}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={
          !isConnected || (!isWrongChain && !hasValidAmount) || isPending || isSwitchingChain
        }
        className={cn(
          'w-full cursor-pointer rounded-lg py-2.5 text-sm font-medium transition-colors',
          'bg-zinc-100 text-zinc-900 hover:bg-white',
          'disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600'
        )}
      >
        {getButtonText()}
      </button>
    </div>
  )
}
