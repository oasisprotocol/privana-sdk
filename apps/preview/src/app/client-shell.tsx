'use client'

import dynamic from 'next/dynamic'
import type { ReactNode } from 'react'
import { Toaster } from 'sonner'

const Providers = dynamic(() => import('@/providers').then((mod) => mod.Providers), {
  ssr: false,
})

export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <Providers network="testnet">
      {children}
      <Toaster
        theme="system"
        position="bottom-right"
        toastOptions={{
          classNames: {
            toast: 'bg-card border-border text-foreground',
          },
        }}
      />
    </Providers>
  )
}
