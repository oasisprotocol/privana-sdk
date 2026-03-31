'use client'

import { useState, useMemo, useId } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { erc20Abi } from 'viem'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DepositForm } from './deposit-form'
import { WithdrawForm } from './withdraw-form'
import { type TokenConfig, getTokenById } from '@/sdk/types/tokens'
import { useFlexvaultsContext } from '@/sdk/context/flexvaults-provider'
import { SUPPORTED_CHAINS } from '@/sdk/types/chains'
import { useBalance, useLockedFunds, useUnlockFunds } from '@/sdk/hooks'
import { formatTokenAmount, formatTimeRemaining, cn, shortenAddress } from '@/lib/utils'
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
  disabled,
}: {
  selectedToken: TokenConfig
  onLockedFundsClick: () => void
  onBalanceClick: () => void
  showLockedFunds?: boolean
  disabled?: boolean
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
    <div className={cn('flex gap-2', disabled && 'opacity-50')}>
      <button
        onClick={onBalanceClick}
        disabled={disabled}
        className={cn(
          'bg-muted flex flex-1 flex-col gap-2 rounded-[10px] p-5 text-left transition-colors',
          disabled ? 'cursor-not-allowed' : 'hover:bg-muted/80 cursor-pointer'
        )}
      >
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground text-sm">Balance</span>
            <span className="bg-secondary text-muted-foreground rounded-full px-2 py-[5px] text-[10px] font-bold">
              {selectedToken.symbol}
            </span>
          </div>
          <div className="text-muted-foreground flex h-6 w-6 items-center justify-center">
            <ChevronRight />
          </div>
        </div>
        <div className="text-foreground text-xl font-medium">
          {balanceLoading ? (
            <span className="bg-secondary inline-block h-6 w-24 animate-pulse rounded" />
          ) : (
            formattedBalance
          )}
        </div>
      </button>

      {showLockedFunds && (
        <button
          onClick={onLockedFundsClick}
          disabled={disabled}
          className={cn(
            'bg-muted flex flex-1 flex-col gap-2 rounded-[10px] p-5 text-left transition-colors',
            disabled ? 'cursor-not-allowed' : 'hover:bg-muted/80 cursor-pointer'
          )}
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1">
              <span className="text-muted-foreground text-sm">Locked Funds</span>
              <span className="bg-secondary text-muted-foreground rounded-full px-2 py-[5px] text-[10px] font-bold">
                {selectedToken.symbol}
              </span>
            </div>
            <div className="text-muted-foreground flex h-6 w-6 items-center justify-center">
              <ChevronRight />
            </div>
          </div>
          <div className="text-foreground text-xl font-medium">
            {lockedLoading ? (
              <span className="bg-secondary inline-block h-6 w-20 animate-pulse rounded" />
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
  disabled,
}: {
  activeTab: 'deposit' | 'withdraw'
  onTabChange: (tab: 'deposit' | 'withdraw') => void
  disabled?: boolean
}) {
  return (
    <div
      className={cn(
        'bg-muted relative flex gap-2 overflow-hidden rounded-[10px] p-1',
        disabled && 'opacity-50'
      )}
    >
      <div
        className={cn(
          'bg-input absolute top-1 bottom-1 left-1 w-[calc(50%-4px)] rounded-md transition-transform duration-200',
          activeTab === 'withdraw' && 'translate-x-[calc(100%+8px)]'
        )}
      />
      <button
        onClick={() => !disabled && onTabChange('deposit')}
        disabled={disabled}
        className={cn(
          'relative z-10 flex-1 rounded-md px-3 py-[9px] text-sm transition-colors',
          activeTab === 'deposit' ? 'text-foreground' : 'text-muted-foreground',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        )}
      >
        Deposit
      </button>
      <button
        onClick={() => !disabled && onTabChange('withdraw')}
        disabled={disabled}
        className={cn(
          'relative z-10 flex-1 rounded-md px-3 py-[9px] text-sm transition-colors',
          activeTab === 'withdraw' ? 'text-foreground' : 'text-muted-foreground',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
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
    lockId: number
    amount: string
    serviceAddress: string
    time: string
    isExpired: boolean
  }[]
}

function LockedFundsView({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
  const { locks, isLoading } = useLockedFunds()
  const { unlockFunds, unlockAllExpired, isPending } = useUnlockFunds()
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
        lockId: lock.lock_id,
        amount: formatTokenAmount(String(lock.amount), getTokenById(lock.token_id)?.decimals ?? 18),
        serviceAddress: lock.service_address,
        time: lock.is_expired ? 'Click to unlock' : formatTimeRemaining(lock.expiry),
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
            className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center transition-colors"
          >
            <ChevronLeft />
          </button>
          <span className="text-foreground text-xl leading-6 font-medium">Locked Funds</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center transition-colors"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="bg-muted flex min-h-0 flex-1 flex-col rounded-[10px] p-2">
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-2 p-3">
              {[1, 2].map((i) => (
                <div key={i} className="flex animate-pulse items-center gap-3 rounded-lg p-3">
                  <div className="bg-secondary h-10 w-10 rounded-full" />
                  <div className="flex-1">
                    <div className="bg-secondary mb-2 h-3.5 w-24 rounded" />
                    <div className="bg-secondary h-3 w-32 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : sections.length === 0 ? (
            <div className="flex items-center justify-center p-8">
              <span className="text-muted-foreground text-sm">No locked funds</span>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.title}>
                <button
                  onClick={() => toggleSection(section.title)}
                  className="text-muted-foreground hover:bg-secondary flex w-full cursor-pointer items-center justify-between rounded-lg px-4 py-4 transition-colors"
                >
                  <span className="text-sm">{section.title}</span>
                  <ChevronDown collapsed={collapsedSections[section.title]} />
                </button>

                {!collapsedSections[section.title] &&
                  section.items.map((item) => (
                    <div
                      key={`${item.serviceAddress}-${item.lockId}`}
                      className={cn(
                        'flex items-center justify-between gap-3 rounded-lg p-3',
                        item.isExpired && 'bg-secondary'
                      )}
                    >
                      <div className="flex flex-1 items-center gap-3">
                        <div className="bg-secondary h-10 w-10 rounded-full" />
                        <div className="flex flex-col gap-2">
                          <span className="text-foreground text-sm font-medium">
                            {item.amount} USDC
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Service: {shortenAddress(item.serviceAddress)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col items-end gap-2">
                        {item.isExpired ? (
                          <button
                            onClick={() => unlockFunds({ lockId: Number(item.lockId) })}
                            disabled={isPending}
                            className="text-foreground hover:text-foreground/80 cursor-pointer text-sm transition-colors disabled:opacity-50"
                          >
                            Click to unlock
                          </button>
                        ) : (
                          <span className="text-sm text-amber-500">{item.time}</span>
                        )}
                        <span className="text-muted-foreground text-xs">on Base Sepolia</span>
                      </div>
                    </div>
                  ))}
              </div>
            ))
          )}
        </div>

        {expiredCount > 0 && (
          <div className="p-3">
            <button
              onClick={() => unlockAllExpired()}
              disabled={isPending}
              className="border-border text-foreground hover:bg-secondary flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50"
            >
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
      <span className="text-foreground flex-1 text-sm">{token.symbol}</span>
      {isLoading ? (
        <span className="bg-secondary h-4 w-16 animate-pulse rounded" />
      ) : (
        <span className="text-muted-foreground text-sm">{formattedBalance}</span>
      )}
    </div>
  )
}

function BalanceDetailsView({ onBack, onClose }: { onBack: () => void; onClose?: () => void }) {
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
            className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center transition-colors"
          >
            <ChevronLeft />
          </button>
          <span className="text-foreground text-xl leading-6 font-medium">Token Balances</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center transition-colors"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <div className="bg-muted flex flex-1 flex-col overflow-hidden rounded-[10px] p-2">
          <div className="px-4 pt-4 pb-2">
            <span className="text-muted-foreground text-sm">Network</span>
          </div>
          <div className="mt-1 flex-1 overflow-y-auto">
            {SUPPORTED_CHAINS.map((chain) => {
              const isSelected = selectedChainId === chain.id

              return (
                <button
                  key={chain.id}
                  onClick={() => setSelectedChainId(chain.id)}
                  className={cn(
                    'hover:bg-secondary flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors',
                    isSelected && 'bg-secondary'
                  )}
                >
                  <div className="h-[18px] w-[18px] overflow-hidden rounded-full">
                    {getChainIcon(chain.id, 18)}
                  </div>
                  <span className="text-foreground flex-1 text-sm">{chain.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="bg-muted flex flex-[2] flex-col overflow-hidden rounded-[10px] p-2">
          <div className="px-4 pt-4 pb-2">
            <span className="text-muted-foreground text-sm">Token Balance</span>
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
        'hover:bg-secondary flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors',
        isSelected && 'bg-secondary'
      )}
    >
      <div className="h-[18px] w-[18px] overflow-hidden rounded-full">
        {getTokenIcon(token.symbol, 18)}
      </div>
      <span className="text-foreground flex-1 text-sm">{token.symbol}</span>
      <span className="text-muted-foreground text-sm">{formattedBalance}</span>
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
  const { enabledTokens } = useFlexvaultsContext()

  const enabledTokenIds = useMemo(() => new Set(enabledTokens.map((t) => t.id)), [enabledTokens])

  const selectedChain = useMemo(() => {
    return SUPPORTED_CHAINS.find((c) => c.id === selectedChainId)
  }, [selectedChainId])

  const chainTokens = useMemo(() => {
    return (selectedChain?.tokens ?? []).filter((t) => enabledTokenIds.has(t.id))
  }, [selectedChain, enabledTokenIds])

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
            className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center transition-colors"
          >
            <ChevronLeft />
          </button>
          <span className="text-foreground text-xl leading-6 font-medium">Select Token</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center transition-colors"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <div className="bg-muted flex flex-1 flex-col overflow-hidden rounded-[10px] p-2">
          <div className="px-4 pt-4 pb-2">
            <span className="text-muted-foreground text-sm">Network</span>
          </div>
          <div className="mt-1 flex-1 overflow-y-auto">
            {SUPPORTED_CHAINS.map((chain) => {
              const isSelected = selectedChainId === chain.id

              return (
                <button
                  key={chain.id}
                  onClick={() => setSelectedChainId(chain.id)}
                  className={cn(
                    'hover:bg-secondary flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors',
                    isSelected && 'bg-secondary'
                  )}
                >
                  <div className="h-[18px] w-[18px] overflow-hidden rounded-full">
                    {getChainIcon(chain.id, 18)}
                  </div>
                  <span className="text-foreground flex-1 text-sm">{chain.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="bg-muted flex flex-[2] flex-col overflow-hidden rounded-[10px] p-2">
          <div className="flex flex-col gap-1">
            <div className="px-4 pt-4 pb-2">
              <span className="text-muted-foreground text-sm">Token</span>
            </div>
            <div className="px-3">
              <div className="border-border bg-input flex items-center gap-2.5 rounded-lg border px-3 py-2.5">
                <span className="text-muted-foreground">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  placeholder="Search"
                  value={tokenSearch}
                  onChange={(e) => setTokenSearch(e.target.value)}
                  className="text-foreground placeholder:text-muted-foreground flex-1 bg-transparent text-sm outline-none"
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
  onTransactionPendingChange?: (isPending: boolean) => void
  showLockedFunds?: boolean
  defaultTab?: 'deposit' | 'withdraw'
  onDepositSuccess?: () => void
}

function ModalBody({
  onClose,
  onViewChange,
  onTransactionPendingChange,
  showLockedFunds = true,
  defaultTab = 'deposit',
  onDepositSuccess,
}: ModalBodyProps) {
  const { defaultToken } = useFlexvaultsContext()
  const [selectedToken, setSelectedToken] = useState<TokenConfig>(defaultToken)
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>(defaultTab)
  const [currentView, setCurrentView] = useState<ModalView>('main')
  const [isTransactionPending, setIsTransactionPending] = useState(false)

  const handleTransactionPendingChange = (isPending: boolean) => {
    setIsTransactionPending(isPending)
    onTransactionPendingChange?.(isPending)
  }

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
    return <BalanceDetailsView onBack={() => handleViewChange('main')} onClose={onClose} />
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
      <div className="flex flex-col gap-2 pb-4">
        <div className={cn(isTransactionPending && 'pointer-events-none')}>
          <BalanceCards
            selectedToken={selectedToken}
            onLockedFundsClick={() => handleViewChange('locked-funds')}
            onBalanceClick={() => handleViewChange('balance-details')}
            showLockedFunds={showLockedFunds}
            disabled={isTransactionPending}
          />
        </div>

        <div className={cn(isTransactionPending && 'pointer-events-none')}>
          <Tabs activeTab={activeTab} onTabChange={setActiveTab} disabled={isTransactionPending} />
        </div>

        <div className="bg-muted rounded-[10px] p-5">
          {activeTab === 'deposit' ? (
            <DepositForm
              selectedToken={selectedToken}
              onTokenSelect={() => handleViewChange('select-token')}
              onPendingChange={handleTransactionPendingChange}
              onSuccess={onDepositSuccess}
            />
          ) : (
            <WithdrawForm
              selectedToken={selectedToken}
              onTokenSelect={() => handleViewChange('select-token')}
              onPendingChange={handleTransactionPendingChange}
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
  defaultTab?: 'deposit' | 'withdraw'
  onDepositSuccess?: () => void
}

export function FlexvaultsModal({
  open,
  onClose,
  showLockedFunds,
  defaultTab,
  onDepositSuccess,
}: FlexvaultsModalProps) {
  const [isTransactionPending, setIsTransactionPending] = useState(false)
  const titleId = useId()
  const descId = useId()

  const handleOpenChange = (isOpen: boolean) => {
    // Block closing if a transaction is pending
    if (!isOpen && isTransactionPending) {
      return
    }
    if (!isOpen) {
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        data-flexvaults
        showCloseButton={false}
        className="bg-card flex w-[560px] max-w-[95vw] flex-col gap-2 overflow-hidden rounded-2xl border-0 p-2"
        overlayClassName={isTransactionPending ? 'cursor-not-allowed' : undefined}
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <DialogHeader>
          <DialogTitle id={titleId} className="sr-only">
            Flexvaults
          </DialogTitle>
          <DialogDescription id={descId} className="sr-only">
            Deposit or withdraw tokens from your Flexvault
          </DialogDescription>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-foreground text-xl leading-6 font-medium">Flexvaults</span>
            {onClose && (
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground flex h-6 w-6 cursor-pointer items-center justify-center transition-colors"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        </DialogHeader>
        <ModalBody
          onClose={isTransactionPending ? undefined : onClose}
          onTransactionPendingChange={setIsTransactionPending}
          showLockedFunds={showLockedFunds}
          defaultTab={defaultTab}
          onDepositSuccess={onDepositSuccess}
        />
      </DialogContent>
    </Dialog>
  )
}

export function FlexvaultsInlineModal({
  className,
  showLockedFunds,
  defaultTab,
  onDepositSuccess,
}: {
  className?: string
  showLockedFunds?: boolean
  defaultTab?: 'deposit' | 'withdraw'
  onDepositSuccess?: () => void
}) {
  return (
    <div
      data-flexvaults
      className={cn(
        'bg-card flex w-[560px] max-w-full flex-col gap-2 overflow-hidden rounded-2xl p-2 shadow-lg',
        className
      )}
    >
      <ModalBody
        showLockedFunds={showLockedFunds}
        defaultTab={defaultTab}
        onDepositSuccess={onDepositSuccess}
      />
    </div>
  )
}
