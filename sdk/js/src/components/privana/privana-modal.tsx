'use client'

import { useState, useMemo, useEffect, useId } from 'react'
import { useAccount, useBalance as useWagmiBalance, useReadContract } from 'wagmi'
import { erc20Abi, zeroAddress } from 'viem'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DepositForm } from './deposit-form'
import { WithdrawForm } from './withdraw-form'
import type { TokenConfig } from '@/sdk/types/tokens'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { useBalance, useLockedFunds, useUnlockFunds } from '@/sdk/hooks'
import { formatTokenAmount, formatTimeRemaining, cn, shortenAddress } from '@/lib/utils'
import { getTokenIcon, getChainIcon } from './token-icons'
import { CloseIcon, ChevronRightIcon, ChevronLeftIcon, ChevronDownIcon } from './icons'

type ModalView = 'main' | 'locked-funds' | 'select-token' | 'balance-details'

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
    : '0.00'

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
            <ChevronRightIcon />
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
              <ChevronRightIcon />
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
          'bg-input absolute top-1 bottom-1 left-1 w-[calc(50%-8px)] rounded-md transition-transform duration-200',
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

function LockedFundsView({ onBack }: { onBack: () => void }) {
  const { getTokenById } = usePrivanaContext()
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
  }, [getTokenById, locks])

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
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground -ml-2 flex h-6 w-6 cursor-pointer items-center justify-center transition-colors"
          >
            <ChevronLeftIcon />
          </button>
          <span className="text-foreground text-xl leading-6 font-medium">Locked Funds</span>
        </div>
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
                  <ChevronDownIcon collapsed={collapsedSections[section.title]} />
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

