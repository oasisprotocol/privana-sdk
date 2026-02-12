'use client'

import { useState, useMemo } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { DepositForm } from './deposit-form'
import { WithdrawForm } from './withdraw-form'
import { SUPPORTED_TOKENS, type TokenConfig } from '@/sdk/types/tokens'
import { SUPPORTED_CHAINS } from '@/sdk/types/chains'
import { useBalance, useLockedFunds } from '@/sdk/hooks'
import { formatTokenAmount, cn, shortenAddress } from '@/lib/utils'
import { getTokenIcon, getChainIcon } from './token-icons'

type ModalView = 'main' | 'locked-funds' | 'select-token' | 'balance-details'

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
  return <div className="h-3 w-3 rounded-full border-[1.5px] border-current" />
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

function ChevronDown({ collapsed }: { collapsed?: boolean }) {
  return (
    <svg
      width="12"
      height="6"
      viewBox="0 0 12 6"
      className={cn('transition-transform', collapsed && '-rotate-90')}
    >
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
  onBalanceClick,
  showLockedFunds = true,
}: {
  selectedToken: TokenConfig
  onLockedFundsClick: () => void
  onBalanceClick: () => void
  showLockedFunds?: boolean
}) {
  const { balanceWei, isLoading: balanceLoading } = useBalance({
    tokenId: selectedToken.id,
  })
  const { totalLocked, isLoading: lockedLoading } = useLockedFunds({ enabled: showLockedFunds })

  const formattedBalance = formatTokenAmount(balanceWei, selectedToken.decimals)
  const formattedLocked = showLockedFunds
    ? formatTokenAmount(String(totalLocked), selectedToken.decimals)
    : '0'

  return (
    <div className="flex gap-2">
      <button
        onClick={onBalanceClick}
        className="flex flex-1 cursor-pointer flex-col gap-2 rounded-[10px] bg-muted p-5 text-left transition-colors hover:bg-muted/80"
      >
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground">Balance</span>
            <span className="rounded-full bg-secondary px-2 py-[5px] text-[10px] font-bold text-muted-foreground">
              {selectedToken.symbol}
            </span>
          </div>
          <div className="flex h-6 w-6 items-center justify-center text-muted-foreground">
            <ChevronRight />
          </div>
        </div>
        <div className="text-xl font-medium text-foreground">
          {balanceLoading ? (
            <span className="inline-block h-6 w-24 animate-pulse rounded bg-secondary" />
          ) : (
            formattedBalance
          )}
        </div>
      </button>

      {showLockedFunds && (
        <button
          onClick={onLockedFundsClick}
          className="flex flex-1 cursor-pointer flex-col gap-2 rounded-[10px] bg-muted p-5 text-left transition-colors hover:bg-muted/80"
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">Locked Funds</span>
              <span className="rounded-full bg-secondary px-2 py-[5px] text-[10px] font-bold text-muted-foreground">
                {selectedToken.symbol}
              </span>
            </div>
            <div className="flex h-6 w-6 items-center justify-center text-muted-foreground">
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
      )}
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
    <div className="relative flex gap-2 overflow-hidden rounded-[10px] bg-muted p-1">
      <div
        className={cn(
          'absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-md bg-input transition-transform duration-200',
          activeTab === 'withdraw' && 'translate-x-[calc(100%+8px)]'
        )}
      />
      <button
        onClick={() => onTabChange('deposit')}
        className={cn(
          'relative z-10 flex-1 cursor-pointer rounded-md px-3 py-[9px] text-sm transition-colors',
          activeTab === 'deposit' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Deposit
      </button>
      <button
        onClick={() => onTabChange('withdraw')}
        className={cn(
          'relative z-10 flex-1 cursor-pointer rounded-md px-3 py-[9px] text-sm transition-colors',
          activeTab === 'withdraw' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Withdraw
      </button>
    </div>
  )
}

interface LockedFundsSection {
  title: string
  items: {
    lockIndex: number
    amount: string
    serviceAddress: string
    time: string
    isExpired: boolean
  }[]
}

function LockedFundsView({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
  const { locks, isLoading } = useLockedFunds()
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({})

  const sections = useMemo(() => {
    const sectionMap: Record<string, LockedFundsSection> = {}

    locks.forEach((lock) => {
      const serviceName = shortenAddress(lock.service_address)
      if (!sectionMap[lock.service_address]) {
        sectionMap[lock.service_address] = {
          title: `Service ${serviceName}`,
          items: [],
        }
      }
      sectionMap[lock.service_address].items.push({
        lockIndex: lock.lock_index,
        amount: formatTokenAmount(String(lock.amount), 18),
        serviceAddress: lock.service_address,
        time: lock.is_expired ? 'Click to unlock' : `${Math.floor((lock.expiry - Date.now()) / 3600000)}h`,
        isExpired: lock.is_expired,
      })
    })

    return Object.values(sectionMap)
  }, [locks])

  const toggleSection = (title: string) => {
    setCollapsedSections((prev) => ({
      ...prev,
      [title]: !prev[title],
    }))
  }

  const expiredCount = locks.filter((l) => l.is_expired).length

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="flex h-6 w-6 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft />
          </button>
          <span className="text-xl font-medium leading-6 text-foreground">Locked Funds</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-6 w-6 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col rounded-[10px] bg-muted p-2">
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg p-3">
                  <div className="h-10 w-10 rounded-full bg-secondary" />
                  <div className="flex-1">
                    <div className="mb-2 h-3.5 w-24 rounded bg-secondary" />
                    <div className="h-3 w-32 rounded bg-secondary" />
                  </div>
                </div>
              ))}
            </div>
          ) : sections.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <span className="text-sm text-muted-foreground">No locked funds</span>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.title}>
                <button
                  onClick={() => toggleSection(section.title)}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg px-4 py-4 text-muted-foreground transition-colors hover:bg-secondary"
                >
                  <span className="text-sm">{section.title}</span>
                  <ChevronDown collapsed={collapsedSections[section.title]} />
                </button>

                {!collapsedSections[section.title] &&
                  section.items.map((item, _index) => (
                    <div
                      key={item.lockIndex}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-lg p-3',
                        item.isExpired && 'bg-secondary'
                      )}
                    >
                      <div className="flex flex-1 items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-secondary" />
                        <div className="flex flex-col gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {item.amount} USDC
                          </span>
                          <span className="text-xs text-muted-foreground">
                            Service: {shortenAddress(item.serviceAddress)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col items-end gap-2">
                        <span
                          className={cn(
                            'text-sm',
                            item.isExpired ? 'text-foreground' : 'text-amber-500'
                          )}
                        >
                          {item.time}
                        </span>
                        <span className="text-xs text-muted-foreground">on Base Sepolia</span>
                      </div>
                    </div>
                  ))}
              </div>
            ))
          )}
        </div>

        {expiredCount > 0 && (
          <div className="p-3">
            <button className="flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-secondary">
              Unlock All ({expiredCount})
            </button>
          </div>
        )}
      </div>
    </>
  )
}

