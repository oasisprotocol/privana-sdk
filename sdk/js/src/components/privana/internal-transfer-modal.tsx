'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { TokenConfig } from '@/sdk/types/tokens'
import type { AllowanceTerm } from '@/sdk/types/allowance'
import { usePrivanaContext } from '@/sdk/context/privana-context'
import { useBalance } from '@/sdk/hooks'
import { Skeleton } from '@/components/ui/skeleton'
import { getTokenIcon } from './token-icons'
import { TokenSelectorView } from './token-selector-view'
import { MODAL_CONTENT_CLASS } from './deposit-modal'
import { PolicyDetails } from './allowance-policy-section'
import { CloseIcon, ChevronLeftIcon, ChevronRightIcon } from './icons'
import { formatTokenAmount, normalizeAmountInput } from '@/sdk/utils/amount-format'

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
}: {
  selectedToken: TokenConfig | undefined
  toAddress: string
  onToAddressChange: (value: string) => void
  amount: string
  onAmountChange: (value: string) => void
  onSelectToken: () => void
}) {
  const { chains, getChainById } = usePrivanaContext()
  const tokenChain = selectedToken ? (getChainById(selectedToken.chainId) ?? chains[0]) : chains[0]

  const { balanceWei, isLoading: isBalanceLoading } = useBalance({
    tokenId: selectedToken?.id,
    enabled: !!selectedToken,
  })
  const formattedBalance = selectedToken
    ? formatTokenAmount(balanceWei, selectedToken).display
    : '0.00'

  return (
    <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      <h2 className="text-foreground text-[28px] leading-8 font-medium">New internal transfer</h2>

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
                <span className="text-muted-foreground text-xs">on {tokenChain?.name ?? '—'}</span>
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
            className="text-foreground placeholder:text-muted-foreground/50 flex-1 bg-transparent text-sm outline-none"
          />
        </div>
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
            className="bg-secondary text-foreground hover:bg-secondary/80 cursor-pointer rounded px-3 py-2.5 text-xs font-semibold transition-colors"
          >
            MAX
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <PolicyDetails permissions={PERKS} />
      </div>

      <button
        type="button"
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors"
      >
        Send
      </button>
    </div>
  )
}

export function InternalTransferModalContent({ onClose }: { onClose?: () => void }) {
  const { serviceName, enabledTokens, defaultToken } = usePrivanaContext()
  const appName = serviceName ?? 'Privana'
  const [view, setView] = useState<InternalTransferModalView>('form')
  const [selectedTokenId, setSelectedTokenId] = useState(defaultToken?.id ?? '')
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')

  const selectedToken = enabledTokens.find((t) => t.id === selectedTokenId) ?? defaultToken

  return (
    <>
      {onClose && (
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
}

export function InternalTransferModal({ open, onClose }: InternalTransferModalProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <DialogContent data-privana showCloseButton={false} className={MODAL_CONTENT_CLASS}>
        <DialogTitle className="sr-only">New internal transfer</DialogTitle>
        <DialogDescription className="sr-only">
          Send funds from your Privana balance to another Privana address.
        </DialogDescription>
        <InternalTransferModalContent onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}
