'use client'

import { useMemo } from 'react'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { useBatchBalances } from '@/sdk/hooks/use-batch-balances'
import { useWalletTokenBalances } from '@/sdk/hooks/use-wallet-token-balances'
import { cn, formatTokenAmount } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { getTokenIcon } from './token-icons'

interface TokenSelectorViewProps {
  selectedTokenId?: string
  onSelect: (tokenId: string) => void
  balanceSource: 'wallet' | 'accounting'
}

/**
 * Simple single-column token picker shared by the Deposit and Withdraw modals.
 */
export function TokenSelectorView({
  selectedTokenId,
  onSelect,
  balanceSource,
}: TokenSelectorViewProps) {
  const { enabledTokens, getChainById } = usePrivanaContext()

  const tokenIds = useMemo(() => enabledTokens.map((token) => token.id), [enabledTokens])
  const accounting = useBatchBalances({ tokenIds, enabled: balanceSource === 'accounting' })
  const wallet = useWalletTokenBalances(balanceSource === 'wallet' ? enabledTokens : [])

  const balanceById = useMemo(() => {
    if (balanceSource === 'wallet') return wallet.balances
    const map: Record<string, string> = {}
    for (const balance of accounting.balances) map[balance.token_id.toLowerCase()] = balance.balance
    return map
  }, [balanceSource, wallet.balances, accounting.balances])
  const balancesLoading = balanceSource === 'wallet' ? wallet.isLoading : accounting.isLoading

  return (
    <div className="bg-muted flex flex-col rounded-[10px] p-3">
      <div className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {enabledTokens.map((token) => {
          const isSelected = selectedTokenId === token.id
          const chainName = getChainById(token.chainId)?.name
          const balance = balanceById[token.id.toLowerCase()]
          return (
            <button
              key={token.id}
              type="button"
              onClick={() => onSelect(token.id)}
              className={cn(
                'hover:bg-secondary flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                isSelected && 'bg-secondary'
              )}
            >
              <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
                {getTokenIcon(token.symbol, 24)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-foreground text-sm font-medium">{token.symbol}</div>
                <div className="text-muted-foreground text-[11px]">on {chainName ?? '—'}</div>
              </div>
              {balancesLoading && balance === undefined ? (
                <Skeleton className="h-4 w-14 shrink-0" />
              ) : balance !== undefined ? (
                <div className="text-foreground shrink-0 text-sm font-medium tabular-nums">
                  {formatTokenAmount(balance, token.decimals)}
                </div>
              ) : null}
              {isSelected && (
                <div className="bg-primary flex h-4 w-4 shrink-0 items-center justify-center rounded-full">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 10 10"
                    fill="none"
                    className="text-primary-foreground"
                  >
                    <path
                      d="M2 5L4 7L8 3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              )}
            </button>
          )
        })}
        {enabledTokens.length === 0 && (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">No tokens available</p>
        )}
      </div>
    </div>
  )
}
