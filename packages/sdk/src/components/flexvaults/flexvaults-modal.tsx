'use client'

import { useState, useMemo } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { DepositForm } from './deposit-form'
import { WithdrawForm } from './withdraw-form'
import { LockedFundsList } from './locked-funds-list'
import { SUPPORTED_TOKENS, type TokenConfig } from '@/sdk/types/tokens'
import { useBalance, useLockedFunds } from '@/sdk/hooks'
import { formatTokenAmount, cn } from '@/lib/utils'
import { getTokenIcon } from './token-icons'

type ModalView = 'main' | 'locked-funds' | 'select-token'

interface NetworkConfig {
  id: number
  name: string
  color: string
}

const NETWORKS: NetworkConfig[] = [
  { id: 84532, name: 'Base Sepolia', color: '#0052FF' },
  { id: 1, name: 'Ethereum', color: '#627EEA' },
  { id: 23294, name: 'Sapphire', color: '#0092F6' },
  { id: 101, name: 'Solana', color: '#00D18C' },
]

const ENABLED_NETWORKS = [84532]
const ENABLED_TOKENS = ['USDC']

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path
        d="M11.99997 11.99997l-5.99995-5.99995-6.00002-6.00002m6.00002 6.00002l6.00001-6.00002m-12.00003 12.00003l6.00002-6.00001"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SearchIcon() {
  return (
    <div className="h-3 w-3 rounded-full border-[1.5px] border-current" />
  )
}

