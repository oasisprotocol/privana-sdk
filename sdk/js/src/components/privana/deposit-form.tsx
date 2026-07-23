'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { useAccount, useBalance, useReadContract } from 'wagmi'
import { useDeposit } from '@/sdk/hooks'
import type { TokenConfig } from '@/sdk/types/tokens'
import { parseTokenAmount, formatTokenAmount, cn } from '@/lib/utils'
import { getTokenIcon } from './token-icons'
import { ChevronRightIcon } from './icons'
import {
  TransactionProgressView,
  TransactionSuccessView,
  TransactionWarningView,
  TransactionErrorView,
  type Step,
} from './transaction-steps'
import { erc20Abi, zeroAddress } from 'viem'
import { usePrivanaContext } from '@/sdk/context/privana-provider'

interface DepositFormProps {
  selectedToken: TokenConfig
  onTokenSelect: () => void
  onPendingChange?: (isPending: boolean) => void
  onUnsafeToCloseChange?: (isUnsafe: boolean) => void
  onSuccess?: () => void
}

export function DepositForm({
  selectedToken,
  onTokenSelect,
  onPendingChange,
  onUnsafeToCloseChange,
  onSuccess,
}: DepositFormProps) {
  const { isConnected, address } = useAccount()
  const { chains, getChainById } = usePrivanaContext()
  const [amount, setAmount] = useState('')
  const [showSuccess, setShowSuccess] = useState(false)
  const [showTimeout, setShowTimeout] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  const targetChain = getChainById(selectedToken.chainId) ?? chains[0]

  // Read balance from the token's chain directly (uses app RPC, not wallet chain).
  // This lets the form display correct balance without forcing a wallet switch;
  // the wallet switch happens on-demand inside deposit() via ensureCorrectChain.
  // Native and ERC-20 need different wagmi hooks (wagmi v2 dropped `token` from
  // useBalance), so we call both unconditionally and gate via `query.enabled`.
  const isNative = selectedToken.contract === zeroAddress
  const { data: nativeBalanceData } = useBalance({
    address,
    chainId: targetChain?.id,
    query: {
      enabled: !!address && isNative,
    },
  })
  const { data: erc20Balance } = useReadContract({
    address: selectedToken.contract as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: targetChain?.id,
    query: {
      enabled: !!address && !isNative,
    },
  })
  const walletBalance = isNative ? nativeBalanceData?.value : erc20Balance

  const formattedWalletBalance = walletBalance
    ? formatTokenAmount(walletBalance.toString(), selectedToken.decimals)
    : '0.00'

  const handleMaxClick = () => {
    if (formattedWalletBalance && parseFloat(formattedWalletBalance) > 0) {
      setAmount(formattedWalletBalance.replace(/[\s\u2009]/g, ''))
    }
  }

  const hasValidAmount = amount && parseFloat(amount) > 0
  const tooManyDecimals =
    hasValidAmount && amount.includes('.') && amount.split('.')[1].length > selectedToken.decimals
  const exceedsBalance =
    hasValidAmount &&
    !tooManyDecimals &&
    walletBalance != null &&
    parseTokenAmount(amount, selectedToken.decimals) > walletBalance

  const {
    txHash,
    isGettingAddress,
    isSwitchingChain,
    isSendingTransaction,
    isWaitingForConfirmation,
    isWaitingForProcessing,
    verificationFailed,
    isPending,
    error,
    deposit,
    retryVerification,
    reset,
  } = useDeposit({
    onCredited: () => {
      setAmount('')
      if (onSuccess) {
        reset()
        onSuccess()
      } else {
        setShowSuccess(true)
      }
    },
    onCheckTimeout: () => {
      setAmount('')
      setShowTimeout(true)
    },
  })

  const depositSteps: Step[] = [
    {
      label: 'Getting deposit address',
      status: isGettingAddress
        ? 'active'
        : isSwitchingChain ||
            isSendingTransaction ||
            isWaitingForConfirmation ||
            isWaitingForProcessing
          ? 'completed'
          : 'pending',
    },
    {
      label: `Switching to ${targetChain?.name ?? 'deposit chain'}`,
      status: isSwitchingChain
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
      label: 'Verifying deposit — may take up to a few minutes',
      status: isWaitingForProcessing ? 'active' : 'pending',
    },
  ]

  useEffect(() => {
    // Post-transfer verification errors are surfaced via the dedicated
    // TransactionErrorView below, so skip the toast for those.
    if (error && !verificationFailed) {
      toast.error(error.message.length > 100 ? `${error.message.slice(0, 100)}...` : error.message)
    }
  }, [error, verificationFailed])

  useEffect(() => {
    onPendingChange?.(isPending && !cancelled)
  }, [isPending, cancelled, onPendingChange])

  useEffect(() => {
    onUnsafeToCloseChange?.((isGettingAddress || isSendingTransaction) && !cancelled)
  }, [isGettingAddress, isSendingTransaction, cancelled, onUnsafeToCloseChange])

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

  const handleDismissVerificationError = () => {
    setAmount('')
    setCancelled(false)
    reset()
  }

  const handleRetryVerification = () => {
    retryVerification().catch(() => {
      // Errors are already surfaced via the hook's error state and onError callback.
    })
  }

  const explorerTxUrl =
    txHash && targetChain?.explorerUrl ? `${targetChain.explorerUrl}/tx/${txHash}` : undefined

  const handleSubmit = async () => {
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
    if (isSwitchingChain) return 'Switching…'
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

  if (verificationFailed) {
    const baseMessage =
      'Your transfer was sent on-chain but we could not verify the deposit. The funds are already at the deposit address. Retry verification instead of starting a new deposit.'
    const detail = error?.message
    const message = detail ? `${baseMessage} (${detail})` : baseMessage
    return (
      <TransactionErrorView
        title="Verification failed"
        message={message}
        explorerUrl={explorerTxUrl}
        explorerLabel="View transaction"
        onRetry={handleRetryVerification}
        onDismiss={handleDismissVerificationError}
      />
    )
  }

  if (isPending && !cancelled) {
    // Only allow cancel before transaction is confirmed (during address fetch/wallet signing)
    const canCancel = isGettingAddress || isSendingTransaction
    return (
      <TransactionProgressView
        title="Depositing…"
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
        onClick={handleSubmit}
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
