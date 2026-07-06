'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useAccount, useBalance, useReadContract } from 'wagmi'
import { erc20Abi, zeroAddress } from 'viem'
import { QRCodeSVG } from 'qrcode.react'
import { MoonPayProvider } from '@moonpay/moonpay-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import type { TokenConfig } from '@/sdk/types/tokens'
import type { Allowance } from '@/sdk/types/allowance'
import { toast } from 'sonner'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import {
  useDeposit,
  useDepositAddress,
  usePendingDeposits,
  type PostDepositLockError,
} from '@/sdk/hooks'
import { useMoonpayLimits } from '@/sdk/hooks/use-moonpay-limits'
import { cn, formatCountdown, formatTokenAmount, parseTokenAmount } from '@/lib/utils'
import { getTokenIcon } from './token-icons'
import { TokenSelectorView } from './token-selector-view'
import { CreditCardWidgetView } from './credit-card-widget-view'
import {
  Spinner,
  TransactionProgressView,
  TransactionSuccessView,
  TransactionWarningView,
  TransactionErrorView,
  type Step,
} from './transaction-steps'
import { CloseIcon, ChevronRightIcon, ChevronLeftIcon, CopyIcon } from './icons'
import { AllowancePolicySection } from './allowance-policy-section'

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

type DepositFlowView =
  | 'depositing'
  | 'deposit-success'
  | 'deposit-timeout'
  | 'deposit-error'
  | 'lock-error'

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

