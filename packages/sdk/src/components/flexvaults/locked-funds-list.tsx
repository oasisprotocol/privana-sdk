'use client'

import { toast } from 'sonner'
import { useLockedFunds, useUnlockFunds } from '@/sdk/hooks'
import { formatTokenAmount, formatTimeRemaining, shortenAddress } from '@/lib/utils'
import { getTokenById } from '@/sdk/types/tokens'
import { getTokenIcon } from './token-icons'
import { SUPPORTED_CHAINS } from '@/sdk/types/chains'

function Skeleton() {
  return (
    <div className="flex flex-col">
      {[1, 2].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg p-3">
          <div className="h-10 w-10 rounded-full bg-secondary" />
          <div className="flex-1">
            <div className="mb-2 h-3.5 w-24 rounded bg-secondary" />
            <div className="h-3 w-32 rounded bg-secondary" />
          </div>
          <div className="text-right">
            <div className="mb-2 h-3.5 w-16 rounded bg-secondary" />
            <div className="h-3 w-20 rounded bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function LockedFundsList() {
  const { locks, isLoading } = useLockedFunds()
  const { unlockFunds, unlockAllExpired, isPending } = useUnlockFunds()

  const expiredLocks = locks.filter((lock) => lock.is_expired)
  const chain = SUPPORTED_CHAINS[0]

  if (isLoading) {
    return <Skeleton />
  }

  if (locks.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg p-8">
        <span className="text-sm text-muted-foreground">No locked funds</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col">
        {locks.map((lock, index) => {
          const token = getTokenById(lock.token_id)
          const formattedAmount = formatTokenAmount(String(lock.amount), token?.decimals ?? 18)
          const isHighlighted = lock.is_expired

          return (
            <div
              key={lock.lock_index}
              className={`flex items-center gap-3 rounded-lg p-3 ${isHighlighted ? 'bg-muted' : ''}`}
            >
              <div className="h-10 w-10 flex-shrink-0 overflow-hidden rounded-full bg-secondary">
                {token && getTokenIcon(token.symbol, 40)}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-sm font-medium text-foreground">
                  {formattedAmount} {token?.symbol ?? '?'}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(lock.service_address)
                    toast.success('Address copied')
                  }}
                  className="cursor-pointer self-start text-xs text-muted-foreground transition-colors hover:text-foreground"
                  title="Click to copy"
                >
                  Service: {shortenAddress(lock.service_address)}
                </button>
              </div>

              <div className="flex flex-shrink-0 flex-col items-end gap-2">
                {lock.is_expired ? (
                  <button
                    onClick={() => unlockFunds({ lockIndex: lock.lock_index })}
                    disabled={isPending}
                    className="cursor-pointer text-sm text-foreground transition-colors hover:text-foreground/80 disabled:opacity-50"
                  >
                    Click to unlock
                  </button>
                ) : (
                  <span className="text-sm text-amber-500">{formatTimeRemaining(lock.expiry)}</span>
                )}
                <span className="text-xs text-muted-foreground">
                  on {chain?.name ?? 'Unknown Chain'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {expiredLocks.length >= 1 && (
        <div className="p-3">
          <button
            onClick={() => unlockAllExpired()}
            disabled={isPending}
            className="flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            Unlock All ({expiredLocks.length})
          </button>
        </div>
      )}
    </div>
  )
}
