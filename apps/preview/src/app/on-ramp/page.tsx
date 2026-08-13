'use client'

import { useState } from 'react'
import { MoonPayProvider } from '@moonpay/moonpay-react'
import { ThemeEditor } from '@/components/theme-editor'
import { OnRampPreview } from '@/components/on-ramp-preview'
import { PreviewLayout } from '@/components/preview-layout'
import { TransakOnRampPreview } from '@/components/transak-on-ramp-preview'

const MOONPAY_API_KEY = process.env.NEXT_PUBLIC_MOONPAY_API_KEY?.trim()
type PreviewProvider = 'transak' | 'moonpay'

export default function OnRampPage() {
  const [provider, setProvider] = useState<PreviewProvider>('transak')

  return (
    <div className="flex h-screen">
      <aside className="w-[320px] shrink-0 overflow-hidden border-r border-neutral-200 dark:border-neutral-800">
        <ThemeEditor />
      </aside>
      <main className="flex-1 overflow-hidden">
        <PreviewLayout>
          <div className="border-border bg-card mb-6 flex gap-1 rounded-lg border p-1 text-xs">
            {(['transak', 'moonpay'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={
                  provider === option
                    ? 'bg-primary text-primary-foreground flex-1 rounded px-3 py-2 font-medium'
                    : 'text-muted-foreground hover:text-foreground flex-1 rounded px-3 py-2 font-medium'
                }
                onClick={() => setProvider(option)}
              >
                {option === 'transak' ? 'Transak staging' : 'MoonPay regression'}
              </button>
            ))}
          </div>

          {provider === 'transak' ? (
            <TransakOnRampPreview />
          ) : MOONPAY_API_KEY ? (
            <MoonPayProvider apiKey={MOONPAY_API_KEY} debug>
              <OnRampPreview />
            </MoonPayProvider>
          ) : (
            <div className="border-border bg-card rounded-xl border p-4 text-sm">
              Set <code>NEXT_PUBLIC_MOONPAY_API_KEY</code> to run the MoonPay regression preview.
            </div>
          )}
        </PreviewLayout>
      </main>
    </div>
  )
}
