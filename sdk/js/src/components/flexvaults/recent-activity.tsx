'use client'

import { formatRelativeTime, formatTokenAmount, shortenAddress } from '@/lib/utils'
import { useFlexvaultsContext } from '@/sdk/context/flexvaults-provider'
import { useHistory, useSafeAccount } from '@/sdk/hooks'
import type { HistoryEntry, HistoryKind } from '@/sdk/types'
import { getTokenIcon } from './token-icons'

const ACTIVITY_LABELS: Record<HistoryKind, string> = {
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  createLock: 'Lock Created',
  transferFromLock: 'Locked Transfer',
  transferBalance: 'Transfer',
  unknown: 'Activity',
}

const ACTIVITY_DOT_CLASS: Record<HistoryKind, string> = {
  deposit: 'bg-emerald-400',
  withdraw: 'bg-amber-400',
  createLock: 'bg-blue-400',
  transferFromLock: 'bg-violet-400',
  transferBalance: 'bg-cyan-400',
  unknown: 'bg-zinc-500',
}

function shortenHex(value: string): string {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value
}

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

function formatEntryAmount(entry: HistoryEntry, tokenSymbol?: string, decimals?: number): string {
  if (!entry.amount) {
    return '-'
  }
  if (tokenSymbol && decimals !== undefined) {
    return `${formatTokenAmount(String(entry.amount), decimals)} ${tokenSymbol}`
  }
  if (entry.token_id) {
    return `${entry.amount} ${shortenHex(entry.token_id)}`
  }
  return entry.amount
}

function getCounterpartyText(entry: HistoryEntry): string | null {
  if (!entry.counterparty) {
    return null
  }

  const counterparty = shortenAddress(entry.counterparty)
  if (entry.kind === 'createLock') return `Service ${counterparty}`
  if (
    entry.kind === 'withdraw' ||
    entry.kind === 'transferFromLock' ||
    entry.kind === 'transferBalance'
  ) {
    return `To ${counterparty}`
  }
  return counterparty
}

export function RecentActivity() {
  const { address } = useSafeAccount()
  const { getTokenById, getChainById, hostedAuthConfig, hostedAuthSession } = useFlexvaultsContext()
  const { history, isError, isLoading } = useHistory({ offset: -1, limit: 5 })
  const privateReadAddress = hostedAuthConfig ? hostedAuthSession?.address : address

  if (!privateReadAddress) {
    return (
      <span className="text-xs text-zinc-600">
        {hostedAuthConfig ? 'Sign in' : 'Connect wallet'}
      </span>
    )
  }

  if (isLoading) {
    return <Skeleton />
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2.5">
        <span className="text-xs text-zinc-500">Activity unavailable</span>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2.5">
        <span className="text-xs text-zinc-500">No activity</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {history
        .slice()
        .reverse()
        .map((entry, index) => {
          const token = entry.token_id ? getTokenById(entry.token_id) : undefined
          const chainId = entry.chain_id ?? token?.chainId
          const chain = chainId ? getChainById(chainId) : undefined
          const amount = formatEntryAmount(entry, token?.symbol, token?.decimals)
          const counterpartyText = getCounterpartyText(entry)
          const detail = [counterpartyText, chain?.name].filter(Boolean).join(' / ')

          return (
            <div
              key={`${entry.kind}-${entry.timestamp}-${entry.token_id ?? ''}-${entry.deposit_id ?? ''}-${index}`}
              className="rounded-lg border border-zinc-800 bg-zinc-800/50 px-3 py-2.5"
            >
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <div
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${ACTIVITY_DOT_CLASS[entry.kind]}`}
                  />
                  <span className="truncate text-xs text-zinc-400">
                    {ACTIVITY_LABELS[entry.kind]}
                  </span>
                </div>
                <div className="flex max-w-[55%] shrink-0 items-center gap-1.5">
                  {token && getTokenIcon(token.symbol, 14)}
                  <span className="truncate text-sm font-medium text-zinc-200">{amount}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span className="min-w-0 truncate">{detail || 'Unknown Chain'}</span>
                <span className="shrink-0 pl-2">{formatRelativeTime(entry.timestamp)}</span>
              </div>
            </div>
          )
        })}
    </div>
  )
}
