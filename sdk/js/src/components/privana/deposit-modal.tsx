'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useAccount, useBalance, useReadContract } from 'wagmi'
import { erc20Abi, zeroAddress } from 'viem'
import { QRCodeSVG } from 'qrcode.react'
import { MoonPayProvider } from '@moonpay/moonpay-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { TokenConfig } from '@/sdk/types/tokens'
import type { Allowance, AllowanceTerm } from '@/sdk/types/allowance'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { useDepositAddress } from '@/sdk/hooks'
import { useMoonpayLimits } from '@/sdk/hooks/use-moonpay-limits'
import { cn, formatTokenAmount, parseTokenAmount } from '@/lib/utils'
import { getTokenIcon } from './token-icons'
import { TokenSelectorView } from './token-selector-view'
import { CreditCardWidgetView } from './credit-card-widget-view'
import {
  CloseIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ChevronDownIcon,
  CopyIcon,
  CircleCheckIcon,
  CircleXIcon,
  ArrowRightIcon,
} from './icons'
import { PrivanaIcon } from './privana-icon'

type DepositMethodTab = 'crypto' | 'credit-card'

// Mounting MoonPayProvider injects MoonPay's web-sdk script from their CDN, so
// it wraps only the credit-card subtree instead of the app root — the other
// deposit flows never pay that cost. Without `networkConfig.moonpayApiKey` the
// children render bare and the credit-card flow stays fail-closed (purchase
// limits never load, so the deposit button stays disabled).
function MoonPayGate({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const { networkConfig } = usePrivanaContext()
  const apiKey = networkConfig.moonpayApiKey
  if (!enabled || !apiKey) return <>{children}</>
  return <MoonPayProvider apiKey={apiKey}>{children}</MoonPayProvider>
}

export type DepositSource = 'connected' | 'external' | 'credit-card'

type DepositView = 'method' | 'deposit' | 'select-token' | 'external-deposit' | 'credit-card-widget'

function MethodTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: DepositMethodTab
  onTabChange: (tab: DepositMethodTab) => void
}) {
  return (
    <div className="bg-secondary relative flex gap-2 overflow-hidden rounded-[10px] p-1">
      <div
        className={cn(
          'bg-input absolute top-1 bottom-1 left-1 w-[calc(50%-8px)] rounded-md transition-transform duration-200',
          activeTab === 'credit-card' && 'translate-x-[calc(100%+8px)]'
        )}
      />
      <button
        type="button"
        onClick={() => onTabChange('crypto')}
        className={cn(
          'relative z-10 flex-1 cursor-pointer rounded-md px-3 py-[9px] text-sm font-medium transition-colors',
          activeTab === 'crypto' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Crypto
      </button>
      <button
        type="button"
        onClick={() => onTabChange('credit-card')}
        className={cn(
          'relative z-10 flex-1 cursor-pointer rounded-md px-3 py-[9px] text-sm font-medium transition-colors',
          activeTab === 'credit-card' ? 'text-foreground' : 'text-muted-foreground'
        )}
      >
        Credit Card
      </button>
    </div>
  )
}

function MethodOption({
  title,
  description,
  onClick,
}: {
  title: string
  description: string
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bg-input hover:bg-input/70 border-border flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left transition-colors"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-foreground text-sm leading-[14px] font-medium">{title}</span>
        <span className="text-muted-foreground text-xs leading-3">{description}</span>
      </div>
      <div className="text-muted-foreground flex h-5 w-5 items-center justify-center">
        <ChevronRightIcon />
      </div>
    </button>
  )
}

function PolicyTermRow({
  term,
  kind,
}: {
  term: AllowanceTerm
  kind: 'permission' | 'restriction'
}) {
  return (
    <div className="flex gap-2">
      <div
        className={cn(
          'mt-0.5 shrink-0',
          kind === 'permission' ? 'text-emerald-500' : 'text-orange-500'
        )}
      >
        {kind === 'permission' ? <CircleCheckIcon /> : <CircleXIcon />}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-foreground text-sm leading-5 font-medium">{term.title}</span>
        <span className="text-muted-foreground text-sm leading-5">{term.description}</span>
      </div>
    </div>
  )
}

function AllowancePolicySection({
  allowance,
  serviceName,
  serviceIcon,
}: {
  allowance: Allowance
  serviceName: string
  serviceIcon?: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const permissions = allowance.terms?.permissions ?? []
  const restrictions = allowance.terms?.restrictions ?? []
  const hasTerms = permissions.length > 0 || restrictions.length > 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg">
          {serviceIcon}
        </div>
        <ArrowRightIcon className="text-muted-foreground" />
        <PrivanaIcon size={32} />
      </div>

      <p className="text-sm leading-5">
        <span className="text-foreground font-medium">{serviceName}</span>{' '}
        <span className="text-muted-foreground">wants a policy on your Privana account.</span>
      </p>

      {hasTerms && (
        <>
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            className="flex w-full cursor-pointer items-center gap-2"
          >
            <span className="bg-border h-px flex-1" />
            <span className="text-muted-foreground text-[10px] leading-[14px] font-medium tracking-[0.2px] whitespace-nowrap uppercase">
              {collapsed ? 'Show details' : 'Hide details'}
            </span>
            <ChevronDownIcon
              direction={collapsed ? 'down' : 'up'}
              className="text-foreground shrink-0"
            />
            <span className="bg-border h-px flex-1" />
          </button>

          {!collapsed && (
            <div className="flex flex-col gap-4">
              {permissions.map((term, i) => (
                <PolicyTermRow key={`permission-${i}`} term={term} kind="permission" />
              ))}
              {restrictions.map((term, i) => (
                <PolicyTermRow key={`restriction-${i}`} term={term} kind="restriction" />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DepositView({
  source,
  selectedToken,
  amount,
  allowance,
  onAmountChange,
  onSelectToken,
  onSubmit,
}: {
  source: DepositSource
  selectedToken: TokenConfig | undefined
  amount: string
  allowance?: Allowance
  onAmountChange: (value: string) => void
  onSelectToken: () => void
  onSubmit?: (args: { source: DepositSource; tokenId: string; amount: string }) => void
}) {
  const { getChainById, chains, serviceName, serviceIcon, networkConfig } = usePrivanaContext()
  const { address, isConnected } = useAccount()
  const appName = serviceName ?? 'Privana'
  const chain = selectedToken ? getChainById(selectedToken.chainId) : undefined
  const targetChain = chain ?? chains[0]
  const sourceLabel = source === 'connected' ? 'Connected Wallet' : 'External Wallet'
  const isConnectedSource = source === 'connected'
  const isCreditCard = source === 'credit-card'
  const isNative = selectedToken?.contract === zeroAddress
  const { data: nativeBalanceData } = useBalance({
    address,
    chainId: targetChain?.id,
    query: { enabled: isConnectedSource && !!address && !!selectedToken && isNative },
  })
  const { data: erc20Balance } = useReadContract({
    address: selectedToken?.contract as `0x${string}` | undefined,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: targetChain?.id,
    query: { enabled: isConnectedSource && !!address && !!selectedToken && !isNative },
  })
  const walletBalance = isNative ? nativeBalanceData?.value : erc20Balance
  const formattedWalletBalance =
    walletBalance != null && selectedToken
      ? formatTokenAmount(walletBalance.toString(), selectedToken.decimals)
      : '0.00'

  // The credit-card amount is a fiat value (MoonPay's baseCurrencyAmount); gate it
  // against MoonPay's minimum here so the user can't sign the policy for an amount
  // MoonPay would reject once the widget opens.
  const {
    minBuyAmount: moonpayMinBuy,
    isLoading: moonpayLimitsLoading,
    error: moonpayLimitsError,
  } = useMoonpayLimits({
    currencyCode: selectedToken?.moonpayCurrencyCode,
    apiBaseUrl: networkConfig.moonpayApiUrl,
    enabled: isCreditCard,
  })

  const hasValidAmount = !!amount && parseFloat(amount) > 0
  // The credit-card amount is fiat USD (MoonPay's baseCurrencyAmount, max 2
  // decimals); other sources take a token amount capped by the token's decimals.
  const maxAmountDecimals = isCreditCard ? 2 : selectedToken?.decimals
  const tooManyDecimals =
    hasValidAmount &&
    maxAmountDecimals != null &&
    amount.includes('.') &&
    amount.split('.')[1].length > maxAmountDecimals
  const exceedsBalance =
    isConnectedSource &&
    hasValidAmount &&
    !tooManyDecimals &&
    !!selectedToken &&
    walletBalance != null &&
    parseTokenAmount(amount, selectedToken.decimals) > walletBalance
  const belowMoonpayMin =
    isCreditCard && hasValidAmount && moonpayMinBuy != null && parseFloat(amount) < moonpayMinBuy
  const moonpayLimitsUnready =
    isCreditCard && !!selectedToken?.moonpayCurrencyCode && moonpayMinBuy == null
  const needsConnect = isConnectedSource && !isConnected

  const canDeposit =
    hasValidAmount &&
    !!selectedToken &&
    !tooManyDecimals &&
    !exceedsBalance &&
    !belowMoonpayMin &&
    !moonpayLimitsUnready &&
    !needsConnect

  const handleMax = () => {
    const max = formattedWalletBalance.replace(/\s/g, '')
    if (parseFloat(max) > 0) onAmountChange(max)
  }

  return (
    <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      {isCreditCard ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-foreground text-[28px] leading-8 font-medium">
            Buy with credit card and deposit
          </h2>
          <p className="text-muted-foreground text-sm">
            Enter your deposit amount and proceed to sign a policy.
          </p>
        </div>
      ) : (
        <h2 className="text-foreground text-[28px] leading-8 font-medium">
          Deposit from {sourceLabel}
        </h2>
      )}

      <div className="flex flex-col gap-3">
        <label className="text-muted-foreground text-sm">Token</label>
        <button
          type="button"
          onClick={onSelectToken}
          className="border-border bg-input flex w-full cursor-pointer items-center gap-3 rounded-lg border p-3 text-left"
        >
          {selectedToken ? (
            <>
              <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
                {getTokenIcon(selectedToken.symbol, 32)}
              </div>
              <div className="flex flex-1 flex-col items-start gap-1">
                <span className="text-foreground text-sm font-medium">{selectedToken.symbol}</span>
                <span className="text-muted-foreground text-xs">on {chain?.name ?? '—'}</span>
              </div>
            </>
          ) : (
            <span className="text-muted-foreground flex-1 text-sm">Select token</span>
          )}
          <div className="text-muted-foreground flex h-5 w-5 items-center justify-center">
            <ChevronRightIcon />
          </div>
        </button>
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="text-muted-foreground text-sm">Amount</label>
          {isConnectedSource && (
            <span className="text-muted-foreground text-sm">
              Available {formattedWalletBalance} {selectedToken?.symbol}
            </span>
          )}
        </div>
        <div
          className={cn(
            'border-border bg-input flex items-center gap-2 rounded-[10px] border',
            isConnectedSource ? 'py-1 pr-1 pl-3' : 'px-3 py-3'
          )}
        >
          <input
            type="text"
            inputMode="decimal"
            placeholder="Enter Amount"
            value={amount}
            onChange={(e) => {
              const value = e.target.value.replace(/[^0-9.,]/g, '').replace(/,/g, '.')
              if (value.split('.').length <= 2) onAmountChange(value)
            }}
            className="text-foreground placeholder:text-muted-foreground/50 flex-1 bg-transparent text-sm outline-none"
          />
          {isConnectedSource ? (
            <button
              type="button"
              onClick={handleMax}
              className="bg-secondary text-foreground hover:bg-secondary/80 cursor-pointer rounded px-3 py-2.5 text-xs font-semibold transition-colors"
            >
              MAX
            </button>
          ) : isCreditCard ? (
            <span className="text-muted-foreground text-sm">USD</span>
          ) : (
            selectedToken && (
              <span className="text-muted-foreground text-sm">{selectedToken.symbol}</span>
            )
          )}
        </div>
        {tooManyDecimals && (
          <p className="text-destructive text-sm">
            Too many decimal places (max: {maxAmountDecimals})
          </p>
        )}
        {exceedsBalance && <p className="text-destructive text-sm">Insufficient balance</p>}
        {belowMoonpayMin && moonpayMinBuy != null && (
          <p className="text-destructive text-sm">Minimum purchase is ${moonpayMinBuy} USD.</p>
        )}
        {isCreditCard && moonpayLimitsError && (
          <p className="text-destructive text-sm">
            Couldn’t load purchase limits. Please try again.
          </p>
        )}
        {isCreditCard && moonpayLimitsLoading && (
          <p className="text-muted-foreground text-sm">Checking purchase limits…</p>
        )}
      </div>

      {allowance && (
        <AllowancePolicySection
          allowance={allowance}
          serviceName={appName}
          serviceIcon={serviceIcon}
        />
      )}

      <button
        type="button"
        disabled={!canDeposit}
        onClick={() => selectedToken && onSubmit?.({ source, tokenId: selectedToken.id, amount })}
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {needsConnect ? 'Connect Wallet' : allowance ? 'Sign Policy and Deposit' : 'Deposit'}
      </button>
    </div>
  )
}

function SummaryRow({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex items-center justify-between text-sm leading-5">
      <span className="text-foreground font-medium">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}

function ExternalDepositView({
  token,
  amount,
}: {
  token: TokenConfig | undefined
  amount: string
}) {
  const { getChainById } = usePrivanaContext()
  const { depositAddress, isReady, isLoading } = useDepositAddress()
  const chain = token ? getChainById(token.chainId) : undefined
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (!depositAddress) return
    void navigator.clipboard.writeText(depositAddress)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      <div className="flex flex-col gap-2">
        <h2 className="text-foreground text-[28px] leading-8 font-medium">
          Deposit from an External Wallet
        </h2>
        <p className="text-muted-foreground text-sm">
          Transfer crypto from external wallet or exchange.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <SummaryRow value={chain?.name ?? '—'} label="Chain" />
        <div className="bg-border h-px w-full" />
        <SummaryRow value={token?.symbol ?? '—'} label="Currency" />
        <div className="bg-border h-px w-full" />
        <SummaryRow value={amount || '—'} label="Value" />
      </div>

      <div className="bg-secondary flex h-50 items-center justify-center rounded-[10px]">
        {!isReady ? (
          <p className="text-muted-foreground px-6 text-center text-sm">
            Connect your wallet to generate a deposit address.
          </p>
        ) : depositAddress ? (
          <div className="rounded-[10px] bg-white p-3">
            <QRCodeSVG value={depositAddress} size={160} />
          </div>
        ) : isLoading ? (
          <Skeleton className="h-full w-full rounded-[10px]" />
        ) : (
          <span className="text-muted-foreground text-sm">Deposit address unavailable</span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-muted-foreground text-sm">Deposit Address</p>
        <div className="flex items-center gap-3">
          <div className="border-border flex h-10 min-w-0 flex-1 items-center rounded-[10px] border px-3">
            {depositAddress ? (
              <p className="text-foreground min-w-0 flex-1 truncate text-sm">{depositAddress}</p>
            ) : isReady && isLoading ? (
              <Skeleton className="h-4 w-3/4" />
            ) : (
              <p className="text-muted-foreground text-sm">—</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleCopy}
            disabled={!depositAddress}
            className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-[10px] px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CopyIcon />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Awaiting-deposit + refresh-status intentionally omitted for now. */}
    </div>
  )
}

interface DepositMethodHandlers {
  defaultTab?: DepositMethodTab
  /** Allowance (shown as a "policy") the host service requests. */
  allowance?: Allowance
  onSelectConnectedWallet?: () => void
  onSelectExternalWallet?: () => void
  onSelectCreditCard?: () => void
  /** Called when the user confirms the amount on the deposit view. */
  onDeposit?: (args: { source: DepositSource; tokenId: string; amount: string }) => void
}

function DepositModalContent({
  defaultTab = 'crypto',
  allowance,
  onSelectConnectedWallet,
  onSelectExternalWallet,
  onSelectCreditCard,
  onDeposit,
  onClose,
}: DepositMethodHandlers & { onClose?: () => void }) {
  const { serviceName, enabledTokens, defaultToken, hostedAuthConfig } = usePrivanaContext()
  const { address } = useAccount()
  const appName = serviceName ?? 'Privana'
  const [activeTab, setActiveTab] = useState<DepositMethodTab>(defaultTab)
  const [view, setView] = useState<DepositView>('method')
  const [source, setSource] = useState<DepositSource>('connected')
  const [selectedTokenId, setSelectedTokenId] = useState(defaultToken?.id ?? '')
  const [amount, setAmount] = useState('')

  const selectedToken = enabledTokens.find((t) => t.id === selectedTokenId) ?? defaultToken

  const prevAddressRef = useRef(address)
  useEffect(() => {
    const prev = prevAddressRef.current
    prevAddressRef.current = address
    if (hostedAuthConfig) return
    if (prev && address && prev !== address) {
      setView('method')
      setAmount('')
      setSelectedTokenId('')
    }
  }, [address, hostedAuthConfig])

  const openDeposit = (next: DepositSource) => {
    setSource(next)
    setView('deposit')
  }

  const handleSubmit = (args: { source: DepositSource; tokenId: string; amount: string }) => {
    if (args.source === 'external') {
      setView('external-deposit')
      return
    }
    if (args.source === 'credit-card') {
      // TODO: sign the DepositLockAuthorization (maxAmount=allowance.value, minAmount,
      // lockDuration) via useFiatOnRamp's postDepositLock once the deposit-lock-authorization
      // branch lands. Until then we just advance to the embedded MoonPay widget.
      setView('credit-card-widget')
      return
    }
    onDeposit?.(args)
  }

  const back =
    view === 'external-deposit'
      ? { to: 'deposit' as const, label: 'Deposit from External Wallet' }
      : view === 'credit-card-widget'
        ? { to: 'deposit' as const, label: 'Buy with credit card and deposit' }
        : view === 'select-token'
          ? { to: 'deposit' as const, label: 'Deposit' }
          : { to: 'method' as const, label: 'Deposit Method' }

  const goBack = () => {
    if (back.to === 'method') {
      setAmount('')
      setSelectedTokenId('')
    }
    setView(back.to)
  }

  return (
    <>
      {onClose && (
        <button
          data-privana-close
          onClick={onClose}
          aria-label="Close"
          className="text-muted-foreground hover:text-foreground absolute top-6 right-5 z-20 flex h-5 w-5 cursor-pointer items-center justify-center transition-colors"
        >
          <CloseIcon />
        </button>
      )}

      {view === 'method' ? (
        <div className="flex items-center px-5 py-4">
          <span className="text-foreground text-xl leading-5 font-medium">{appName}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={goBack}
          className="text-foreground flex w-fit cursor-pointer items-center gap-2 px-5 py-4 text-sm font-medium transition-opacity hover:opacity-70"
        >
          <ChevronLeftIcon />
          {back.label}
        </button>
      )}

      {view === 'method' && (
        <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
          <div className="flex flex-col gap-2">
            <h2 className="text-foreground text-[28px] leading-8 font-medium">
              {activeTab === 'crypto'
                ? 'Choose the deposit method'
                : 'Buy with credit card and deposit'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {activeTab === 'crypto'
                ? 'Choose the deposit method.'
                : 'Use credit card to buy crypto and deposit'}
            </p>
          </div>

          <MethodTabs activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === 'crypto' ? (
            <div className="flex flex-col gap-3">
              <MethodOption
                title="Connected wallet"
                description="Deposit from your connected wallet."
                onClick={() => {
                  onSelectConnectedWallet?.()
                  openDeposit('connected')
                }}
              />
              <MethodOption
                title="External Wallet"
                description="Send funds from external wallet or exchange."
                onClick={() => {
                  onSelectExternalWallet?.()
                  openDeposit('external')
                }}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <MethodOption
                title="Moonpay"
                description="on selected address"
                onClick={() => {
                  onSelectCreditCard?.()
                  openDeposit('credit-card')
                }}
              />
            </div>
          )}
        </div>
      )}

      {view === 'deposit' && (
        <MoonPayGate enabled={source === 'credit-card'}>
          <DepositView
            source={source}
            selectedToken={selectedToken}
            amount={amount}
            allowance={allowance}
            onAmountChange={setAmount}
            onSelectToken={() => setView('select-token')}
            onSubmit={handleSubmit}
          />
        </MoonPayGate>
      )}

      {view === 'select-token' && (
        <TokenSelectorView
          selectedTokenId={selectedToken?.id}
          onSelect={(id) => {
            setSelectedTokenId(id)
            setView('deposit')
          }}
        />
      )}

      {view === 'external-deposit' && <ExternalDepositView token={selectedToken} amount={amount} />}

      {view === 'credit-card-widget' && (
        <MoonPayGate enabled>
          <CreditCardWidgetView token={selectedToken} amount={amount} />
        </MoonPayGate>
      )}
    </>
  )
}

export interface DepositModalProps extends DepositMethodHandlers {
  open: boolean
  onClose: () => void
}

export function DepositModal({ open, onClose, ...handlers }: DepositModalProps) {
  const titleId = useId()
  const descId = useId()

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose()
      }}
    >
      <DialogContent
        data-privana
        showCloseButton={false}
        className="bg-card flex w-[560px] max-w-[95vw] flex-col gap-2 rounded-2xl border-0 p-2"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <DialogTitle id={titleId} className="sr-only">
          Deposit
        </DialogTitle>
        <DialogDescription id={descId} className="sr-only">
          Deposit funds into your account.
        </DialogDescription>
        <DepositModalContent onClose={onClose} {...handlers} />
      </DialogContent>
    </Dialog>
  )
}

export interface DepositInlineModalProps extends DepositMethodHandlers {
  className?: string
}

export function DepositInlineModal({ className, ...handlers }: DepositInlineModalProps) {
  return (
    <div
      data-privana
      className={cn(
        'bg-card relative flex w-[560px] max-w-full flex-col gap-2 overflow-hidden rounded-2xl p-2 shadow-lg',
        className
      )}
    >
      <DepositModalContent {...handlers} />
    </div>
  )
}
