'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useAccount } from 'wagmi'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { TokenConfig } from '@/sdk/types/tokens'
import { getExplorerAddressUrl, getExplorerLabel } from '@/sdk/types/chains'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { useBalance, useWithdraw } from '@/sdk/hooks'
import type { WithdrawStep } from '@/sdk/hooks'
import { cn, formatTokenAmount, parseTokenAmount } from '@/lib/utils'
import { getTokenIcon } from './token-icons'
import { TokenSelectorView } from './token-selector-view'
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import {
  TransactionProgressView,
  TransactionSuccessView,
  TransactionWarningView,
  type Step,
} from './transaction-steps'

type WithdrawModalView = 'form' | 'select-token'

function WithdrawView({
  selectedToken,
  amount,
  onAmountChange,
  onSelectToken,
  onPendingChange,
}: {
  selectedToken: TokenConfig | undefined
  amount: string
  onAmountChange: (value: string) => void
  onSelectToken: () => void
  onPendingChange?: (pending: boolean) => void
}) {
  const { chains, getChainById } = usePrivanaContext()
  const { isConnected, address } = useAccount()
  const [showSuccess, setShowSuccess] = useState(false)
  const [showTimeout, setShowTimeout] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  const targetChain = selectedToken ? (getChainById(selectedToken.chainId) ?? chains[0]) : chains[0]

  const {
    balanceWei,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
  } = useBalance({
    tokenId: selectedToken?.id,
    enabled: !!selectedToken,
  })

  const formattedBalance = selectedToken
    ? formatTokenAmount(balanceWei, selectedToken.decimals)
    : '0.00'

  const { withdraw, isPending, currentStep, error, reset } = useWithdraw({
    onProcessingSuccess: () => {
      onAmountChange('')
      setShowSuccess(true)
    },
    onProcessingTimeout: () => {
      onAmountChange('')
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
    { label: 'Submitting withdrawal', status: getStepStatus('submitting', ['processing']) },
    { label: 'Processing — may take a minute or two', status: getStepStatus('processing', []) },
  ]

  useEffect(() => {
    if (error) {
      toast.error(error.message.length > 100 ? `${error.message.slice(0, 100)}...` : error.message)
    }
  }, [error])

  useEffect(() => {
    onPendingChange?.(isPending && !cancelled)
  }, [isPending, cancelled, onPendingChange])

  const hasValidAmount = !!amount && parseFloat(amount) > 0
  const tooManyDecimals =
    !!hasValidAmount &&
    !!selectedToken &&
    amount.includes('.') &&
    amount.split('.')[1].length > selectedToken.decimals
  const exceedsBalance =
    !!hasValidAmount &&
    !tooManyDecimals &&
    !!selectedToken &&
    !isBalanceLoading &&
    !isBalanceError &&
    parseTokenAmount(amount, selectedToken.decimals) > BigInt(balanceWei)

  const canWithdraw =
    isConnected && hasValidAmount && !!selectedToken && !tooManyDecimals && !exceedsBalance

  const handleMax = () => {
    if (!selectedToken) return
    const max = formattedBalance.replace(/\s/g, '')
    if (parseFloat(max) > 0) onAmountChange(max)
  }

  const handleWithdraw = async () => {
    if (!selectedToken || !canWithdraw) return
    setCancelled(false)
    await withdraw({
      tokenId: selectedToken.id,
      amount: parseTokenAmount(amount, selectedToken.decimals),
    })
  }

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

  if (showSuccess && selectedToken) {
    return (
      <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
        <TransactionSuccessView
          title="Withdrawal Complete"
          message={`Your ${selectedToken.symbol} withdrawal has been processed. Funds should appear in your wallet shortly.`}
          explorerUrl={explorerUrl}
          explorerLabel={targetChain ? getExplorerLabel(targetChain.id) : undefined}
          onDone={handleDone}
        />
      </div>
    )
  }

  if (showTimeout) {
    return (
      <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
        <TransactionWarningView
          title="Withdrawal Processing"
          message="Your withdrawal is still being processed. Please check your balance — it should update shortly."
          onDone={handleDone}
        />
      </div>
    )
  }

  if (isPending && !cancelled) {
    const canCancel =
      currentStep === 'idle' || currentStep === 'switching-chain' || currentStep === 'signing'
    return (
      <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
        <TransactionProgressView
          title="Withdrawing..."
          steps={withdrawSteps}
          onCancel={canCancel ? handleCancel : undefined}
        />
      </div>
    )
  }

  return (
    <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      <h2 className="text-foreground text-[28px] leading-8 font-medium">Withdraw</h2>

      <div className="flex flex-col gap-3">
        <label className="text-muted-foreground text-sm">Token</label>
        <button
          type="button"
          onClick={onSelectToken}
          className="border-border bg-input flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left"
        >
          {selectedToken ? (
            <>
              <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                {getTokenIcon(selectedToken.symbol, 32)}
              </div>
              <div className="flex flex-1 flex-col items-start gap-1">
                <span className="text-foreground text-sm font-medium">{selectedToken.symbol}</span>
                <span className="text-muted-foreground text-xs">on {targetChain?.name ?? '—'}</span>
              </div>
            </>
          ) : (
            <span className="text-muted-foreground flex-1 text-sm">Select token</span>
          )}
          <div className="text-muted-foreground flex h-5 w-5 items-center justify-center">
            <ChevronRightIcon />
          </div>
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-muted-foreground text-sm">Amount</label>
          <span className="text-muted-foreground text-sm">
            Available {formattedBalance} {selectedToken?.symbol}
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
              if (value.split('.').length <= 2) onAmountChange(value)
            }}
            className="text-foreground placeholder:text-muted-foreground/50 flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="button"
            onClick={handleMax}
            className="bg-secondary text-foreground hover:bg-secondary/80 cursor-pointer rounded px-3 py-2.5 text-xs font-semibold transition-colors"
          >
            MAX
          </button>
        </div>
        {tooManyDecimals && selectedToken && (
          <p className="text-destructive text-sm">
            Too many decimal places (max: {selectedToken.decimals})
          </p>
        )}
        {exceedsBalance && <p className="text-destructive text-sm">Insufficient balance</p>}
      </div>

      <button
        type="button"
        disabled={!canWithdraw}
        onClick={handleWithdraw}
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!isConnected ? 'Connect Wallet' : 'Withdraw'}
      </button>
    </div>
  )
}