function BalanceDetailsView({ onBack }: { onBack: () => void }) {
  const { enabledTokens, chains } = usePrivanaContext()
  const [selectedChainId, setSelectedChainId] = useState<number>(chains[0]?.id ?? 84532)

  const chainTokens = useMemo(() => {
    return enabledTokens.filter((t) => t.chainId === selectedChainId)
  }, [enabledTokens, selectedChainId])

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground -ml-2 flex h-6 w-6 cursor-pointer items-center justify-center transition-colors"
          >
            <ChevronLeftIcon />
          </button>
          <span className="text-foreground text-xl leading-6 font-medium">Token Balances</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <div className="bg-muted flex flex-1 flex-col overflow-hidden rounded-[10px] p-2">
          <div className="px-4 pt-4 pb-2">
            <span className="text-muted-foreground text-sm">Network</span>
          </div>
          <div className="mt-1 flex-1 overflow-y-auto">
            {chains.map((chain) => {
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
  const isNative = token.contract === zeroAddress

  const { data: nativeBalanceData } = useWagmiBalance({
    address,
    chainId: token.chainId,
    query: { enabled: !!address && isNative },
  })
  const { data: erc20Balance } = useReadContract({
    address: token.contract as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: token.chainId,
    query: { enabled: !!address && !isNative },
  })
  const walletBalance = isNative ? nativeBalanceData?.value : erc20Balance

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
  onSelect,
  selectedTokenId,
}: {
  onBack: () => void
  onSelect: (token: TokenConfig) => void
  selectedTokenId?: string
}) {
  const { enabledTokens, chains } = usePrivanaContext()
  const [selectedChainId, setSelectedChainId] = useState<number>(chains[0]?.id ?? 84532)

  const chainTokens = useMemo(() => {
    return enabledTokens.filter((t) => t.chainId === selectedChainId)
  }, [enabledTokens, selectedChainId])

  const handleTokenSelect = (token: TokenConfig) => {
    onSelect(token)
    onBack()
  }

  return (
    <>
      <div className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-muted-foreground hover:text-foreground -ml-2 flex h-6 w-6 cursor-pointer items-center justify-center transition-colors"
          >
            <ChevronLeftIcon />
          </button>
          <span className="text-foreground text-xl leading-6 font-medium">Select Token</span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-2">
        <div className="bg-muted flex flex-1 flex-col overflow-hidden rounded-[10px] p-2">
          <div className="px-4 pt-4 pb-2">
            <span className="text-muted-foreground text-sm">Network</span>
          </div>
          <div className="mt-1 flex-1 overflow-y-auto">
            {chains.map((chain) => {
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
            <span className="text-muted-foreground text-sm">Token</span>
          </div>
          <div className="mt-2 flex-1 overflow-y-auto">
            {chainTokens.map((token) => (
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
  onViewChange?: (view: ModalView) => void
  onCloseBlockedChange?: (isBlocked: boolean) => void
  showLockedFunds?: boolean
  defaultTab?: 'deposit' | 'withdraw'
  onDepositSuccess?: () => void
}

function ModalBody({
  onViewChange,
  onCloseBlockedChange,
  showLockedFunds = true,
  defaultTab = 'deposit',
  onDepositSuccess,
}: ModalBodyProps) {
  const { defaultToken, tokensStatus } = usePrivanaContext()
  const [selectedToken, setSelectedToken] = useState<TokenConfig | undefined>(defaultToken)
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>(defaultTab)
  const [currentView, setCurrentView] = useState<ModalView>('main')
  const [isInteractionPending, setIsInteractionPending] = useState(false)

  // Sync selectedToken once tokens finish loading
  useEffect(() => {
    if (!selectedToken && defaultToken) {
      setSelectedToken(defaultToken)
    }
  }, [selectedToken, defaultToken])

  const handlePendingChange = (isPending: boolean) => {
    setIsInteractionPending(isPending)
  }

  const handleCloseBlockedChange = (isBlocked: boolean) => {
    onCloseBlockedChange?.(isBlocked)
  }

  const handleViewChange = (view: ModalView) => {
    const update = () => {
      setCurrentView(view)
      onViewChange?.(view)
    }
    if (typeof document !== 'undefined' && typeof document.startViewTransition === 'function') {
      document.documentElement.dataset.privanaVtDir = view === 'main' ? 'back' : 'forward'
      const transition = document.startViewTransition(update)
      transition.finished.then(() => {
        delete document.documentElement.dataset.privanaVtDir
      })
    } else {
      update()
    }
  }

  const handleTokenSelect = (token: TokenConfig) => {
    setSelectedToken(token)
  }

  if (tokensStatus === 'loading' || !selectedToken) {
    return (
      <div className="flex flex-col gap-2">
        <div className="bg-secondary h-25 animate-pulse rounded-[10px]" />
        <div className="bg-secondary h-11 animate-pulse rounded-[10px]" />
        <div className="bg-secondary h-50 animate-pulse rounded-[10px]" />
      </div>
    )
  }

  if (currentView === 'locked-funds') {
    return <LockedFundsView onBack={() => handleViewChange('main')} />
  }

  if (currentView === 'balance-details') {
    return <BalanceDetailsView onBack={() => handleViewChange('main')} />
  }

  if (currentView === 'select-token') {
    return (
      <TokenSelectorView
        onBack={() => handleViewChange('main')}
        onSelect={handleTokenSelect}
        selectedTokenId={selectedToken.id}
      />
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2 pb-4">
        <div className={cn(isInteractionPending && 'pointer-events-none')}>
          <BalanceCards
            selectedToken={selectedToken}
            onLockedFundsClick={() => handleViewChange('locked-funds')}
            onBalanceClick={() => handleViewChange('balance-details')}
            showLockedFunds={showLockedFunds}
            disabled={isInteractionPending}
          />
        </div>

        <div className={cn(isInteractionPending && 'pointer-events-none')}>
          <Tabs activeTab={activeTab} onTabChange={setActiveTab} disabled={isInteractionPending} />
        </div>

        <div className="bg-muted rounded-[10px] p-5">
          {activeTab === 'deposit' ? (
            <DepositForm
              selectedToken={selectedToken}
              onTokenSelect={() => handleViewChange('select-token')}
              onPendingChange={handlePendingChange}
              onUnsafeToCloseChange={handleCloseBlockedChange}
              onSuccess={onDepositSuccess}
            />
          ) : (
            <WithdrawForm
              selectedToken={selectedToken}
              onTokenSelect={() => handleViewChange('select-token')}
              onPendingChange={handlePendingChange}
              onUnsafeToCloseChange={handleCloseBlockedChange}
            />
          )}
        </div>
      </div>
    </>
  )
}

interface PrivanaModalProps {
  open: boolean
  onClose: () => void
  showLockedFunds?: boolean
  defaultTab?: 'deposit' | 'withdraw'
  onDepositSuccess?: () => void
}

export function PrivanaModal({
  open,
  onClose,
  showLockedFunds,
  defaultTab,
  onDepositSuccess,
}: PrivanaModalProps) {
  const [currentView, setCurrentView] = useState<ModalView>('main')
  const titleId = useId()
  const descId = useId()
  const [isCloseBlocked, setIsCloseBlocked] = useState(false)

  const handleClose = () => {
    if (!isCloseBlocked) onClose()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleClose()
      }}
    >
      <DialogContent
        data-privana
        data-view={currentView}
        showCloseButton={false}
        onInteractOutside={isCloseBlocked ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={isCloseBlocked ? (e) => e.preventDefault() : undefined}
        className="bg-card flex h-[596px] max-h-[95dvh] w-[560px] max-w-[95vw] flex-col gap-2 overflow-hidden rounded-2xl border-0 p-2 pb-[2.75rem]"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <button
          data-privana-close
          onClick={handleClose}
          disabled={isCloseBlocked}
          aria-label="Close"
          className={cn(
            'absolute top-6 right-5 z-20 flex h-6 w-6 items-center justify-center transition-colors',
            isCloseBlocked
              ? 'text-muted-foreground/40 cursor-not-allowed'
              : 'text-muted-foreground hover:text-foreground cursor-pointer'
          )}
        >
          <CloseIcon />
        </button>
        <div
          data-privana-content
          data-view={currentView}
          className="flex min-h-0 flex-1 flex-col gap-2"
        >
          <DialogTitle id={titleId} className="sr-only">
            Privana
          </DialogTitle>
          <DialogDescription id={descId} className="sr-only">
            Deposit or withdraw tokens from your Privana
          </DialogDescription>
          {currentView === 'main' && (
            <DialogHeader>
              <div className="flex items-center px-5 py-4">
                <span className="text-foreground text-xl leading-6 font-medium">Privana</span>
              </div>
            </DialogHeader>
          )}
          <ModalBody
            onCloseBlockedChange={setIsCloseBlocked}
            onViewChange={setCurrentView}
            showLockedFunds={showLockedFunds}
            defaultTab={defaultTab}
            onDepositSuccess={onDepositSuccess}
          />
        </div>
        <a
          data-privana-footer
          href="https://privana.finance"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Powered by Privana"
        />
      </DialogContent>
    </Dialog>
  )
}

export function PrivanaInlineModal({
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
      data-privana
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
