'use client'

import { ThemeEditor } from '@/components/theme-editor'
import { HooksPreview } from '@/components/hooks-preview'
import { PreviewLayout } from '@/components/preview-layout'

export default function HooksPage() {
  return (
    <div className="flex h-screen">
      <aside className="w-[320px] shrink-0 overflow-hidden border-r border-neutral-200 dark:border-neutral-800">
        <ThemeEditor />
      </aside>
      <main className="flex-1 overflow-hidden">
        <PreviewLayout>
          <HooksPreview />
        </PreviewLayout>
      </main>
    </div>
  )
}
