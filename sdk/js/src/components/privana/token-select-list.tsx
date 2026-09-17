'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { cn, formatTokenAmount } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { sortTokensByBalance } from '@/sdk/utils/token-sort'
import { getTokenIcon } from './token-icons'

export interface TokenSelectListItem {
  id: string
  symbol: string
  name?: string
  chainName?: string
  decimals: number
}

export interface TokenSelectListProps {
  items: TokenSelectListItem[]
  balances: Readonly<Record<string, string>>
  balancesLoading: boolean
  selectedId?: string
  disabledId?: string
  onSelect: (id: string) => void
  searchable?: boolean
  listClassName?: string
}

export function filterTokenItems(
  items: readonly TokenSelectListItem[],
  query: string,
  chain: string
): TokenSelectListItem[] {
  const q = query.trim().toLowerCase()
  return items.filter((item) => {
    if (chain !== 'All' && item.chainName !== chain) return false
    if (!q) return true
    return [item.symbol, item.name]
      .filter((v): v is string => !!v)
      .some((v) => v.toLowerCase().includes(q))
  })
}

export function chainFiltersFor(items: readonly TokenSelectListItem[]): string[] {
  const chains = items.map((item) => item.chainName).filter((c): c is string => !!c)
  return ['All', ...Array.from(new Set(chains))]
}

const SKELETON_ROW_KEYS = Array.from({ length: 6 }, (_, i) => `skeleton-${i}`)

function TokenRowSkeleton() {
  return (
    <div className="flex w-full items-center gap-3 rounded-lg px-3 py-2">
      <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-5 items-center">
          <Skeleton className="h-3.5 w-16" />
        </div>
        <div className="flex h-4 items-center">
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>
      <Skeleton className="h-4 w-14 shrink-0" />
    </div>
  )
}

function TokenRow({
  item,
  balance,
  balanceLoading,
  isSelected,
  isDisabled,
  onSelect,
}: {
  item: TokenSelectListItem
  balance?: string
  balanceLoading: boolean
  isSelected: boolean
  isDisabled: boolean
  onSelect: () => void
}) {
  const formatted = balance !== undefined ? formatTokenAmount(balance, item.decimals) : undefined
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
        isDisabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-secondary cursor-pointer',
        isSelected && 'bg-secondary'
      )}
    >
      <div className="h-6 w-6 shrink-0 overflow-hidden rounded-full">
        {getTokenIcon(item.symbol, 24)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-sm font-medium">{item.symbol}</div>
        {item.chainName && (
          <div className="text-muted-foreground text-[11px] leading-4">on {item.chainName}</div>
        )}
      </div>
      {balanceLoading && formatted === undefined ? (
        <Skeleton className="h-4 w-14 shrink-0" />
      ) : formatted !== undefined ? (
        <div
          className={cn(
            'shrink-0 text-sm tabular-nums',
            BigInt(balance!) === 0n ? 'text-muted-foreground/70' : 'text-foreground font-medium'
          )}
        >
          {formatted}
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
}

export function TokenSelectList({
  items,
  balances,
  balancesLoading,
  selectedId,
  disabledId,
  onSelect,
  searchable = true,
  listClassName,
}: TokenSelectListProps) {
  const [query, setQuery] = useState('')
  const [chainFilter, setChainFilter] = useState('All')

  const [frozen, setFrozen] = useState<{ order: string[] | null }>({ order: null })
  if (frozen.order === null && !balancesLoading) {
    if (Object.keys(balances).length > 0) {
      const sorted = sortTokensByBalance(
        items.map((item) => ({ ...item, name: item.name ?? item.symbol })),
        (item) => {
          const balance = balances[item.id]
          return balance === undefined ? undefined : BigInt(balance)
        }
      )
      setFrozen({ order: sorted.map((item) => item.id) })
    } else {
      setFrozen({ order: items.map((item) => item.id) })
    }
  }

  const orderedItems = useMemo(() => {
    if (frozen.order === null) return items
    const rank = new Map(frozen.order.map((id, i) => [id, i]))
    return [...items].sort((a, b) => (rank.get(a.id) ?? rank.size) - (rank.get(b.id) ?? rank.size))
  }, [items, frozen.order])

  const chainFilters = useMemo(() => chainFiltersFor(items), [items])
  const filtered = filterTokenItems(orderedItems, query, chainFilter)

  return (
    <div className="flex flex-col gap-3">
      {searchable && (
        <div className="border-input bg-input focus-within:ring-ring/50 flex items-center gap-2 rounded-lg border px-3 focus-within:ring-2">
          <Search className="text-muted-foreground size-4 shrink-0" />
          <Input
            placeholder="Search token"
            className="h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {chainFilters.length > 2 && (
        <div className="flex flex-wrap gap-2">
          {chainFilters.map((chain) => (
            <button
              key={chain}
              type="button"
              disabled={frozen.order === null}
              onClick={() => setChainFilter(chain)}
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                chainFilter === chain
                  ? 'bg-secondary text-secondary-foreground border border-transparent'
                  : 'border-input text-muted-foreground hover:text-foreground border'
              )}
            >
              {chain}
            </button>
          ))}
        </div>
      )}

      <div className={cn('flex max-h-[332px] flex-col gap-1 overflow-y-auto', listClassName)}>
        {frozen.order === null &&
          (items.length > 0 ? items.map((item) => item.id) : SKELETON_ROW_KEYS).map((key) => (
            <TokenRowSkeleton key={key} />
          ))}
        {frozen.order !== null &&
          filtered.map((item) => (
            <TokenRow
              key={item.id}
              item={item}
              balance={balances[item.id]}
              balanceLoading={balancesLoading}
              isSelected={selectedId === item.id}
              isDisabled={disabledId === item.id}
              onSelect={() => onSelect(item.id)}
            />
          ))}
        {frozen.order !== null && filtered.length === 0 && (
          <p className="text-muted-foreground px-3 py-6 text-center text-sm">No tokens found</p>
        )}
      </div>
    </div>
  )
}
