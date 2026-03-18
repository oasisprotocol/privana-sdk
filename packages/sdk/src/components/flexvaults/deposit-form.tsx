'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useAccount, useChainId, useSwitchChain, useReadContract } from 'wagmi'
import { useDeposit } from '@/sdk/hooks'
import type { TokenConfig } from '@/sdk/types/tokens'
import { parseTokenAmount, formatTokenAmount, cn } from '@/lib/utils'
import { getTokenIcon, ChevronRightIcon } from './token-icons'
import {
  TransactionProgressView,
  TransactionSuccessView,
  TransactionWarningView,
  type Step,
} from './transaction-steps'
import { SUPPORTED_CHAINS } from '@/sdk/types/chains'
import { erc20Abi } from 'viem'

interface DepositFormProps {
  selectedToken: TokenConfig
  onTokenSelect: () => void
  onPendingChange?: (isPending: boolean) => void
  onSuccess?: () => void
}

export function DepositForm({
  selectedToken,
  onTokenSelect,
  onPendingChange,
  onSuccess,
}: DepositFormProps) {
  const { isConnected, address } = useAccount()
  const chainId = useChainId()
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain()
  const [amount, setAmount] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [showTimeout, setShowTimeout] = useState(false)
  const [cancelled, setCancelled] = useState(false)

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
    }
  }

  const hasValidAmount = amount && parseFloat(amount) > 0
  const exceedsBalance =
    hasValidAmount &&
    walletBalance != null &&
    parseTokenAmount(amount, selectedToken.decimals) > walletBalance

  const {
    isGettingQuote,
    isSendingTransaction,
    isWaitingForConfirmation,
    isWaitingForProcessing,
    isPending,
    error,
    deposit,
    reset,
  } = useDeposit({
    onIncludeSuccess: () => {
      setAmount('')
      if (onSuccess) {
        reset()
        onSuccess()
      } else {
        setShowSuccess(true)
      }
    },
    onIncludeTimeout: () => {
      setAmount('')
      setShowTimeout(true)
    },
  })

  const depositSteps: Step[] = [
    {
      label: 'Getting quote',
      status: isGettingQuote
        ? 'active'
        : isSendingTransaction || isWaitingForConfirmation || isWaitingForProcessing
          ? 'completed'
          : 'pending',
    },
    {
      label: 'Confirm in wallet',
      status: isSendingTransaction
        ? 'active'
        : isWaitingForConfirmation || isWaitingForProcessing
          ? 'completed'
          : 'pending',
    },
    {
      label: 'Confirming transaction',
      status: isWaitingForConfirmation
        ? 'active'
        : isWaitingForProcessing
          ? 'completed'
          : 'pending',
    },
    {
      label: 'Processing deposit — may take up to a minute',
      status: isWaitingForProcessing ? 'active' : 'pending',
    },
  ]

  useEffect(() => {
    if (error) {
      toast.error(error.message.length > 100 ? `${error.message.slice(0, 100)}...` : error.message)
    }
  }, [error])

  useEffect(() => {
    onPendingChange?.(isPending && !cancelled)
  }, [isPending, cancelled, onPendingChange])

  const handleCancel = () => {
    setCancelled(true)
    reset()
  }

  const handleDone = () => {
    setShowSuccess(false)
    setShowTimeout(false)
    setCancelled(false)
    reset()
  }

  const handleSubmit = async () => {
    if (isWrongChain && targetChain) {
      switchChain({ chainId: targetChain.id })
      return
    }
    if (!amount || !selectedToken || exceedsBalance) return
    setCancelled(false)
    const amountInWei = parseTokenAmount(amount, selectedToken.decimals)
    await deposit({
      tokenId: selectedToken.id,
      amount: amountInWei,
    })
  }

  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet'
    if (isSwitchingChain) return 'Switching...'
    if (isWrongChain) return `Switch to ${targetChain?.name ?? 'Base Sepolia'}`
    return 'Deposit'
  }

  if (showSuccess) {
    return (
      <TransactionSuccessView
        title="Deposit Successful"
        message={`Your ${selectedToken.symbol} deposit has been processed.`}
        onDone={handleDone}
      />
    )
  }

  if (showTimeout) {
    return (
      <TransactionWarningView
        title="Deposit Processing"
        message={`Your transaction was confirmed but the deposit is still being processed. Please check your balance - it should update shortly.`}
        onDone={handleDone}
      />
    )
  }

  if (isPending && !cancelled) {
    // Only allow cancel before transaction is confirmed (during quote/wallet signing)
    const canCancel = isGettingQuote || isSendingTransaction
    return (
      <TransactionProgressView
        title="Depositing..."
        steps={depositSteps}
        onCancel={canCancel ? handleCancel : undefined}
      />
    )
  }

  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex w-full flex-col gap-3">
        <label className="text-muted-foreground text-sm">Token</label>
        <button
          onClick={onTokenSelect}
          className="border-border bg-input flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3"
        >
          <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
            {getTokenIcon(selectedToken.symbol, 32)}
          </div>
          <div className="flex flex-1 flex-col items-start gap-1">
            <span className="text-foreground text-sm font-medium">{selectedToken.symbol}</span>
            <span className="text-muted-foreground text-xs">
              on {targetChain?.name ?? 'Base Sepolia'}
            </span>
          </div>
          <div className="text-muted-foreground flex h-5 w-5 items-center justify-center">
            <ChevronRightIcon />
          </div>
        </button>
      </div>

      <div className="flex w-full flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-muted-foreground text-sm">Amount</label>
          <span className="text-muted-foreground text-sm">
            {formattedWalletBalance} {selectedToken.symbol}
          </span>
        </div>
        <div className="border-border bg-input flex items-center gap-2 rounded-[10px] border py-1 pr-1 pl-3">
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
              'text-foreground flex-1 bg-transparent text-sm outline-none',
              'placeholder:text-muted-foreground/50'
            )}
          />
          <button
            onClick={handleMaxClick}
            className="bg-secondary text-foreground hover:bg-secondary/80 cursor-pointer rounded px-3 py-2.5 text-xs font-semibold transition-colors"
          >
            MAX
          </button>
        </div>
        {exceedsBalance && <p className="text-destructive text-sm">Insufficient balance</p>}
      </div>

      <button
        onClick={handleSubmit}
        disabled={
          !isConnected || (!isWrongChain && !hasValidAmount) || !!exceedsBalance || isSwitchingChain
        }
        className={cn(
          'flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'disabled:cursor-not-allowed disabled:opacity-50'
        )}
      >
        {getButtonText()}
      </button>
    </div>
  )
}
