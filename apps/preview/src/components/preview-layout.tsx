'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'

const NAV_ITEMS = [
  { href: '/', label: 'Components' },
  { href: '/hooks', label: 'Hooks' },
  { href: '/on-ramp', label: 'On Ramp' },
]

export function PreviewLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()

  return (
    <div className="bg-background flex h-full flex-col">
      <div className="border-border flex shrink-0 items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-muted-foreground text-sm">
            @oasisprotocol/privana-sdk{' '}
            <span className="text-foreground font-semibold">Preview</span>
          </span>
          <nav className="flex items-center gap-4 text-sm">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl space-y-8 px-6 py-8">{children}</div>
      </div>
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span className="text-muted-foreground mb-3 block text-[10px] font-semibold tracking-wider uppercase">
      {children}
    </span>
  )
}
