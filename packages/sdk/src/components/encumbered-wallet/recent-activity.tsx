'use client'

import { useAccount } from 'wagmi'
import { usePendingWithdrawals } from '@/sdk/hooks'
import { formatTokenAmount, formatRelativeTime } from '@/lib/utils'
import { getTokenById } from '@/sdk/types/tokens'
import { getTokenIcon } from './token-icons'
import { SUPPORTED_CHAINS } from '@/sdk/types/chains'

function Skeleton() {
  return (
    <div className="space-y-2">
      <div className="animate-pulse rounded-lg bg-zinc-800/50 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
            <div className="h-3 w-14 rounded bg-zinc-700" />
          </div>
          <div className="h-4 w-16 rounded bg-zinc-700" />
        </div>
        <div className="flex items-center justify-between">
          <div className="h-3 w-20 rounded bg-zinc-700" />
          <div className="h-3 w-12 rounded bg-zinc-700" />
        </div>
      </div>
    </div>
  )
}

export function RecentActivity() {
  const { address } = useAccount()
  const { withdrawals, isLoading } = usePendingWithdrawals()
  const chain = SUPPORTED_CHAINS[0]

  if (!address) {
    return <span className="text-xs text-zinc-600">Connect wallet</span>
  }

  if (isLoading) {
    return <Skeleton />
  }

  if (withdrawals.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2.5">
        <span className="text-xs text-zinc-500">No activity</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {withdrawals.map((withdrawal) => {
        const token = getTokenById(withdrawal.token_id)
        const formattedAmount = formatTokenAmount(String(withdrawal.amount), token?.decimals ?? 18)
        const isPending = withdrawal.status === 'pending'

        return (
          <div
            key={withdrawal.index}
            className="rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2.5"
          >
            <div className="mb-1.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`h-1.5 w-1.5 rounded-full ${
                    isPending ? 'animate-pulse bg-blue-400' : 'bg-emerald-400'
                  }`}
                />
                <span className="text-xs text-zinc-400">Withdrawal</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] ${
                    isPending
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-emerald-500/20 text-emerald-400'
                  }`}
                >
                  {isPending ? 'Processing' : 'Completed'}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {token && getTokenIcon(token.symbol, 14)}
                <span className="text-sm font-medium text-zinc-200">
                  {formattedAmount} {token?.symbol ?? '?'}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between text-[10px] text-zinc-500">
              <span>{chain?.name ?? 'Unknown Chain'}</span>
              <span>{formatRelativeTime(withdrawal.created_at)}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
