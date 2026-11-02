'use client'

import { cn } from '@/lib/utils'
import { ChevronLeftIcon, CloseIcon } from './icons'

export function ModalHeader({ label, onBack }: { label: string; onBack?: () => void }) {
  if (!onBack) {
    return (
      <div className="flex items-center px-5 py-4">
        <span className="text-foreground text-xl leading-5 font-medium">{label}</span>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onBack}
      className="text-foreground flex w-fit cursor-pointer items-center gap-2 px-5 py-4 text-sm font-medium transition-opacity hover:opacity-70"
    >
      <ChevronLeftIcon />
      {label}
    </button>
  )
}

export function ModalCloseButton({
  onClick,
  disabled,
}: {
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      data-privana-close
      onClick={onClick}
      disabled={disabled}
      aria-label="Close"
      className={cn(
        'absolute top-6 right-5 z-20 flex h-5 w-5 items-center justify-center transition-colors',
        disabled
          ? 'text-muted-foreground/40 cursor-not-allowed'
          : 'text-muted-foreground hover:text-foreground cursor-pointer'
      )}
    >
      <CloseIcon />
    </button>
  )
}