export function WithdrawModalContent({
  onClose,
  onPendingChange,
  onBack,
}: {
  onClose?: () => void
  onPendingChange?: (pending: boolean) => void
  /** Renders a back chevron on the form view (for embedding, e.g. WalletModal). */
  onBack?: () => void
}) {
  const { serviceName, enabledTokens, defaultToken, hostedAuthConfig } = usePrivanaContext()
  const { address } = useAccount()
  const appName = serviceName ?? 'Privana'
  const [view, setView] = useState<WithdrawModalView>('form')
  const [selectedTokenId, setSelectedTokenId] = useState(defaultToken?.id ?? '')
  const [amount, setAmount] = useState('')
  const [isPending, setIsPending] = useState(false)

  const handlePendingChange = (pending: boolean) => {
    setIsPending(pending)
    onPendingChange?.(pending)
  }

  const selectedToken = enabledTokens.find((t) => t.id === selectedTokenId) ?? defaultToken

  const prevAddressRef = useRef(address)
  useEffect(() => {
    const prev = prevAddressRef.current
    prevAddressRef.current = address
    if (hostedAuthConfig) return
    if (prev && address && prev !== address) {
      setView('form')
      setAmount('')
      setSelectedTokenId('')
    }
  }, [address, hostedAuthConfig])

  return (
    <>
      {onClose && !isPending && (
        <button
          data-privana-close
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground absolute top-6 right-5 z-20 flex h-5 w-5 cursor-pointer items-center justify-center transition-colors"
        >
          <CloseIcon />
        </button>
      )}

      {view === 'select-token' ? (
        <button
          type="button"
          onClick={() => setView('form')}
          className="text-foreground flex w-fit cursor-pointer items-center gap-2 px-5 py-4 text-sm font-medium transition-opacity hover:opacity-70"
        >
          <ChevronLeftIcon />
          Withdraw
        </button>
      ) : onBack && !isPending ? (
        <button
          type="button"
          onClick={onBack}
          className="text-foreground flex w-fit cursor-pointer items-center gap-2 px-5 py-4 text-sm font-medium transition-opacity hover:opacity-70"
        >
          <ChevronLeftIcon />
          {appName}
        </button>
      ) : (
        <div className="flex items-center px-5 py-4">
          <span className="text-foreground text-xl leading-5 font-medium">{appName}</span>
        </div>
      )}

      {view === 'form' && (
        <WithdrawView
          selectedToken={selectedToken}
          amount={amount}
          onAmountChange={setAmount}
          onSelectToken={() => setView('select-token')}
          onPendingChange={handlePendingChange}
        />
      )}

      {view === 'select-token' && (
        <TokenSelectorView
          selectedTokenId={selectedToken?.id}
          onSelect={(id) => {
            setSelectedTokenId(id)
            setView('form')
          }}
        />
      )}
    </>
  )
}

export interface WithdrawModalProps {
  open: boolean
  onClose: () => void
}

export function WithdrawModal({ open, onClose }: WithdrawModalProps) {
  const titleId = useId()
  const descId = useId()
  const [isCloseBlocked, setIsCloseBlocked] = useState(false)

  const handleClose = () => {
    if (!isCloseBlocked) onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose()
      }}
    >
      <DialogContent
        data-privana
        showCloseButton={false}
        onInteractOutside={isCloseBlocked ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={isCloseBlocked ? (e) => e.preventDefault() : undefined}
        className="bg-card flex w-[560px] max-w-[95vw] flex-col gap-2 rounded-2xl border-0 p-2"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <DialogTitle id={titleId} className="sr-only">
          Withdraw
        </DialogTitle>
        <DialogDescription id={descId} className="sr-only">
          Withdraw funds from your account.
        </DialogDescription>
        <WithdrawModalContent onClose={handleClose} onPendingChange={setIsCloseBlocked} />
      </DialogContent>
    </Dialog>
  )
}

export interface WithdrawInlineModalProps {
  className?: string
}

export function WithdrawInlineModal({ className }: WithdrawInlineModalProps) {
  return (
    <div
      data-privana
      className={cn(
        'bg-card relative flex w-[560px] max-w-full flex-col gap-2 overflow-hidden rounded-2xl p-2 shadow-lg',
        className
      )}
    >
      <WithdrawModalContent />
    </div>
  )
}
