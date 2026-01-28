'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { FlexvaultsButton } from '@oasisprotocol/flexvaults-sdk'
import { ThemeToggle } from '@/components/theme-toggle'

export default function Home() {
  const { isConnected } = useAccount()

  return (
    <main className="flex min-h-screen flex-col bg-background">
      <header className="px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-sm text-muted-foreground">
            @oasisprotocol/flexvaults-sdk{' '}
            <span className="font-semibold text-foreground">Demo</span>
          </span>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center">
        {isConnected ? (
          <FlexvaultsButton />
        ) : (
          <p className="text-sm text-muted-foreground">Connect wallet to continue</p>
        )}
      </div>
    </main>
  )
}
