'use client'

import { toast } from 'sonner'
import { useLockedFunds, useUnlockFunds } from '@/sdk/hooks'
import { formatTokenAmount, formatTimeRemaining, shortenAddress } from '@/lib/utils'
import { useFlexvaultsContext } from '@/sdk/context/flexvaults-provider'
import { getTokenIcon } from './token-icons'

function Skeleton() {
  return (
    <div className="flex flex-col">
      {[1, 2].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg p-3">
          <div className="bg-secondary h-10 w-10 rounded-full" />
          <div className="flex-1">
            <div className="bg-secondary mb-2 h-3.5 w-24 rounded" />
            <div className="bg-secondary h-3 w-32 rounded" />
          </div>
          <div className="text-right">
            <div className="bg-secondary mb-2 h-3.5 w-16 rounded" />
            <div className="bg-secondary h-3 w-20 rounded" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function LockedFundsList() {
  const { getTokenById, getChainById, chains } = useFlexvaultsContext()
  const { locks, isLoading } = useLockedFunds()
  const { unlockFunds, unlockAllExpired, isPending } = useUnlockFunds()

  const expiredLocks = locks.filter((lock) => lock.is_expired)

  if (isLoading) {
    return <Skeleton />
  }

  if (locks.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg p-8">
        <span className="text-muted-foreground text-sm">No locked funds</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <div className="flex flex-col">
        {locks.map((lock, _index) => {
          const token = getTokenById(lock.token_id)
          const chain = (token?.chainId ? getChainById(token.chainId) : undefined) ?? chains[0]
          const formattedAmount = formatTokenAmount(String(lock.amount), token?.decimals ?? 18)
          const isHighlighted = lock.is_expired

          return (
            <div
              key={lock.lock_id}
              className={`flex items-center gap-3 rounded-lg p-3 ${isHighlighted ? 'bg-muted' : ''}`}
            >
              <div className="bg-secondary h-10 w-10 shrink-0 overflow-hidden rounded-full">
                {token && getTokenIcon(token.symbol, 40)}
              </div>

              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-foreground text-sm font-medium">
                  {formattedAmount} {token?.symbol ?? '?'}
                </span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(lock.service_address)
                    toast.success('Address copied')
                  }}
                  className="text-muted-foreground hover:text-foreground cursor-pointer self-start text-xs transition-colors"
                  title="Click to copy"
                >
                  Service: {shortenAddress(lock.service_address)}
                </button>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-2">
                {lock.is_expired ? (
                  <button
                    onClick={() => unlockFunds({ lockId: lock.lock_id })}
                    disabled={isPending}
                    className="bg-input text-foreground hover:bg-input/90 cursor-pointer rounded-md px-3 py-[9px] text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Unlock
                  </button>
                ) : (
                  <span className="text-sm text-amber-500">{formatTimeRemaining(lock.expiry)}</span>
                )}
                <span className="text-muted-foreground text-xs">
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
            className="border-border text-foreground hover:bg-muted flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
          >
            Unlock All ({expiredLocks.length})
          </button>
        </div>
      )}
    </div>
  )
}
