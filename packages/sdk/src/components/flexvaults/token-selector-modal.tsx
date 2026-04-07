'use client'

import { useState, useMemo, useId } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import type { TokenConfig } from '@/sdk/types/tokens'
import { useFlexvaultsContext } from '@/sdk/context/flexvaults-provider'
import { cn } from '@/lib/utils'
import { getTokenIcon } from './token-icons'

interface TokenSelectorModalProps {
  open: boolean
  onClose: () => void
  onSelect: (token: TokenConfig) => void
  selectedTokenId?: string
}

export function TokenSelectorModal({
  open,
  onClose,
  onSelect,
  selectedTokenId,
}: TokenSelectorModalProps) {
  const [tokenSearch, setTokenSearch] = useState('')
  const titleId = useId()
  const descId = useId()
  const { enabledTokens } = useFlexvaultsContext()

  const filteredTokens = useMemo(() => {
    const tokens = enabledTokens.map((token) => ({
      ...token,
      key: token.id,
      enabled: true,
    }))
    if (!tokenSearch) return tokens
    return tokens.filter(
      (token) =>
        token.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) ||
        token.name.toLowerCase().includes(tokenSearch.toLowerCase())
    )
  }, [tokenSearch, enabledTokens])

  const handleSelect = (token: TokenConfig & { enabled: boolean }) => {
    if (!token.enabled) return
    onSelect(token)
    onClose()
    setTokenSearch('')
  }

  const handleClose = () => {
    onClose()
    setTokenSearch('')
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose()
      }}
    >
      <DialogContent
        className="border-border bg-card gap-0 overflow-hidden rounded-xl border p-0 sm:max-w-85"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <DialogHeader className="border-border border-b px-4 py-3">
          <DialogTitle id={titleId} className="text-foreground text-sm font-medium">
            Select Token
          </DialogTitle>
          <DialogDescription id={descId} className="sr-only">
            Select a token to filter or choose from the available options.
          </DialogDescription>
        </DialogHeader>

        <div className="p-3">
          <input
            placeholder="Search"
            value={tokenSearch}
            onChange={(e) => setTokenSearch(e.target.value)}
            className="border-border bg-muted/50 text-foreground placeholder:text-muted-foreground focus:border-ring h-9 w-full rounded-lg border px-3 text-sm focus:outline-none"
          />
        </div>

        <div className="max-h-70 overflow-y-auto px-3 pb-3">
          {filteredTokens.map((token) => {
            const isSelected = selectedTokenId === token.id
            const isDisabled = !token.enabled

            return (
              <button
                key={token.id}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                  isDisabled ? 'cursor-not-allowed opacity-40' : 'hover:bg-muted cursor-pointer',
                  isSelected && !isDisabled && 'bg-muted'
                )}
                onClick={() => handleSelect(token)}
                disabled={isDisabled}
              >
                {getTokenIcon(token.symbol, 24)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground text-sm font-medium">{token.symbol}</span>
                    {isDisabled && (
                      <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px]">
                        Soon
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground text-[11px]">{token.name}</div>
                </div>
                {isSelected && !isDisabled && (
                  <div className="bg-primary flex h-4 w-4 items-center justify-center rounded-full">
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
