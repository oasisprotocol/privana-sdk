'use client'

import { useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { TokenSelectorModal } from './token-selector-modal'
import { DepositForm } from './deposit-form'
import { WithdrawForm } from './withdraw-form'
import { LockedFundsList } from './locked-funds-list'
import { SUPPORTED_TOKENS, type TokenConfig } from '@/sdk/types/tokens'
import { useBalance, useLockedFunds } from '@/sdk/hooks'
import { formatTokenAmount, cn } from '@/lib/utils'

type ModalView = 'main' | 'locked-funds'

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path
        d="M11.99997 11.99997l-5.99995-5.99995-6.00002-6.00002m6.00002 6.00002l6.00001-6.00002m-12.00003 12.00003l6.00002-6.00001"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
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

function ChevronLeft() {
  return (
    <svg width="10" height="5" viewBox="0 0 12 6" className="rotate-90">
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

function BalanceCards({
  selectedToken,
  onLockedFundsClick,
}: {
  selectedToken: TokenConfig
  onLockedFundsClick: () => void
}) {
  const { balanceWei, isLoading: balanceLoading } = useBalance({
    tokenId: selectedToken.id,
  })
  const { totalLocked, isLoading: lockedLoading } = useLockedFunds()

  const formattedBalance = formatTokenAmount(balanceWei, selectedToken.decimals)
  const formattedLocked = formatTokenAmount(String(totalLocked), selectedToken.decimals)

  return (
    <div className="flex gap-2">
      <div className="flex flex-1 flex-col gap-2 rounded-lg bg-muted p-5">
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">Balance</span>
          <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-muted-foreground">
            {selectedToken.symbol}
          </span>
        </div>
        <div className="text-xl font-medium text-foreground">
          {balanceLoading ? (
            <span className="inline-block h-6 w-24 animate-pulse rounded bg-secondary" />
          ) : (
            formattedBalance
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 rounded-lg bg-muted p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Locked Funds</span>
            <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-muted-foreground">
              {selectedToken.symbol}
            </span>
          </div>
          <button
            onClick={onLockedFundsClick}
            className="flex h-5 w-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronRight />
          </button>
        </div>
        <div className="text-xl font-medium text-foreground">
          {lockedLoading ? (
            <span className="inline-block h-6 w-20 animate-pulse rounded bg-secondary" />
          ) : (
            formattedLocked
          )}
        </div>
      </div>
    </div>
  )
}

function Tabs({
  activeTab,
  onTabChange,
}: {
  activeTab: 'deposit' | 'withdraw'
  onTabChange: (tab: 'deposit' | 'withdraw') => void
}) {
  return (
    <div className="relative flex overflow-hidden rounded-lg bg-muted p-1">
      <div
        className={cn(
          'absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-md bg-input transition-transform duration-200',
          activeTab === 'withdraw' && 'translate-x-[100%]'
        )}
      />
      <button
        onClick={() => onTabChange('deposit')}
        className={cn(
          'relative z-10 flex-1 cursor-pointer rounded-md px-3 py-2.5 text-sm transition-colors',
          activeTab === 'deposit' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Deposit
      </button>
      <button
        onClick={() => onTabChange('withdraw')}
        className={cn(
          'relative z-10 flex-1 cursor-pointer rounded-md px-3 py-2.5 text-sm transition-colors',
          activeTab === 'withdraw' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Withdraw
      </button>
    </div>
  )
}

function LockedFundsView({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="flex h-5 w-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft />
          </button>
          <span className="text-base font-medium text-foreground">Locked Funds</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-5 w-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col rounded-lg bg-muted p-2">
        <div className="flex-1 overflow-y-auto">
          <LockedFundsList />
        </div>
      </div>
    </>
  )
}

function ModalBody({ onClose }: { onClose?: () => void }) {
  const [selectedToken, setSelectedToken] = useState<TokenConfig>(SUPPORTED_TOKENS.USDC)
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [currentView, setCurrentView] = useState<ModalView>('main')

  const handleTokenSelect = (token: TokenConfig) => {
    setSelectedToken(token)
  }

  if (currentView === 'locked-funds') {
    return <LockedFundsView onBack={() => setCurrentView('main')} onClose={onClose} />
  }

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-base font-medium text-foreground">Flexvaults</span>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-5 w-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <BalanceCards
          selectedToken={selectedToken}
          onLockedFundsClick={() => setCurrentView('locked-funds')}
        />

        <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="rounded-lg bg-muted p-5">
          {activeTab === 'deposit' ? (
            <DepositForm
              selectedToken={selectedToken}
              onTokenSelect={() => setTokenSelectorOpen(true)}
            />
          ) : (
            <WithdrawForm
              selectedToken={selectedToken}
              onTokenSelect={() => setTokenSelectorOpen(true)}
            />
          )}
        </div>
      </div>

      <TokenSelectorModal
        open={tokenSelectorOpen}
        onClose={() => setTokenSelectorOpen(false)}
        onSelect={handleTokenSelect}
        selectedTokenId={selectedToken.id}
      />
    </>
  )
}

interface FlexvaultsModalProps {
  open: boolean
  onClose: () => void
}

export function FlexvaultsModal({ open, onClose }: FlexvaultsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex w-[520px] max-w-[95vw] flex-col gap-2 overflow-hidden rounded-2xl border-0 bg-card p-2"
      >
        <ModalBody onClose={onClose} />
      </DialogContent>
    </Dialog>
  )
}

export function FlexvaultsInlineModal({ className }: { className?: string }) {
  return (
    <div
      data-flexvaults
      className={cn(
        'flex w-[520px] max-w-full flex-col gap-2 rounded-2xl bg-card p-2 shadow-lg',
        className
      )}
    >
      <ModalBody />
    </div>
  )
}
