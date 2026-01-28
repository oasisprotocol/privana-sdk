'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TokenSelectorModal } from './token-selector-modal'
import { DepositForm } from './deposit-form'
import { WithdrawForm } from './withdraw-form'
import { LockedFundsList } from './locked-funds-list'
// import { RecentActivity } from './recent-activity'
import { SUPPORTED_TOKENS, type TokenConfig } from '@/sdk/types/tokens'
import { cn } from '@/lib/utils'

interface FlexvaultsModalProps {
  open: boolean
  onClose: () => void
}

export function FlexvaultsModal({ open, onClose }: FlexvaultsModalProps) {
  const [selectedToken, setSelectedToken] = useState<TokenConfig>(SUPPORTED_TOKENS.USDC)
  const [tokenSelectorOpen, setTokenSelectorOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')

  const handleTokenSelect = (token: TokenConfig) => {
    setSelectedToken(token)
  }

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 overflow-hidden rounded-xl border border-zinc-800 bg-[#18181b] p-0 sm:max-w-[380px]">
          <DialogHeader className="border-b border-zinc-800 px-4 py-3">
            <DialogTitle className="text-sm font-medium text-zinc-200">Flexvaults</DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto">
            <div className="px-4 pt-4">
              <div className="mb-4 flex gap-1 rounded-lg bg-zinc-800/50 p-0.5">
                <button
                  onClick={() => setActiveTab('deposit')}
                  className={cn(
                    'flex-1 cursor-pointer rounded-md py-1.5 text-xs font-medium transition-colors',
                    activeTab === 'deposit'
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
                  )}
                >
                  Deposit
                </button>
                <button
                  onClick={() => setActiveTab('withdraw')}
                  className={cn(
                    'flex-1 cursor-pointer rounded-md py-1.5 text-xs font-medium transition-colors',
                    activeTab === 'withdraw'
                      ? 'bg-zinc-700 text-white'
                      : 'text-zinc-500 hover:text-zinc-300'
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

            <div className="mt-4 border-t border-zinc-800 px-4 py-4">
              <h3 className="mb-3 text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                Locked Funds
              </h3>
              <LockedFundsList />
            </div>

            {/* <div className="px-4 pb-4">
              <h3 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-3">
                Activity
              </h3>
              <RecentActivity />
            </div> */}
          </div>
        </DialogContent>
      </Dialog>

      <TokenSelectorModal
        open={tokenSelectorOpen}
        onClose={() => setTokenSelectorOpen(false)}
        onSelect={handleTokenSelect}
        selectedTokenId={selectedToken.id}
      />
    </>
  )
}