function DepositView({
  source,
  selectedToken,
  amount,
  allowance,
  onAmountChange,
  onSelectToken,
  onConnectWallet,
  onSubmit,
  isSubmitting = false,
}: {
  source: DepositSource
  selectedToken: TokenConfig | undefined
  amount: string
  allowance?: Allowance
  onAmountChange: (value: string) => void
  onSelectToken: () => void
  onConnectWallet?: () => void
  onSubmit: (args: { source: DepositSource; tokenId: string; amount: string }) => void
  isSubmitting?: boolean
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

  // The credit-card amount is the token amount MoonPay should deliver
  // (quoteCurrencyAmount — the pre-signed lock needs an exact crypto target).
  // Gate it against MoonPay's fiat minimum so the user can't sign the policy
  // for an amount MoonPay would reject once the widget opens; the ~1:1
  // comparison holds because card purchases are limited to USD-stable tokens.
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
  // Card purchases keep a 2-decimal cap so the quote string stays simple for
  // MoonPay; other sources take a token amount capped by the token's decimals.
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
  // No MoonPay currency mapping for this token.
  const creditCardUnavailable =
    isCreditCard && !!selectedToken && !selectedToken.moonpayCurrencyCode
  const needsConnect = isConnectedSource && !isConnected

  const canDeposit =
    hasValidAmount &&
    !!selectedToken &&
    !tooManyDecimals &&
    !exceedsBalance &&
    !belowMoonpayMin &&
    !moonpayLimitsUnready &&
    !creditCardUnavailable &&
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
            <span className="text-muted-foreground text-sm">{selectedToken?.symbol ?? 'USD'}</span>
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
        {creditCardUnavailable && (
          <p className="text-destructive text-sm">
            {selectedToken?.symbol ?? 'This token'} isn’t available for card purchases yet.
          </p>
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
        disabled={needsConnect ? !onConnectWallet : !canDeposit || isSubmitting}
        onClick={() => {
          if (needsConnect) {
            onConnectWallet?.()
            return
          }
          if (selectedToken) onSubmit({ source, tokenId: selectedToken.id, amount })
        }}
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

const LISTENING_WINDOW_MS = 3_600_000

function remainingSeconds(deadline: number): number {
  return Math.max(0, Math.round((deadline - Date.now()) / 1000))
}

function useCountdown(deadline: number): number {
  const [secondsLeft, setSecondsLeft] = useState(() => remainingSeconds(deadline))
  useEffect(() => {
    if (remainingSeconds(deadline) <= 0) return
    const id = setInterval(() => {
      const left = remainingSeconds(deadline)
      setSecondsLeft(left)
      if (left <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [deadline])
  return secondsLeft
}

function AwaitingDepositStatus({
  title,
  subtitle,
  remaining,
}: {
  title: string
  subtitle: string
  remaining?: string
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="text-foreground">
        <Spinner size={32} />
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-foreground text-xl leading-6 font-medium">{title}</h3>
        <p className="text-muted-foreground text-sm leading-[18px]">
          {subtitle}
          {remaining && (
            <>
              <br />
              Remaining time: {remaining}
            </>
          )}
        </p>
      </div>
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

  const [deadline] = useState(() => Date.now() + LISTENING_WINDOW_MS)
  const secondsLeft = useCountdown(deadline)
  const listening = secondsLeft > 0
  const [nothingFound, setNothingFound] = useState(false)

  const {
    isFetching: isScanning,
    isError: isScanError,
    isRateLimited,
    refetch: refetchPendingDeposits,
  } = usePendingDeposits({
    chainId: token?.chainId,
    enabled: isReady && !!depositAddress && !!token,
    refetchInterval: listening ? 30_000 : false,
  })

  const handleRefresh = () => {
    void refetchPendingDeposits().then((result) => {
      if (!result || result.pending.length === 0) {
        setNothingFound(true)
        setTimeout(() => setNothingFound(false), 4000)
      }
    })
  }

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

      <AwaitingDepositStatus
        title="Awaiting Deposit"
        subtitle={
          listening
            ? 'We are listening for your incoming transaction for the next hour.'
            : "We've stopped listening automatically. Use the button below to check for your deposit."
        }
        remaining={listening ? formatCountdown(secondsLeft) : undefined}
      />

      <div className="flex flex-col gap-3">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={!depositAddress || isScanning}
          className="bg-secondary text-foreground hover:bg-secondary/80 flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          Refresh deposit status
        </button>
        {isRateLimited ? (
          <p className="text-muted-foreground text-center text-sm">
            Checked too recently — try again in a moment.
          </p>
        ) : isScanError ? (
          <p className="text-muted-foreground text-center text-sm">
            Chain temporarily unreachable — retrying automatically.
          </p>
        ) : nothingFound ? (
          <p className="text-muted-foreground text-center text-sm">
            No incoming transaction found yet.
          </p>
        ) : null}
      </div>
    </div>
  )
}

export interface DepositMethodHandlers {
  defaultTab?: DepositMethodTab
  /** Allowance (shown as a "policy") the host service requests. */
  allowance?: Allowance
  onSelectConnectedWallet?: () => void
  onSelectExternalWallet?: () => void
  onSelectCreditCard?: () => void
  onConnectWallet?: () => void
  /** Called when the user confirms the amount on the deposit view. */
  onDeposit?: (args: { source: DepositSource; tokenId: string; amount: string }) => void
  /** With an allowance this fires only after the pre-signed lock is accepted. */
  onDepositSuccess?: () => void
  /** The deposit credited but the pre-signed lock failed — re-prompt. */
  onLockFailed?: (error: PostDepositLockError) => void
}

export function DepositModalContent({
  defaultTab = 'crypto',
  allowance,
  onSelectConnectedWallet,
  onSelectExternalWallet,
  onSelectCreditCard,
  onConnectWallet,
  onDeposit,
  onDepositSuccess,
  onLockFailed,
  onClose,
  onCloseBlockedChange,
  onExit,
}: DepositMethodHandlers & {
  onClose?: () => void
  onCloseBlockedChange?: (blocked: boolean) => void
  /** Renders a back chevron on the root method view (for embedding, e.g. WalletModal). */
  onExit?: () => void
}) {
  const { serviceName, enabledTokens, defaultToken, hostedAuthConfig, getChainById } =
    usePrivanaContext()
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

  const [showSuccess, setShowSuccess] = useState(false)
  const [showTimeout, setShowTimeout] = useState(false)
  const [cancelled, setCancelled] = useState(false)
  const [isSubmittingLock, setIsSubmittingLock] = useState(false)
  const [lockFailedMessage, setLockFailedMessage] = useState<string | null>(null)

  const finishDeposit = () => {
    setAmount('')
    if (onDepositSuccess) {
      resetDeposit()
      onDepositSuccess()
    } else {
      setShowSuccess(true)
    }
  }

  // Card purchases surface success inline in the on-ramp form (the crypto
  // success view would show transfer steps that never happened), so without
  // a host callback there is nothing to do here.
  const finishCardPurchase = () => {
    setAmount('')
    onDepositSuccess?.()
  }

  const {
    txHash,
    isGettingAddress,
    isSwitchingChain,
    isSendingTransaction,
    isWaitingForConfirmation,
    isWaitingForProcessing,
    verificationFailed,
    isPending,
    error: depositError,
    deposit,
    retryVerification,
    reset: resetDeposit,
  } = useDeposit({
    onCredited: (_txHash, _response, lockPending) => {
      // With an allowance the flow's promise is locked funds, not just a
      // credit — hold the progress view until the pre-signed lock settles.
      if (lockPending) {
        setIsSubmittingLock(true)
        return
      }
      finishDeposit()
    },
    onLockSubmitted: () => {
      setIsSubmittingLock(false)
      finishDeposit()
    },
    // The deposit credited; only the policy lock failed. Success must not
    // fire (the host would act on unlocked funds) — show the dedicated
    // error view and let the host re-prompt for a fresh lock.
    onLockFailed: (err) => {
      setIsSubmittingLock(false)
      setLockFailedMessage(err.message)
      onLockFailed?.(err)
    },
    onCheckTimeout: () => {
      setAmount('')
      setShowTimeout(true)
    },
  })

  const isUnsafeToClose = (isGettingAddress || isSendingTransaction) && !cancelled
  useEffect(() => {
    onCloseBlockedChange?.(isUnsafeToClose)
  }, [isUnsafeToClose, onCloseBlockedChange])

  useEffect(() => {
    // Post-transfer verification errors get the dedicated error view below.
    if (depositError && !verificationFailed) {
      toast.error(
        depositError.message.length > 100
          ? `${depositError.message.slice(0, 100)}...`
          : depositError.message
      )
    }
  }, [depositError, verificationFailed])

  const handleSubmit = (args: { source: DepositSource; tokenId: string; amount: string }) => {
    if (args.source === 'external') {
      setView('external-deposit')
      return
    }
    if (args.source === 'credit-card') {
      // The pre-signed lock for card purchases is created inside the on-ramp
      // flow itself — see the postDepositLock wiring in CreditCardWidgetView.
      setView('credit-card-widget')
      return
    }
    const token = enabledTokens.find((t) => t.id === args.tokenId)
    if (!token) return
    onDeposit?.(args)
    setCancelled(false)
    deposit({
      tokenId: token.id,
      amount: parseTokenAmount(args.amount, token.decimals),
      postDepositLock: allowance
        ? {
            maxAmount: BigInt(allowance.value),
            lockDuration: allowance.lockDuration,
          }
        : undefined,
    }).catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Deposit failed')
    })
  }

  const targetChain = selectedToken ? getChainById(selectedToken.chainId) : undefined
  const explorerTxUrl =
    txHash && targetChain?.explorerUrl ? `${targetChain.explorerUrl}/tx/${txHash}` : undefined
  const depositSteps: Step[] = [
    {
      label: 'Getting deposit address',
      status: isGettingAddress
        ? 'active'
        : isSwitchingChain ||
            isSendingTransaction ||
            isWaitingForConfirmation ||
            isWaitingForProcessing ||
            isSubmittingLock
          ? 'completed'
          : 'pending',
    },
    {
      label: `Switching to ${targetChain?.name ?? 'deposit chain'}`,
      status: isSwitchingChain
        ? 'active'
        : isSendingTransaction ||
            isWaitingForConfirmation ||
            isWaitingForProcessing ||
            isSubmittingLock
          ? 'completed'
          : 'pending',
    },
    {
      label: 'Confirm in wallet',
      status: isSendingTransaction
        ? 'active'
        : isWaitingForConfirmation || isWaitingForProcessing || isSubmittingLock
          ? 'completed'
          : 'pending',
    },
    {
      label: 'Confirming transaction',
      status: isWaitingForConfirmation
        ? 'active'
        : isWaitingForProcessing || isSubmittingLock
          ? 'completed'
          : 'pending',
    },
    {
      label: 'Verifying deposit — may take up to a few minutes',
      status: isWaitingForProcessing ? 'active' : isSubmittingLock ? 'completed' : 'pending',
    },
    ...(allowance
      ? [
          {
            label: `Locking funds for ${appName}`,
            status: isSubmittingLock ? 'active' : 'pending',
          } as Step,
        ]
      : []),
  ]
  const flowView: DepositFlowView | null = showSuccess
    ? 'deposit-success'
    : lockFailedMessage
      ? 'lock-error'
      : showTimeout
        ? 'deposit-timeout'
        : verificationFailed
          ? 'deposit-error'
          : (isPending && !cancelled) || isSubmittingLock
            ? 'depositing'
            : null
  const activeView: DepositView | DepositFlowView = flowView ?? view

  const handleDepositDone = () => {
    setShowSuccess(false)
    setShowTimeout(false)
    setCancelled(false)
    resetDeposit()
  }

  const handleDepositCancel = () => {
    setCancelled(true)
    resetDeposit()
  }

  const handleLockFailedDone = () => {
    setLockFailedMessage(null)
    setAmount('')
    setCancelled(false)
    resetDeposit()
  }

  const handleDismissVerificationError = () => {
    setAmount('')
    setCancelled(false)
    resetDeposit()
  }

  const handleRetryVerification = () => {
    retryVerification().catch(() => {
      // Errors are already surfaced via the hook's error state and onError callback.
    })
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
          disabled={isUnsafeToClose}
          aria-label="Close"
          className={cn(
            'absolute top-6 right-5 z-20 flex h-5 w-5 items-center justify-center transition-colors',
            isUnsafeToClose
              ? 'text-muted-foreground/40 cursor-not-allowed'
              : 'text-muted-foreground hover:text-foreground cursor-pointer'
          )}
        >
          <CloseIcon />
        </button>
      )}

      {flowView || (activeView === 'method' && !onExit) ? (
        <div className="flex items-center px-5 py-4">
          <span className="text-foreground text-xl leading-5 font-medium">{appName}</span>
        </div>
      ) : (
        <button
          type="button"
          onClick={activeView === 'method' ? onExit : goBack}
          className="text-foreground flex w-fit cursor-pointer items-center gap-2 px-5 py-4 text-sm font-medium transition-opacity hover:opacity-70"
        >
          <ChevronLeftIcon />
          {activeView === 'method' ? appName : back.label}
        </button>
      )}

      {flowView && (
        <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
          {activeView === 'deposit-success' && (
            <TransactionSuccessView
              title="Deposit Successful"
              message={`Your ${selectedToken?.symbol ?? ''} deposit has been processed.`}
              onDone={handleDepositDone}
            />
          )}
          {activeView === 'lock-error' && (
            <TransactionWarningView
              title="Deposit credited, lock failed"
              message={`Your deposit was credited but locking the funds for ${appName} failed: ${lockFailedMessage}`}
              onDone={handleLockFailedDone}
            />
          )}
          {activeView === 'deposit-timeout' && (
            <TransactionWarningView
              title="Deposit Processing"
              message="Your transaction was confirmed but the deposit is still being processed. Please check your balance - it should update shortly."
              onDone={handleDepositDone}
            />
          )}
          {activeView === 'deposit-error' && (
            <TransactionErrorView
              title="Verification failed"
              message={
                depositError?.message
                  ? `Your transfer was sent on-chain but we could not verify the deposit. The funds are already at the deposit address — retry verification instead of starting a new deposit. (${depositError.message})`
                  : 'Your transfer was sent on-chain but we could not verify the deposit. The funds are already at the deposit address — retry verification instead of starting a new deposit.'
              }
              explorerUrl={explorerTxUrl}
              explorerLabel="View transaction"
              onRetry={handleRetryVerification}
              onDismiss={handleDismissVerificationError}
            />
          )}
          {activeView === 'depositing' && (
            <TransactionProgressView
              title="Depositing..."
              steps={depositSteps}
              // Only allow cancel before the transaction is confirmed (during
              // address fetch / wallet signing).
              onCancel={isGettingAddress || isSendingTransaction ? handleDepositCancel : undefined}
            />
          )}
        </div>
      )}

      {activeView === 'method' && (
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

      {activeView === 'deposit' && (
        <MoonPayGate enabled={source === 'credit-card'}>
          <DepositView
            source={source}
            selectedToken={selectedToken}
            amount={amount}
            allowance={allowance}
            onAmountChange={setAmount}
            onSelectToken={() => setView('select-token')}
            onConnectWallet={onConnectWallet}
            onSubmit={handleSubmit}
            isSubmitting={isPending}
          />
        </MoonPayGate>
      )}

      {activeView === 'select-token' && (
        <TokenSelectorView
          selectedTokenId={selectedToken?.id}
          onSelect={(id) => {
            setSelectedTokenId(id)
            setView('deposit')
          }}
        />
      )}

      {activeView === 'external-deposit' && (
        <ExternalDepositView token={selectedToken} amount={amount} />
      )}

      {activeView === 'credit-card-widget' && (
        <MoonPayGate enabled>
          <CreditCardWidgetView
            token={selectedToken}
            amount={amount}
            allowance={allowance}
            // Mirrors the crypto path's lock gating: with an allowance the
            // host learns of success only once the lock is accepted. The
            // on-ramp hook also reports resumed background rows through these
            // same callbacks, which at worst ends the deposit view early or
            // surfaces an earlier purchase's lock failure — both re-promptable.
            onCredited={allowance ? undefined : finishCardPurchase}
            onLockSubmitted={finishCardPurchase}
            onLockFailed={(err) => {
              setLockFailedMessage(err.message)
              onLockFailed?.(err)
            }}
          />
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
        showCloseButton={false}
        onInteractOutside={isCloseBlocked ? (e) => e.preventDefault() : undefined}
        onEscapeKeyDown={isCloseBlocked ? (e) => e.preventDefault() : undefined}
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
        <DepositModalContent
          onClose={handleClose}
          onCloseBlockedChange={setIsCloseBlocked}
          {...handlers}
        />
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
