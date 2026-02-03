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

function ChevronRight() {
  return (
    <svg width="10" height="5" viewBox="0 0 12 6" className="-rotate-90">
      <path
        d="M0 0l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
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
    <div className="flex w-full flex-col gap-6">
      <div className="flex w-full flex-col gap-3">
        <label className="text-sm text-muted-foreground">Token</label>
        <button
          onClick={onTokenSelect}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-border bg-input p-3"
        >
          <div className="h-8 w-8 flex-shrink-0 overflow-hidden rounded-full">
            {getTokenIcon(selectedToken.symbol, 32)}
          </div>
          <div className="flex flex-1 flex-col items-start gap-1">
            <span className="text-sm font-medium text-foreground">{selectedToken.symbol}</span>
            <span className="text-xs text-muted-foreground">
              on {targetChain?.name ?? 'Base Sepolia'}
            </span>
          </div>
          <div className="flex h-5 w-5 items-center justify-center text-muted-foreground">
            <ChevronRight />
          </div>
        </button>
      </div>

      <div className="flex w-full flex-col gap-3">
        <label className="text-sm text-muted-foreground">Amount</label>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-input py-1 pr-1 pl-3">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Enter Amount"
            value={amount}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9.]/g, '')
              if (value.split('.').length <= 2) {
                setAmount(value)
              }
            }}
            className={cn(
              'flex-1 bg-transparent text-sm text-foreground outline-none',
              'placeholder:text-muted-foreground/50',
              isPending && 'opacity-50'
            )}
            disabled={isPending}
          />
          <button
            onClick={handleMaxClick}
            disabled={isPending}
            className="cursor-pointer rounded bg-secondary px-3 py-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-secondary/80"
          >
            MAX
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
          {error.message.length > 80 ? `${error.message.slice(0, 80)}...` : error.message}
        </div>
      )}

      <button
        onClick={handleWithdraw}
        disabled={
          !isConnected || (!isWrongChain && !hasValidAmount) || isPending || isSwitchingChain
        }
        className={cn(
          'flex h-10 w-full cursor-pointer items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {getButtonText()}
      </button>
    </div>
  )
}