function ChevronRight() {
  return (
    <svg width="10" height="5" viewBox="0 0 12 6" className="-rotate-90">
      <path
        d="M0 0l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function ChevronLeft() {
  return (
    <svg width="10" height="5" viewBox="0 0 12 6" className="rotate-90">
      <path
        d="M0 0l6 6 6-6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

function BalanceCards({
  selectedToken,
  onLockedFundsClick,
}: {
  selectedToken: TokenConfig
  onLockedFundsClick: () => void
}) {
  const { balanceWei, isLoading: balanceLoading } = useBalance({
    tokenId: selectedToken.id,
  })
  const { totalLocked, isLoading: lockedLoading } = useLockedFunds()

  const formattedBalance = formatTokenAmount(balanceWei, selectedToken.decimals)
  const formattedLocked = formatTokenAmount(String(totalLocked), selectedToken.decimals)

  return (
    <div className="flex gap-2">
      <div className="flex flex-1 flex-col gap-2 rounded-lg bg-muted p-5">
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground">Balance</span>
          <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-muted-foreground">
            {selectedToken.symbol}
          </span>
        </div>
        <div className="text-xl font-medium text-foreground">
          {balanceLoading ? (
            <span className="inline-block h-6 w-24 animate-pulse rounded bg-secondary" />
          ) : (
            formattedBalance
          )}
        </div>
      </div>

      <button
        onClick={onLockedFundsClick}
        className="flex flex-1 cursor-pointer flex-col gap-2 rounded-lg bg-muted p-5 text-left transition-colors hover:bg-muted/80"
      >
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Locked Funds</span>
            <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-muted-foreground">
              {selectedToken.symbol}
            </span>
          </div>
          <div className="flex h-5 w-5 items-center justify-center text-muted-foreground">
            <ChevronRight />
          </div>
        </div>
        <div className="text-xl font-medium text-foreground">
          {lockedLoading ? (
            <span className="inline-block h-6 w-20 animate-pulse rounded bg-secondary" />
          ) : (
            formattedLocked
          )}
        </div>
      </button>
    </div>
  )
}

function Tabs({
  activeTab,
  onTabChange,
}: {
  activeTab: 'deposit' | 'withdraw'
  onTabChange: (tab: 'deposit' | 'withdraw') => void
}) {
  return (
    <div className="relative flex overflow-hidden rounded-lg bg-muted p-1">
      <div
        className={cn(
          'absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-md bg-input transition-transform duration-200',
          activeTab === 'withdraw' && 'translate-x-[100%]'
        )}
      />
      <button
        onClick={() => onTabChange('deposit')}
        className={cn(
          'relative z-10 flex-1 cursor-pointer rounded-md px-3 py-2.5 text-sm transition-colors',
          activeTab === 'deposit' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Deposit
      </button>
      <button
        onClick={() => onTabChange('withdraw')}
        className={cn(
          'relative z-10 flex-1 cursor-pointer rounded-md px-3 py-2.5 text-sm transition-colors',
          activeTab === 'withdraw' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Withdraw
      </button>
    </div>
  )
}

function LockedFundsView({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="flex h-5 w-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft />
          </button>
          <span className="text-base font-medium text-foreground">Locked Funds</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-5 w-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-muted p-2">
        <div className="flex-1 overflow-y-auto">
          <LockedFundsList />
        </div>
      </div>
    </>
  )
}

function TokenSelectorView({
  onBack,
  onClose,
  onSelect,
  selectedTokenId,
}: {
  onBack: () => void
  onClose?: () => void
  onSelect: (token: TokenConfig) => void
  selectedTokenId?: string
}) {
  const [networkSearch, setNetworkSearch] = useState('')
  const [tokenSearch, setTokenSearch] = useState('')
  const [selectedNetwork, setSelectedNetwork] = useState<number>(84532)

  const filteredNetworks = useMemo(() => {
    if (!networkSearch) return NETWORKS
    return NETWORKS.filter((n) => n.name.toLowerCase().includes(networkSearch.toLowerCase()))
  }, [networkSearch])

  const allTokens = useMemo(() => {
    return Object.entries(SUPPORTED_TOKENS).map(([key, token]) => ({
      ...token,
      key,
      enabled: ENABLED_TOKENS.includes(key),
    }))
  }, [])

  const filteredTokens = useMemo(() => {
    if (!tokenSearch) return allTokens
    return allTokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) ||
        t.name.toLowerCase().includes(tokenSearch.toLowerCase())
    )
  }, [tokenSearch, allTokens])

  const handleTokenSelect = (token: TokenConfig & { enabled: boolean }) => {
    if (!token.enabled) return
    onSelect(token)
    onBack()
  }

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="flex h-5 w-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft />
          </button>
          <span className="text-base font-medium text-foreground">Select Token</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-5 w-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex flex-1 flex-col overflow-hidden rounded-[10px] bg-muted p-2">
          <div className="flex flex-col gap-1">
            <div className="px-4 pt-4 pb-2">
              <span className="text-sm text-muted-foreground">Network</span>
            </div>
            <div className="px-3">
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-input px-3 py-2.5">
                <span className="text-muted-foreground">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  placeholder="Search"
                  value={networkSearch}
                  onChange={(e) => setNetworkSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          </div>
          <div className="mt-2 flex-1 overflow-y-auto">
            {filteredNetworks.map((network) => {
              const isSelected = selectedNetwork === network.id
              const isDisabled = !ENABLED_NETWORKS.includes(network.id)

              return (
                <button
                  key={network.id}
                  onClick={() => !isDisabled && setSelectedNetwork(network.id)}
                  disabled={isDisabled}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg p-3 text-left transition-colors',
                    isDisabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'cursor-pointer hover:bg-secondary',
                    isSelected && !isDisabled && 'bg-secondary'
                  )}
                >
                  <div
                    className="h-6 w-6 rounded-full"
                    style={{ backgroundColor: network.color }}
                  />
                  <span className="flex-1 text-sm text-foreground">{network.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-[10px] bg-muted p-2">
          <div className="flex flex-col gap-1">
            <div className="px-4 pt-4 pb-2">
              <span className="text-sm text-muted-foreground">Token</span>
            </div>
            <div className="px-3">
              <div className="flex items-center gap-2.5 rounded-lg border border-border bg-input px-3 py-2.5">
                <span className="text-muted-foreground">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  placeholder="Search"
                  value={tokenSearch}
                  onChange={(e) => setTokenSearch(e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>
          </div>
          <div className="mt-2 flex-1 overflow-y-auto">
            {filteredTokens.map((token) => {
              const isSelected = selectedTokenId === token.id
              const isDisabled = !token.enabled

              return (
                <button
                  key={token.id}
                  onClick={() => handleTokenSelect(token)}
                  disabled={isDisabled}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg p-3 text-left transition-colors',
                    isDisabled
                      ? 'cursor-not-allowed opacity-40'
                      : 'cursor-pointer hover:bg-secondary',
                    isSelected && !isDisabled && 'bg-secondary'
                  )}
                >
                  <div className="h-6 w-6 overflow-hidden rounded-full">
                    {getTokenIcon(token.symbol, 24)}
                  </div>
                  <span className="flex-1 text-sm text-foreground">{token.symbol}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
}

interface ModalBodyProps {
  onClose?: () => void
  onViewChange?: (view: ModalView) => void
}

function ModalBody({ onClose, onViewChange }: ModalBodyProps) {
  const [selectedToken, setSelectedToken] = useState<TokenConfig>(SUPPORTED_TOKENS.USDC)
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')
  const [currentView, setCurrentView] = useState<ModalView>('main')

  const handleViewChange = (view: ModalView) => {
    setCurrentView(view)
    onViewChange?.(view)
  }

  const handleTokenSelect = (token: TokenConfig) => {
    setSelectedToken(token)
  }

  if (currentView === 'locked-funds') {
    return <LockedFundsView onBack={() => handleViewChange('main')} onClose={onClose} />
  }

  if (currentView === 'select-token') {
    return (
      <TokenSelectorView
        onBack={() => handleViewChange('main')}
        onClose={onClose}
        onSelect={handleTokenSelect}
        selectedTokenId={selectedToken.id}
      />
    )
  }

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <span className="text-base font-medium text-foreground">Flexvaults</span>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-5 w-5 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <BalanceCards
          selectedToken={selectedToken}
          onLockedFundsClick={() => handleViewChange('locked-funds')}
        />

        <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="rounded-lg bg-muted p-5">
          {activeTab === 'deposit' ? (
            <DepositForm
              selectedToken={selectedToken}
              onTokenSelect={() => handleViewChange('select-token')}
            />
          ) : (
            <WithdrawForm
              selectedToken={selectedToken}
              onTokenSelect={() => handleViewChange('select-token')}
            />
          )}
        </div>
      </div>
    </>
  )
}

interface FlexvaultsModalProps {
  open: boolean
  onClose: () => void
}

export function FlexvaultsModal({ open, onClose }: FlexvaultsModalProps) {
  const [currentView, setCurrentView] = useState<ModalView>('main')

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        data-flexvaults
        showCloseButton={false}
        className={cn(
          'flex w-[520px] max-w-[95vw] flex-col gap-2 overflow-hidden rounded-2xl border-0 bg-card p-2',
          currentView !== 'main' && 'h-[496px]'
        )}
      >
        <ModalBody onClose={onClose} onViewChange={setCurrentView} />
      </DialogContent>
    </Dialog>
  )
}

export function FlexvaultsInlineModal({ className }: { className?: string }) {
  const [currentView, setCurrentView] = useState<ModalView>('main')

  return (
    <div
      data-flexvaults
      className={cn(
        'flex w-[520px] max-w-full flex-col gap-2 overflow-hidden rounded-2xl bg-card p-2 shadow-lg',
        currentView !== 'main' && 'h-[496px]',
        className
      )}
    >
      <ModalBody onViewChange={setCurrentView} />
    </div>
  )
}
