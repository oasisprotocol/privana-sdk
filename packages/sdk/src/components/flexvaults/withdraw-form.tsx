'use client'

import { useState } from 'react'
import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { useWithdraw, useBalance } from '@/sdk/hooks'
import type { TokenConfig } from '@/sdk/types/tokens'
import { parseTokenAmount, formatTokenAmount, cn } from '@/lib/utils'
import { getTokenIcon } from './token-icons'
import { SUPPORTED_CHAINS } from '@/sdk/types/chains'

interface WithdrawFormProps {
  selectedToken: TokenConfig
  onTokenSelect: () => void
}

export function WithdrawForm({ selectedToken, onTokenSelect }: WithdrawFormProps) {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const [amount, setAmount] = useState('')

  const targetChain = SUPPORTED_CHAINS[0]
  const isWrongChain = isConnected && chainId !== targetChain?.id

  const { balanceWei } = useBalance({
    tokenId: selectedToken.id,
  })

  const formattedBalance = formatTokenAmount(balanceWei, selectedToken.decimals)

  const { withdraw, isPending, error, reset } = useWithdraw({
    onSuccess: () => {
      setAmount('')
      reset()
    },
  })

  const handleWithdraw = async () => {
    if (isWrongChain && targetChain) {
      switchChain({ chainId: targetChain.id as 84532 })
      return
    }
    if (!amount || !selectedToken) return
    const amountInWei = parseTokenAmount(amount, selectedToken.decimals)
    await withdraw({
      tokenId: selectedToken.id,
      amount: amountInWei,
    })
  }

  const handleMaxClick = () => {
    if (formattedBalance && parseFloat(formattedBalance) > 0) {
      setAmount(formattedBalance)
    }
  }

  const hasValidAmount = amount && parseFloat(amount) > 0

  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet'
    if (isSwitchingChain) return 'Switching...'
    if (isWrongChain) return `Switch to ${targetChain?.name ?? 'Base Sepolia'}`
    if (isPending) return 'Processing...'
    return 'Withdraw'
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Token
          </label>
        </div>
        <button
          onClick={onTokenSelect}
          className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-border bg-muted/50 px-3 py-2 transition-colors hover:border-ring"
        >
          <div className="flex items-center gap-2">
            {getTokenIcon(selectedToken.symbol, 20)}
            <span className="text-sm font-medium text-foreground">{selectedToken.symbol}</span>
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-muted-foreground">
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
          <label className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Amount
          </label>
          <span className="text-[10px] text-muted-foreground">{formattedBalance}</span>
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
              }
            }}
            className={cn(
              'h-10 w-full rounded-lg bg-muted/50 px-3 pr-14 text-sm text-foreground',
              'border border-border placeholder:text-muted-foreground',
              'focus:border-ring focus:outline-none',
              'transition-colors',
              isPending && 'opacity-50'
            )}
            disabled={isPending}
          />
          <button
            onClick={handleMaxClick}
            disabled={isPending}
            className="absolute top-1/2 right-2 -translate-y-1/2 cursor-pointer px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            MAX
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error.message.length > 80 ? `${error.message.slice(0, 80)}...` : error.message}
        </div>
      )}

      <button
        onClick={handleWithdraw}
        disabled={
          !isConnected || (!isWrongChain && !hasValidAmount) || isPending || isSwitchingChain
        }
        className={cn(
          'w-full cursor-pointer rounded-lg py-2.5 text-sm font-medium transition-colors',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground'
        )}
      >
        {getButtonText()}
      </button>
    </div>
  )
}
