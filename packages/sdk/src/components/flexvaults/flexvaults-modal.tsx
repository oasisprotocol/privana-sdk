'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TokenSelectorModal } from './token-selector-modal'
import { DepositForm } from './deposit-form'
import { WithdrawForm } from './withdraw-form'
import { LockedFundsList } from './locked-funds-list'
import { SUPPORTED_TOKENS, type TokenConfig } from '@/sdk/types/tokens'
import { cn } from '@/lib/utils'

function ModalBody() {
  const [selectedToken, setSelectedToken] = useState<TokenConfig>(SUPPORTED_TOKENS.USDC)
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')

  const handleTokenSelect = (token: TokenConfig) => {
    setSelectedToken(token)
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-4">
          <div className="mb-4 flex gap-1 rounded-lg bg-muted/50 p-0.5">
            <button
              onClick={() => setActiveTab('deposit')}
              className={cn(
                'flex-1 cursor-pointer rounded-md py-1.5 text-xs font-medium transition-colors',
                activeTab === 'deposit'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Deposit
            </button>
            <button
              onClick={() => setActiveTab('withdraw')}
              className={cn(
                'flex-1 cursor-pointer rounded-md py-1.5 text-xs font-medium transition-colors',
                activeTab === 'withdraw'
                  ? 'bg-secondary text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Withdraw
            </button>
          </div>

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

        <div className="mt-4 border-t border-border px-4 py-4">
          <h3 className="mb-3 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Locked Funds
          </h3>
          <LockedFundsList />
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
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 sm:max-w-95">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-sm font-medium text-foreground">Flexvaults</DialogTitle>
        </DialogHeader>
        <ModalBody />
      </DialogContent>
    </Dialog>
  )
}

export function FlexvaultsInlineModal({ className }: { className?: string }) {
  return (
    <div className={cn('flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 shadow-lg sm:max-w-95 w-full', className)}>
      <div className="border-b border-border px-4 py-3">
        <div className="text-sm font-medium text-foreground">Flexvaults</div>
      </div>
      <ModalBody />
    </div>
  )
}
