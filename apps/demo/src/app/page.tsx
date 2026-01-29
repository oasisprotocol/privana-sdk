'use client'

import { ThemeEditor } from '@/components/theme-editor'
import { ComponentPreview } from '@/components/component-preview'

export default function Home() {
  return (
    <div className="flex h-screen">
      <aside className="w-[320px] shrink-0 border-r border-neutral-800 overflow-hidden">
        <ThemeEditor />
      </aside>
      <main className="flex-1 overflow-hidden">
        <ComponentPreview />
      </main>
    </div>
  )
}
