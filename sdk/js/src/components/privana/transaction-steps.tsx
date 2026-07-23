'use client'

export interface Step {
  label: string
  status: 'pending' | 'active' | 'completed'
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
      <path
        d="M2.5 6l2.5 2.5 4.5-4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M3.5 1.5h7v7M10.5 1.5L1.5 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className="animate-spin">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="2" opacity="0.15" />
      <path d="M10 2a8 8 0 016.93 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

interface TransactionProgressViewProps {
  title: string
  steps: Step[]
  onCancel?: () => void
}

export function TransactionProgressView({ title, steps, onCancel }: TransactionProgressViewProps) {
  const completed = steps.filter((s) => s.status === 'completed').length
  const active = steps.find((s) => s.status === 'active')
  const total = steps.length
  const progress = ((completed + (active ? 0.5 : 0)) / total) * 100

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="text-primary">
          <Spinner size={20} />
        </div>
        <span className="text-foreground text-sm font-medium">{active?.label ?? title}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="bg-secondary h-1.5 w-full overflow-hidden rounded-full">
          <div
            className="bg-primary h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-muted-foreground text-xs">
          Step {Math.max(1, completed + (active ? 1 : 0))} of {total}
        </span>
      </div>

      {onCancel && (
        <button
          onClick={onCancel}
          className="border-border text-foreground hover:bg-secondary flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      )}
    </div>
  )
}

interface TransactionSuccessViewProps {
  title: string
  message: string
  explorerUrl?: string
  explorerLabel?: string
  onDone: () => void
}

export function TransactionSuccessView({
  title,
  message,
  explorerUrl,
  explorerLabel,
  onDone,
}: TransactionSuccessViewProps) {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
          <CheckIcon />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground text-sm font-medium">{title}</span>
          <span className="text-muted-foreground text-xs">{message}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border text-foreground hover:bg-secondary flex h-10 flex-1 items-center justify-center gap-1.5 rounded-[10px] border text-sm transition-colors"
          >
            {explorerLabel ?? 'View on Explorer'}
            <ExternalLinkIcon />
          </a>
        )}
        <button
          onClick={onDone}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )
}

function WarningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M7 5v2.5M7 10h.005M6.13 2.5h1.74L13 11.5H1L6.13 2.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

interface TransactionWarningViewProps {
  title: string
  message: string
  onDone: () => void
  actionLabel?: string
  pendingLabel?: string
  isPending?: boolean
  onDismiss?: () => void
  dismissLabel?: string
}

export function TransactionWarningView({
  title,
  message,
  onDone,
  actionLabel = 'Done',
  pendingLabel = actionLabel,
  isPending = false,
  onDismiss,
  dismissLabel = 'Dismiss',
}: TransactionWarningViewProps) {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
          <WarningIcon />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground text-sm font-medium">{title}</span>
          <span className="text-muted-foreground text-xs">{message}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {onDismiss && (
          <button
            onClick={onDismiss}
            disabled={isPending}
            className="border-border text-foreground hover:bg-secondary flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dismissLabel}
          </button>
        )}
        <button
          onClick={onDone}
          disabled={isPending}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? pendingLabel : actionLabel}
        </button>
      </div>
    </div>
  )
}

interface TransactionErrorViewProps {
  title: string
  message: string
  explorerUrl?: string
  explorerLabel?: string
  onRetry: () => void
  onDismiss?: () => void
  isRetrying?: boolean
  /** Label for the retry button. Defaults to "Retry Verification". */
  retryLabel?: string
  /** Label for the secondary button. Defaults to "Close". */
  dismissLabel?: string
}

export function TransactionErrorView({
  title,
  message,
  explorerUrl,
  explorerLabel,
  onRetry,
  onDismiss,
  isRetrying,
  retryLabel = 'Retry Verification',
  dismissLabel = 'Close',
}: TransactionErrorViewProps) {
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-400">
          <WarningIcon />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-foreground text-sm font-medium">{title}</span>
          <span className="text-muted-foreground text-xs">{message}</span>
        </div>
      </div>

      {explorerUrl && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="border-border text-foreground hover:bg-secondary flex h-10 w-full items-center justify-center gap-1.5 rounded-[10px] border text-sm transition-colors"
        >
          {explorerLabel ?? 'View on Explorer'}
          <ExternalLinkIcon />
        </a>
      )}

      <div className="flex gap-2">
        {onDismiss && (
          <button
            onClick={onDismiss}
            disabled={isRetrying}
            className="border-border text-foreground hover:bg-secondary flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dismissLabel}
          </button>
        )}
        <button
          onClick={onRetry}
          disabled={isRetrying}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isRetrying ? 'Retrying…' : retryLabel}
        </button>
      </div>
    </div>
  )
}