function BalanceTokenRow({ token }: { token: TokenConfig }) {
  const { balanceWei, isLoading } = useBalance({
    tokenId: token.id,
  })

  const formattedBalance = formatTokenAmount(balanceWei, token.decimals)

  return (
    <div className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5">
      <div className="h-[18px] w-[18px] overflow-hidden rounded-full">
        {getTokenIcon(token.symbol, 18)}
      </div>
      <span className="flex-1 text-sm text-foreground">{token.symbol}</span>
      {isLoading ? (
        <span className="h-4 w-16 animate-pulse rounded bg-secondary" />
      ) : (
        <span className="text-sm text-muted-foreground">{formattedBalance}</span>
      )}
    </div>
  )
}

function BalanceDetailsView({
  onBack,
  onClose,
}: {
  onBack: () => void
  onClose?: () => void
}) {
  const [selectedChainId, setSelectedChainId] = useState<number>(SUPPORTED_CHAINS[0]?.id ?? 84532)

  const selectedChain = useMemo(() => {
    return SUPPORTED_CHAINS.find((c) => c.id === selectedChainId)
  }, [selectedChainId])

  const chainTokens = useMemo(() => {
    return selectedChain?.tokens ?? []
  }, [selectedChain])

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="flex h-6 w-6 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft />
          </button>
          <span className="text-xl font-medium leading-6 text-foreground">Token Balances</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-6 w-6 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex flex-1 flex-col overflow-hidden rounded-[10px] bg-muted p-2">
          <div className="px-4 pt-4 pb-2">
            <span className="text-sm text-muted-foreground">Network</span>
          </div>
          <div className="mt-1 flex-1 overflow-y-auto">
            {SUPPORTED_CHAINS.map((chain) => {
              const isSelected = selectedChainId === chain.id

              return (
                <button
                  key={chain.id}
                  onClick={() => setSelectedChainId(chain.id)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary',
                    isSelected && 'bg-secondary'
                  )}
                >
                  <div className="h-[18px] w-[18px] overflow-hidden rounded-full">
                    {getChainIcon(chain.id, 18)}
                  </div>
                  <span className="flex-1 text-sm text-foreground">{chain.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-[2] flex-col overflow-hidden rounded-[10px] bg-muted p-2">
          <div className="px-4 pt-4 pb-2">
            <span className="text-sm text-muted-foreground">Token Balance</span>
          </div>
          <div className="mt-2 flex-1 overflow-y-auto">
            {chainTokens.map((token) => (
              <BalanceTokenRow key={token.id} token={token} />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function TokenRow({
  token,
  isSelected,
  onClick,
}: {
  token: TokenConfig
  isSelected: boolean
  onClick: () => void
}) {
  const { address } = useAccount()

  const { data: walletBalance } = useReadContract({
    address: token.contract as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  })

  const formattedBalance = walletBalance
    ? formatTokenAmount(walletBalance.toString(), token.decimals)
    : '0.00'

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary',
        isSelected && 'bg-secondary'
      )}
    >
      <div className="h-[18px] w-[18px] overflow-hidden rounded-full">
        {getTokenIcon(token.symbol, 18)}
      </div>
      <span className="flex-1 text-sm text-foreground">{token.symbol}</span>
      <span className="text-sm text-muted-foreground">{formattedBalance}</span>
    </button>
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
  const [tokenSearch, setTokenSearch] = useState('')
  const [selectedChainId, setSelectedChainId] = useState<number>(SUPPORTED_CHAINS[0]?.id ?? 84532)

  const selectedChain = useMemo(() => {
    return SUPPORTED_CHAINS.find((c) => c.id === selectedChainId)
  }, [selectedChainId])

  const chainTokens = useMemo(() => {
    return selectedChain?.tokens ?? []
  }, [selectedChain])

  const filteredTokens = useMemo(() => {
    if (!tokenSearch) return chainTokens
    return chainTokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(tokenSearch.toLowerCase()) ||
        t.name.toLowerCase().includes(tokenSearch.toLowerCase())
    )
  }, [tokenSearch, chainTokens])

  const handleTokenSelect = (token: TokenConfig) => {
    onSelect(token)
    onBack()
  }

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            className="flex h-6 w-6 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft />
          </button>
          <span className="text-xl font-medium leading-6 text-foreground">Select Token</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-6 w-6 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <div className="flex flex-1 flex-col overflow-hidden rounded-[10px] bg-muted p-2">
          <div className="px-4 pt-4 pb-2">
            <span className="text-sm text-muted-foreground">Network</span>
          </div>
          <div className="mt-1 flex-1 overflow-y-auto">
            {SUPPORTED_CHAINS.map((chain) => {
              const isSelected = selectedChainId === chain.id

              return (
                <button
                  key={chain.id}
                  onClick={() => setSelectedChainId(chain.id)}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-secondary',
                    isSelected && 'bg-secondary'
                  )}
                >
                  <div className="h-[18px] w-[18px] overflow-hidden rounded-full">
                    {getChainIcon(chain.id, 18)}
                  </div>
                  <span className="flex-1 text-sm text-foreground">{chain.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-[2] flex-col overflow-hidden rounded-[10px] bg-muted p-2">
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
            {filteredTokens.map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                isSelected={selectedTokenId === token.id}
                onClick={() => handleTokenSelect(token)}
              />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

interface ModalBodyProps {
  onClose?: () => void
  onViewChange?: (view: ModalView) => void
  showLockedFunds?: boolean
}

function ModalBody({ onClose, onViewChange, showLockedFunds = true }: ModalBodyProps) {
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

  if (currentView === 'balance-details') {
    return (
      <BalanceDetailsView
        onBack={() => handleViewChange('main')}
        onClose={onClose}
      />
    )
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
        <span className="text-xl font-medium leading-6 text-foreground">Flexvaults</span>
        {onClose && (
          <button
            onClick={onClose}
            className="flex h-6 w-6 cursor-pointer items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2 pb-4">
        <BalanceCards
          selectedToken={selectedToken}
          onLockedFundsClick={() => handleViewChange('locked-funds')}
          onBalanceClick={() => handleViewChange('balance-details')}
          showLockedFunds={showLockedFunds}
        />

        <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="rounded-[10px] bg-muted p-5">
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
  showLockedFunds?: boolean
}

export function FlexvaultsModal({ open, onClose, showLockedFunds }: FlexvaultsModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        data-flexvaults
        showCloseButton={false}
        className="flex w-[560px] max-w-[95vw] flex-col gap-2 overflow-hidden rounded-2xl border-0 bg-card p-2"
      >
        <ModalBody onClose={onClose} showLockedFunds={showLockedFunds} />
      </DialogContent>
    </Dialog>
  )
}

export function FlexvaultsInlineModal({ className, showLockedFunds }: { className?: string; showLockedFunds?: boolean }) {
  return (
    <div
      data-flexvaults
      className={cn(
        'flex w-[560px] max-w-full flex-col gap-2 overflow-hidden rounded-2xl bg-card p-2 shadow-lg',
        className
      )}
    >
      <ModalBody showLockedFunds={showLockedFunds} />
    </div>
  )
}
