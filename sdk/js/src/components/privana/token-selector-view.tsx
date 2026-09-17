'use client'

import { useMemo } from 'react'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { useBatchBalances } from '@/sdk/hooks/use-batch-balances'
import { useWalletTokenBalances } from '@/sdk/hooks/use-wallet-token-balances'
import { TokenSelectList, type TokenSelectListItem } from './token-select-list'

interface TokenSelectorViewProps {
  selectedTokenId?: string
  onSelect: (tokenId: string) => void
  balanceSource: 'wallet' | 'accounting'
}

/**
 * The Deposit/Withdraw modals' token picker: the shared TokenSelectList fed
 * with the configured tokens and either wallet or accounting balances.
 */
export function TokenSelectorView({
  selectedTokenId,
  onSelect,
  balanceSource,
}: TokenSelectorViewProps) {
  const { enabledTokens, getChainById, tokensStatus } = usePrivanaContext()

  const tokenIds = useMemo(() => enabledTokens.map((token) => token.id), [enabledTokens])
  const accounting = useBatchBalances({ tokenIds, enabled: balanceSource === 'accounting' })
  const wallet = useWalletTokenBalances(balanceSource === 'wallet' ? enabledTokens : [])

  const items = useMemo<TokenSelectListItem[]>(
    () =>
      enabledTokens.map((token) => ({
        id: token.id,
        symbol: token.symbol,
        name: token.name,
        chainName: getChainById(token.chainId)?.name,
        decimals: token.decimals,
      })),
    [enabledTokens, getChainById]
  )

  const balances = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    if (balanceSource === 'wallet') {
      for (const token of enabledTokens) {
        const balance = wallet.balances[token.id.toLowerCase()]
        if (balance !== undefined) map[token.id] = balance
      }
      return map
    }
    const byLowerId = new Map(accounting.balances.map((b) => [b.token_id.toLowerCase(), b.balance]))
    for (const token of enabledTokens) {
      const balance = byLowerId.get(token.id.toLowerCase())
      if (balance !== undefined) map[token.id] = balance
    }
    return map
  }, [balanceSource, enabledTokens, wallet.balances, accounting.balances])

  const balancesLoading =
    tokensStatus === 'loading' ||
    (balanceSource === 'wallet' ? wallet.isLoading : accounting.isLoading)

  return (
    <div className="bg-muted flex flex-col rounded-[10px] p-3">
      <TokenSelectList
        items={items}
        balances={balances}
        balancesLoading={balancesLoading}
        selectedId={selectedTokenId}
        onSelect={onSelect}
      />
    </div>
  )
}
