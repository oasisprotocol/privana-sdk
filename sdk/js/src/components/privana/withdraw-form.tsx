'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import { useWithdraw, useBalance } from '@/sdk/hooks'
import type { WithdrawStep } from '@/sdk/hooks'
import type { TokenConfig } from '@/sdk/types/tokens'
import { parseTokenAmount, formatTokenAmount, cn } from '@/lib/utils'
import { getTokenIcon } from './token-icons'
import { ChevronRightIcon } from './icons'
import {
  TransactionProgressView,
  TransactionSuccessView,
  TransactionWarningView,
  type Step,
} from './transaction-steps'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { getExplorerAddressUrl } from '@/sdk/types/chains'

interface WithdrawFormProps {
  selectedToken: TokenConfig
  onTokenSelect: () => void
  onPendingChange?: (isPending: boolean) => void
  onUnsafeToCloseChange?: (isUnsafe: boolean) => void
}

export function WithdrawForm({
  selectedToken,
  onTokenSelect,
  onPendingChange,
  onUnsafeToCloseChange,
}: WithdrawFormProps) {
  const { isConnected, address } = useAccount()
  const { chains, getChainById } = usePrivanaContext()
  const [amount, setAmount] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [showTimeout, setShowTimeout] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  const targetChain = getChainById(selectedToken.chainId) ?? chains[0]

  const {
    balanceWei,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
  } = useBalance({
    tokenId: selectedToken.id,
  })

  const formattedBalance = formatTokenAmount(balanceWei, selectedToken.decimals)

  const { withdraw, isPending, currentStep, error, reset } = useWithdraw({
    onProcessingSuccess: () => {
      setAmount('')
      setShowSuccess(true)
    },
    onProcessingTimeout: () => {
      setAmount('')
      setShowTimeout(true)
    },
  })

  const explorerUrl =
    address && targetChain ? getExplorerAddressUrl(targetChain.id, address) : undefined

  const getStepStatus = (step: WithdrawStep, after: WithdrawStep[]): Step['status'] => {
    if (currentStep === step) return 'active'
    if (after.includes(currentStep)) return 'completed'
    return 'pending'
  }

  const withdrawSteps: Step[] = [
    {
      label: 'Switching to signing chain',
      status: getStepStatus('switching-chain', ['signing', 'submitting', 'processing']),
    },
    { label: 'Sign in wallet', status: getStepStatus('signing', ['submitting', 'processing']) },
    {
      label: 'Submitting withdrawal',
      status: getStepStatus('submitting', ['processing']),
    },
    {
      label: 'Processing — may take a minute or two',
      status: getStepStatus('processing', []),
    },
  ]

  useEffect(() => {
    if (error) {
      toast.error(error.message.length > 100 ? `${error.message.slice(0, 100)}...` : error.message)
    }
  }, [error])

  useEffect(() => {
    const pending = isPending && !cancelled
    onPendingChange?.(pending)
    onUnsafeToCloseChange?.(pending)
  }, [isPending, cancelled, onPendingChange, onUnsafeToCloseChange])

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

  const handleWithdraw = async () => {
    if (!amount || !selectedToken || exceedsBalance) return
    setCancelled(false)
    const amountInWei = parseTokenAmount(amount, selectedToken.decimals)
    await withdraw({
      tokenId: selectedToken.id,
      amount: amountInWei,
    })
  }

  const handleMaxClick = () => {
    if (formattedBalance && parseFloat(formattedBalance) > 0) {
      setAmount(formattedBalance.replace(/[\s\u2009]/g, ''))
    }
  }

  const hasValidAmount = amount && parseFloat(amount) > 0
  const tooManyDecimals =
    hasValidAmount && amount.includes('.') && amount.split('.')[1].length > selectedToken.decimals
  const exceedsBalance =
    hasValidAmount &&
    !tooManyDecimals &&
    !isBalanceLoading &&
    !isBalanceError &&
    parseTokenAmount(amount, selectedToken.decimals) > BigInt(balanceWei)

  const getButtonText = () => {
    if (!isConnected) return 'Connect Wallet'
    return 'Withdraw'
  }

  if (showSuccess) {
    return (
      <TransactionSuccessView
        title="Withdrawal Complete"
        message={`Your ${selectedToken.symbol} withdrawal has been processed. Funds should appear in your wallet shortly.`}
        explorerUrl={explorerUrl}
        explorerLabel="View on BaseScan"
        onDone={handleDone}
      />
    )
  }

  if (showTimeout) {
    return (
      <TransactionWarningView
        title="Withdrawal Processing"
        message={`Your withdrawal is still being processed. Please check your balance — it should update shortly.`}
        onDone={handleDone}
      />
    )
  }

  if (isPending && !cancelled) {
    // Only allow cancel before transaction is submitted (steps 1-2)
    const canCancel =
      currentStep === 'idle' || currentStep === 'switching-chain' || currentStep === 'signing'
    return (
      <TransactionProgressView
        title="Withdrawing..."
        steps={withdrawSteps}
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
            {formattedBalance} {selectedToken.symbol}
          </span>
        </div>
        <div className="border-border bg-input flex items-center gap-2 rounded-[10px] border py-1 pr-1 pl-3">
          <input
            type="text"
            inputMode="decimal"
            placeholder="Enter Amount"
            value={amount}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9.,]/g, '').replace(/,/g, '.')
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
        {tooManyDecimals && (
          <p className="text-destructive text-sm">
            Too many decimal places (max: {selectedToken.decimals})
          </p>
        )}
        {exceedsBalance && <p className="text-destructive text-sm">Insufficient balance</p>}
      </div>

      <button
        onClick={handleWithdraw}
        disabled={
          !isConnected || !hasValidAmount || tooManyDecimals || !!exceedsBalance || isPending
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
