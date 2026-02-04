'use client'

import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { FlexvaultsButton, FlexvaultsInlineModal } from '@oasisprotocol/flexvaults-sdk'

export function ComponentPreview() {
  const { isConnected } = useAccount()

  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex items-center justify-between border-b border-border px-6 py-3 shrink-0">
        <span className="text-sm text-muted-foreground">
          @oasisprotocol/flexvaults-sdk{' '}
          <span className="font-semibold text-foreground">Preview</span>
        </span>
        <div className="flex items-center gap-3">
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-8 px-6 py-8">
          {isConnected && (
            <div>
              <SectionLabel>Live SDK Button</SectionLabel>
              <div className="flex items-center justify-center">
                <FlexvaultsButton />
              </div>
            </div>
          )}

          <div>
            <SectionLabel>Live SDK Modal</SectionLabel>
            <div className="flex justify-center">
              <FlexvaultsInlineModal />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-3 block text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </span>
  )
}
