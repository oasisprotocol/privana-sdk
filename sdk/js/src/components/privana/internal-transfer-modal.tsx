'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { getAddress } from 'viem'
import { useAccount } from 'wagmi'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { TokenConfig } from '@/sdk/types/tokens'
import type { SystemAddress } from '@/sdk/types'
import type { AllowanceTerm } from '@/sdk/types/allowance'
import { usePrivanaContext } from '@/sdk/context/privana-context'
import { useBalance, useTransfer } from '@/sdk/hooks'
import { cn, shortenAddress } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { TokenSelectorView } from './token-selector-view'
import { TokenSelectField } from './token-select-field'
import { MODAL_CONTENT_CLASS } from './deposit-modal'
import { PolicyDetails } from './allowance-policy-section'
import { CloseIcon, ChevronLeftIcon } from './icons'
import { TransactionProgressView, TransactionSuccessView } from './transaction-steps'
import { InternalTransferReview } from './internal-transfer-review'
import {
  formatTokenAmount,
  maxAmount,
  normalizeAmountInput,
  parseAmountInput,
} from '@/sdk/utils/amount-format'
import {
  transferAmountError,
  transferErrorMessage,
  transferRecipientError,
  withBuiltInSystemAddresses,
} from '@/sdk/utils/transfer'

type InternalTransferModalView = 'form' | 'select-token'

const PERKS: AllowanceTerm[] = [
  { title: 'No fee', description: 'Internal transfers are free.' },
  { title: 'Arrives instantly', description: 'The recipient can use the funds right away.' },
  { title: 'No gas', description: 'You only sign. Privana pays the network fee.' },
]

