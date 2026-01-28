'use client'

import { toast } from 'sonner'
import { useLockedFunds, useUnlockFunds } from '@/sdk/hooks'
import { formatTokenAmount, formatTimeRemaining, shortenAddress } from '@/lib/utils'
import { getTokenById } from '@/sdk/types/tokens'
import { getTokenIcon } from './token-icons'
import { SUPPORTED_CHAINS } from '@/sdk/types/chains'

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="animate-pulse rounded-lg bg-zinc-800/50 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full bg-zinc-700" />
            <div className="h-4 w-16 rounded bg-zinc-700" />
          </div>
          <div className="h-5 w-12 rounded bg-zinc-700" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-3 w-24 rounded bg-zinc-700" />
          <div className="h-3 w-16 rounded bg-zinc-700" />
        </div>
      </div>
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
      <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2.5">
        <span className="text-xs text-zinc-500">No locked funds</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {expiredLocks.length > 1 && (
        <button
          onClick={() => unlockAllExpired()}
          disabled={isPending}
          className="w-full cursor-pointer rounded-lg bg-zinc-800 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-700 disabled:opacity-50"
        >
          Unlock All ({expiredLocks.length})
        </button>
      )}

      {locks.map((lock) => {
        const token = getTokenById(lock.token_id)
        const formattedAmount = formatTokenAmount(String(lock.amount), token?.decimals ?? 18)

        return (
          <div
            key={lock.lock_index}
            className="rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {token && getTokenIcon(token.symbol, 16)}
                <span className="text-sm font-medium text-zinc-200">
                  {formattedAmount} {token?.symbol ?? '?'}
                </span>
              </div>
              {lock.is_expired ? (
                <button
                  onClick={() => unlockFunds({ lockIndex: lock.lock_index })}
                  disabled={isPending}
                  className="cursor-pointer rounded bg-zinc-100 px-2 py-1 text-[10px] font-medium text-zinc-900 transition-colors hover:bg-white disabled:opacity-50"
                >
                  Unlock
                </button>
              ) : (
                <span className="text-[10px] font-medium text-amber-400">
                  {formatTimeRemaining(lock.expiry)}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(lock.service_address)
                  toast.success('Address copied')
                }}
                className="cursor-pointer transition-colors hover:text-zinc-300"
                title="Click to copy"
              >
                Service: {shortenAddress(lock.service_address)}
              </button>
              <span>{chain?.name ?? 'Unknown Chain'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
