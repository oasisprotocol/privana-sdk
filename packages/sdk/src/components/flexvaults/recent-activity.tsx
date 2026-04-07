'use client'

import { useAccount } from 'wagmi'
import { usePendingWithdrawals } from '@/sdk/hooks'
import { formatTokenAmount } from '@/lib/utils'
import { useFlexvaultsContext } from '@/sdk/context/flexvaults-provider'
import { getTokenIcon } from './token-icons'
import { SUPPORTED_CHAINS, getExplorerAddressUrl } from '@/sdk/types/chains'

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
  const { enabledTokens } = useFlexvaultsContext()
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

  const explorerUrl = address && chain ? getExplorerAddressUrl(chain.id, address) : undefined

  return (
    <div className="space-y-2">
      {withdrawals.map((withdrawal) => {
        const token = enabledTokens.find(
          (t) => t.id.toLowerCase() === withdrawal.token_id.toLowerCase()
        )
        const formattedAmount = formatTokenAmount(String(withdrawal.amount), token?.decimals ?? 18)
        // Pending withdrawals endpoint only returns unresolved withdrawals
        const isPending = !withdrawal.resolved

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
                {isPending ? (
                  <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400">
                    Processing
                  </span>
                ) : explorerUrl ? (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400 transition-colors hover:bg-emerald-500/30"
                  >
                    Completed
                    <svg width="8" height="8" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M3.5 1.5h7v7M10.5 1.5L1.5 10.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </a>
                ) : (
                  <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400">
                    Completed
                  </span>
                )}
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
              <span>Block #{withdrawal.block_number}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
