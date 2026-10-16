'use client'

import type { TokenConfig } from '@/sdk/types/tokens'
import { getTokenIcon } from './token-icons'
import { ChevronRightIcon } from './icons'

export function TokenSelectField({
  token,
  chainName,
  onClick,
  disabled,
  showChevron = true,
}: {
  token: TokenConfig | undefined
  chainName: string | undefined
  onClick: () => void
  disabled?: boolean
  showChevron?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <label className="text-muted-foreground text-sm">Token</label>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="border-border bg-input flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        {token ? (
          <>
            <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
              {getTokenIcon(token.symbol, 32)}
            </div>
            <div className="flex flex-1 flex-col items-start gap-1">
              <span className="text-foreground text-sm font-medium">{token.symbol}</span>
              <span className="text-muted-foreground text-xs">on {chainName ?? '—'}</span>
            </div>
          </>
        ) : (
          <span className="text-muted-foreground flex-1 text-sm">Select token</span>
        )}
        {showChevron && (
          <div className="text-muted-foreground flex h-5 w-5 items-center justify-center">
            <ChevronRightIcon />
          </div>
        )}
      </button>
    </div>
  )
}