function InternalTransferView({
  selectedToken,
  toAddress,
  onToAddressChange,
  amount,
  onAmountChange,
  onSelectToken,
  onCloseBlockedChange,
  onTransferSuccess,
  systemAddresses,
}: {
  selectedToken: TokenConfig | undefined
  toAddress: string
  onToAddressChange: (value: string) => void
  amount: string
  onAmountChange: (value: string) => void
  onSelectToken: () => void
  onCloseBlockedChange?: (blocked: boolean) => void
  onTransferSuccess?: () => void
  systemAddresses?: SystemAddress[]
}) {
  const { chains, getChainById, networkConfig } = usePrivanaContext()
  const { isConnected, address } = useAccount()
  const tokenChain = selectedToken ? (getChainById(selectedToken.chainId) ?? chains[0]) : chains[0]
  const [toTouched, setToTouched] = useState(false)

  const {
    balanceWei,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
  } = useBalance({
    tokenId: selectedToken?.id,
    enabled: !!selectedToken,
  })
  const formattedBalance = selectedToken
    ? formatTokenAmount(balanceWei, selectedToken).display
    : '0.00'
  const available =
    selectedToken && !isBalanceLoading && !isBalanceError ? BigInt(balanceWei) : undefined

  const to = toAddress.trim()
  const recipientError = transferRecipientError(
    toAddress,
    address,
    withBuiltInSystemAddresses(networkConfig.accountingContract, systemAddresses)
  )
  const showRecipientError = !!recipientError && (toTouched || to.length >= 42)
  const amountError = selectedToken
    ? transferAmountError(amount, selectedToken, available)
    : undefined
  const parsedAmount = selectedToken ? parseAmountInput(amount, selectedToken) : null
  const amountRaw = parsedAmount?.ok ? parsedAmount.raw : null

  const [reviewing, setReviewing] = useState(false)

  const canSend =
    isConnected &&
    !!selectedToken &&
    to !== '' &&
    !recipientError &&
    amount.trim() !== '' &&
    !amountError &&
    available !== undefined

  const [sending, setSending] = useState<{ amount: string; symbol: string; to: string } | null>(
    null
  )
  const { transfer, step, reset } = useTransfer({
    onError: (error) => {
      const message = transferErrorMessage(error)
      toast.error(message.length > 100 ? `${message.slice(0, 100)}...` : message)
    },
  })
  const isSending = step === 'signing' || step === 'submitting'

  useEffect(() => {
    onCloseBlockedChange?.(isSending)
  }, [isSending, onCloseBlockedChange])

  const handleMax = () => {
    if (!selectedToken) return
    const wei = BigInt(balanceWei)
    if (wei > 0n) onAmountChange(maxAmount(wei, selectedToken).input)
  }

  const finish = () => {
    reset()
    setSending(null)
    setReviewing(false)
    setToTouched(false)
    onToAddressChange('')
    onAmountChange('')
  }

  const handleSend = async () => {
    if (!canSend || !selectedToken || amountRaw == null) return
    setSending({
      amount: formatTokenAmount(amountRaw, selectedToken).display,
      symbol: selectedToken.symbol,
      to,
    })
    try {
      await transfer({ toAddress: getAddress(to), tokenId: selectedToken.id, amount: amountRaw })
    } catch {
      return
    }
    if (onTransferSuccess) {
      finish()
      onTransferSuccess()
    }
  }

  if (step === 'done' && sending) {
    return (
      <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
        <TransactionSuccessView
          title="Transfer sent"
          message={`${sending.amount} ${sending.symbol} is now in the Privana balance of ${shortenAddress(sending.to)}.`}
          onDone={finish}
        />
      </div>
    )
  }

  if (isSending) {
    return (
      <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
        <TransactionProgressView
          title="Sending..."
          steps={[
            { label: 'Sign in wallet', status: step === 'signing' ? 'active' : 'completed' },
            { label: 'Sending transfer', status: step === 'submitting' ? 'active' : 'pending' },
          ]}
        />
      </div>
    )
  }

  if (reviewing && selectedToken && amountRaw != null && !recipientError) {
    return (
      <InternalTransferReview
        token={selectedToken}
        amount={amountRaw}
        toAddress={getAddress(to)}
        chainName={tokenChain?.name}
        amountError={amountError}
        confirmDisabled={!canSend}
        onBack={() => setReviewing(false)}
        onConfirm={handleSend}
      />
    )
  }

  return (
    <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      <h2 className="text-foreground text-[28px] leading-8 font-medium">New internal transfer</h2>

      <TokenSelectField
        token={selectedToken}
        chainName={tokenChain?.name}
        onClick={onSelectToken}
      />

      <div className="flex flex-col gap-3">
        <label htmlFor="privana-transfer-to" className="text-muted-foreground text-sm">
          To
        </label>
        <div className="border-border bg-input flex items-center rounded-[10px] border px-3 py-3">
          <input
            id="privana-transfer-to"
            type="text"
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            value={toAddress}
            onChange={(e) => onToAddressChange(e.target.value)}
            onBlur={() => setToTouched(true)}
            className="text-foreground placeholder:text-muted-foreground/50 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
        {showRecipientError && <p className="text-destructive text-sm">{recipientError}</p>}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label htmlFor="privana-transfer-amount" className="text-muted-foreground text-sm">
            Amount
          </label>
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            Available{' '}
            {isBalanceLoading ? (
              <Skeleton className="h-4 w-16" />
            ) : (
              `${formattedBalance} ${selectedToken?.symbol ?? ''}`
            )}
          </span>
        </div>
        <div className="border-border bg-input flex items-center gap-2 rounded-[10px] border py-1 pr-1 pl-3">
          <input
            id="privana-transfer-amount"
            type="text"
            inputMode="decimal"
            placeholder="Enter Amount"
            value={amount}
            onChange={(e) => {
              const value = normalizeAmountInput(e.target.value)
              if (value != null) onAmountChange(value)
            }}
            className="text-foreground placeholder:text-muted-foreground/50 flex-1 bg-transparent text-sm outline-none"
          />
          <button
            type="button"
            onClick={handleMax}
            disabled={isBalanceLoading}
            className="bg-secondary text-foreground hover:bg-secondary/80 cursor-pointer rounded px-3 py-2.5 text-xs font-semibold transition-colors disabled:cursor-default disabled:opacity-50"
          >
            MAX
          </button>
        </div>
        {amountError && <p className="text-destructive text-sm">{amountError}</p>}
      </div>

      <div className="flex flex-col gap-4">
        <PolicyDetails permissions={PERKS} />
      </div>

      <button
        type="button"
        disabled={!canSend}
        onClick={() => setReviewing(true)}
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {!isConnected ? 'Connect Wallet' : 'Send'}
      </button>
    </div>
  )
}

