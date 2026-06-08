'use client'

import { MoonPayProvider } from '@moonpay/moonpay-react'
import { ThemeEditor } from '@/components/theme-editor'
import { OnRampPreview } from '@/components/on-ramp-preview'
import { PreviewLayout } from '@/components/preview-layout'

const MOONPAY_API_KEY = process.env.NEXT_PUBLIC_MOONPAY_API_KEY?.trim()

export default function OnRampPage() {
  return (
    <div className="flex h-screen">
      <aside className="w-[320px] shrink-0 overflow-hidden border-r border-neutral-200 dark:border-neutral-800">
        <ThemeEditor />
      </aside>
      <main className="flex-1 overflow-hidden">
        <PreviewLayout>
          <MoonPayProvider apiKey={MOONPAY_API_KEY!} debug>
            <OnRampPreview />
          </MoonPayProvider>
        </PreviewLayout>
      </main>
    </div>
  )
}
