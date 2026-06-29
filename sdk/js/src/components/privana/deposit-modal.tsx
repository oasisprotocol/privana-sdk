'use client'

import { useId, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { cn } from '@/lib/utils'

type DepositMethodTab = 'crypto' | 'credit-card'

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

function MethodTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: DepositMethodTab
  onTabChange: (tab: DepositMethodTab) => void
}) {
  return (
    <div className="bg-muted relative flex gap-2 overflow-hidden rounded-[10px] p-1">
      <div
        className={cn(
          'bg-input absolute top-1 bottom-1 left-1 w-[calc(50%-8px)] rounded-md transition-transform duration-200',
          activeTab === 'credit-card' && 'translate-x-[calc(100%+8px)]'
        )}
      />
      <button
        type="button"
        onClick={() => onTabChange('crypto')}
        className={cn(
          'relative z-10 flex-1 cursor-pointer rounded-md px-3 py-[9px] text-sm font-medium transition-colors',
          activeTab === 'crypto' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Crypto
      </button>
      <button
        type="button"
        onClick={() => onTabChange('credit-card')}
        className={cn(
          'relative z-10 flex-1 cursor-pointer rounded-md px-3 py-[9px] text-sm font-medium transition-colors',
          activeTab === 'credit-card' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Credit Card
      </button>
    </div>
  )
}

function MethodOption({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-background hover:bg-background/70 border-border flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-foreground text-sm leading-[14px] font-medium">{title}</span>
        <span className="text-muted-foreground text-xs leading-3">{description}</span>
      </div>
      <div className="text-muted-foreground flex h-5 w-5 items-center justify-center">
        <ChevronRight />
      </div>
    </button>
  )
}

export interface DepositModalProps {
  open: boolean
  onClose: () => void
  defaultTab?: DepositMethodTab
  onSelectConnectedWallet?: () => void
  onSelectExternalWallet?: () => void
  onSelectCreditCard?: () => void
}

export function DepositModal({
  open,
  onClose,
  defaultTab = 'crypto',
  onSelectConnectedWallet,
  onSelectExternalWallet,
  onSelectCreditCard,
}: DepositModalProps) {
  const { serviceName } = usePrivanaContext()
  const appName = serviceName ?? 'Privana'
  const [activeTab, setActiveTab] = useState<DepositMethodTab>(defaultTab)
  const titleId = useId()
  const descId = useId()

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <DialogContent
        data-privana
        showCloseButton={false}
        className="bg-card flex w-[560px] max-w-[95vw] flex-col gap-2 rounded-2xl border-0 p-2"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <button
          data-privana-close
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground absolute top-6 right-5 z-20 flex h-5 w-5 cursor-pointer items-center justify-center transition-colors"
        >
          <CloseIcon />
        </button>

        <DialogHeader>
          <div className="flex items-center px-5 py-4">
            <span className="text-foreground text-xl leading-5 font-medium">{appName}</span>
          </div>
        </DialogHeader>

        <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
          <div className="flex flex-col gap-2">
            <DialogTitle id={titleId} className="text-foreground text-[28px] leading-8 font-medium">
              Choose the deposit method
            </DialogTitle>
            <DialogDescription id={descId} className="text-muted-foreground text-sm">
              Choose the deposit method.
            </DialogDescription>
          </div>

          <MethodTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'crypto' ? (
            <div className="flex flex-col gap-3">
              <MethodOption
                title="Connected wallet"
                description="Deposit from your connected wallet."
                onClick={onSelectConnectedWallet}
              />
              <MethodOption
                title="External Wallet"
                description="Send funds from external wallet or exchange."
                onClick={onSelectExternalWallet}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <MethodOption
                title="Moonpay"
                description="Buy crypto with a card."
                onClick={onSelectCreditCard}
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
