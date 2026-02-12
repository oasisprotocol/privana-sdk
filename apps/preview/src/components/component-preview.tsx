'use client'

import { useAccount } from 'wagmi'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { FlexvaultsButton, FlexvaultsInlineModal } from '@oasisprotocol/flexvaults-sdk'

export function ComponentPreview() {
  const { isConnected } = useAccount()

  return (
    <div className="bg-background flex h-full flex-col">
      <div className="border-border flex shrink-0 items-center justify-between border-b px-6 py-3">
        <span className="text-muted-foreground text-sm">
          @oasisprotocol/flexvaults-sdk{' '}
          <span className="text-foreground font-semibold">Preview</span>
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
    <span className="text-muted-foreground mb-3 block text-[10px] font-semibold tracking-wider uppercase">
      {children}
    </span>
  )
}
