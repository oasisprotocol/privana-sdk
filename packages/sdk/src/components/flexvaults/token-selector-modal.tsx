'use client'

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SUPPORTED_TOKENS, type TokenConfig } from '@/sdk/types/tokens'
import { cn } from '@/lib/utils'
import { getTokenIcon } from './token-icons'

interface TokenSelectorModalProps {
  open: boolean
  onClose: () => void
  onSelect: (token: TokenConfig) => void
  selectedTokenId?: string
}

const ENABLED_TOKENS = ['USDC']

export function TokenSelectorModal({
  open,
  onClose,
  onSelect,
  selectedTokenId,
}: TokenSelectorModalProps) {
  const [tokenSearch, setTokenSearch] = useState('')

  const allTokens = useMemo(() => {
    return Object.entries(SUPPORTED_TOKENS).map(([key, token]) => ({
      ...token,
      key,
      enabled: ENABLED_TOKENS.includes(key),
    }))
  }, [])

  const filteredTokens = useMemo(() => {
    let tokens = allTokens
    if (tokenSearch) {
      tokens = tokens.filter(
        (token) =>
          token.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) ||
          token.name.toLowerCase().includes(tokenSearch.toLowerCase())
      )
    }
    return tokens
  }, [tokenSearch, allTokens])

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
      <DialogContent className="gap-0 overflow-hidden rounded-xl border border-border bg-card p-0 sm:max-w-85">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="text-sm font-medium text-foreground">Select Token</DialogTitle>
        </DialogHeader>

        <div className="p-3">
          <input
            placeholder="Search"
            value={tokenSearch}
            onChange={(e) => setTokenSearch(e.target.value)}
            className="h-9 w-full rounded-lg border border-border bg-muted/50 px-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
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
                  isDisabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:bg-muted',
                  isSelected && !isDisabled && 'bg-muted'
                )}
                onClick={() => handleSelect(token)}
                disabled={isDisabled}
              >
                {getTokenIcon(token.symbol, 24)}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{token.symbol}</span>
                    {isDisabled && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        Soon
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{token.name}</div>
                </div>
                {isSelected && !isDisabled && (
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-primary-foreground">
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
