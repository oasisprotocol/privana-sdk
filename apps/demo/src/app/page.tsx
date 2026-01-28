'use client'

import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount } from 'wagmi'
import { FlexvaultsButton } from '@oasisprotocol/flexvaults-sdk'

export default function Home() {
  const { isConnected } = useAccount()

  return (
    <main className="flex min-h-screen flex-col bg-[#111113]">
      <header className="px-6 py-4">
        <div className="mx-auto flex max-w-screen-lg items-center justify-between">
          <span className="text-sm text-zinc-600">
            @oasisprotocol/flexvaults-sdk <span className="font-semibold text-zinc-400">Demo</span>
          </span>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center">
        {isConnected ? (
          <FlexvaultsButton />
        ) : (
          <p className="text-sm text-zinc-600">Connect wallet to continue</p>
        )}
      </div>
    </main>
  )
}