export function InternalTransferModalContent({
  onClose,
  onCloseBlockedChange,
  onTransferSuccess,
  systemAddresses,
}: {
  onClose?: () => void
  onCloseBlockedChange?: (blocked: boolean) => void
  onTransferSuccess?: () => void
  systemAddresses?: SystemAddress[]
}) {
  const { serviceName, enabledTokens, defaultToken } = usePrivanaContext()
  const appName = serviceName ?? 'Privana'
  const [view, setView] = useState<InternalTransferModalView>('form')
  const [selectedTokenId, setSelectedTokenId] = useState(defaultToken?.id ?? '')
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [closeBlocked, setCloseBlocked] = useState(false)

  const selectedToken = enabledTokens.find((t) => t.id === selectedTokenId) ?? defaultToken

  const handleCloseBlockedChange = useCallback(
    (blocked: boolean) => {
      setCloseBlocked(blocked)
      onCloseBlockedChange?.(blocked)
    },
    [onCloseBlockedChange]
  )

  return (
    <>
      {onClose && (
        <button
          data-privana-close
          onClick={onClose}
          disabled={closeBlocked}
          aria-label="Close"
          className={cn(
            'absolute top-6 right-5 z-20 flex h-5 w-5 items-center justify-center transition-colors',
            closeBlocked
              ? 'text-muted-foreground/40 cursor-not-allowed'
              : 'text-muted-foreground hover:text-foreground cursor-pointer'
          )}
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
          Internal transfer
        </button>
      ) : (
        <div className="flex items-center px-5 py-4">
          <span className="text-foreground text-xl leading-5 font-medium">{appName}</span>
        </div>
      )}

      {view === 'form' && (
        <InternalTransferView
          selectedToken={selectedToken}
          toAddress={toAddress}
          onToAddressChange={setToAddress}
          amount={amount}
          onAmountChange={setAmount}
          onSelectToken={() => setView('select-token')}
          onCloseBlockedChange={handleCloseBlockedChange}
          onTransferSuccess={onTransferSuccess}
          systemAddresses={systemAddresses}
        />
      )}

      {view === 'select-token' && (
        <TokenSelectorView
          selectedTokenId={selectedToken?.id}
          balanceSource="accounting"
          onSelect={(id) => {
            if (id !== selectedToken?.id) setAmount('')
            setSelectedTokenId(id)
            setView('form')
          }}
        />
      )}
    </>
  )
}

export interface InternalTransferModalProps {
  open: boolean
  onClose: () => void
  onTransferSuccess?: () => void
  systemAddresses?: SystemAddress[]
}

export function InternalTransferModal({
  open,
  onClose,
  onTransferSuccess,
  systemAddresses,
}: InternalTransferModalProps) {
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
        className={MODAL_CONTENT_CLASS}
      >
        <DialogTitle className="sr-only">New internal transfer</DialogTitle>
        <DialogDescription className="sr-only">
          Send funds from your Privana balance to another Privana address.
        </DialogDescription>
        <InternalTransferModalContent
          onClose={handleClose}
          onCloseBlockedChange={setIsCloseBlocked}
          onTransferSuccess={onTransferSuccess}
          systemAddresses={systemAddresses}
        />
      </DialogContent>
    </Dialog>
  )
}
