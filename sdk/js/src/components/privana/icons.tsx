'use client'

import { cn } from '@/lib/utils'

export function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path
        d="M11.99997 11.99997l-5.99995-5.99995-6.00002-6.00002m6.00002 6.00002l6.00001-6.00002m-12.00003 12.00003l6.00002-6.00001"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ChevronRightIcon() {
  return (
    <svg width="10" height="5" viewBox="0 0 12 6" className="-rotate-90">
      <path
        d="M0 0l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function ChevronLeftIcon() {
  return (
    <svg width="10" height="5" viewBox="0 0 12 6" className="rotate-90">
      <path
        d="M0 0l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function ChevronDownIcon({ collapsed }: { collapsed?: boolean }) {
  return (
    <svg
      width="12"
      height="6"
      viewBox="0 0 12 6"
      className={cn('transition-transform', collapsed && '-rotate-90')}
    >
      <path
        d="M0 0l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}
