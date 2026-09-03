'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAccount } from 'wagmi'
import { formatUnits, zeroAddress } from 'viem'
import { MoonPayProvider } from '@moonpay/moonpay-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { TokenConfig } from '@/sdk/types/tokens'
import type { Allowance } from '@/sdk/types/allowance'
import { toast } from 'sonner'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { useDeposit, isSignedLockUsable, type PostDepositLockError } from '@/sdk/hooks'
import { useDepositAddress } from '@/sdk/hooks/use-deposit-address'
import { getMinDepositBaseUnits } from '@/sdk/hooks/min-deposit'
import { usePrivateReadRequest } from '@/sdk/hooks/use-private-read-request'
import { useExternalDepositLock } from '@/sdk/hooks/use-external-deposit-lock'
import {
  createProductOnRampFlowSnapshot,
  createProductOnRampOutcomeCallbacks,
  matchesProductOnRampScope,
  resolveProductOnRamp,
  type ProductOnRampFlowSnapshot,
} from '@/sdk/on-ramp/product-config'
import { cn, parseTokenAmount } from '@/lib/utils'
import { TokenSelectorView } from './token-selector-view'
import { CreditCardWidgetView } from './credit-card-widget-view'
import {
  TransactionProgressView,
  TransactionSuccessView,
  TransactionWarningView,
  TransactionErrorView,
  type Step,
} from './transaction-steps'
import { CloseIcon, ChevronRightIcon, ChevronLeftIcon } from './icons'
import { DepositView } from './deposit-view'
import { ExternalDepositView } from './external-deposit-view'

type DepositMethodTab = 'crypto' | 'credit-card'

// Mounting MoonPayProvider injects MoonPay's web-sdk script from their CDN, so
// it wraps only the credit-card subtree instead of the app root — the other
// deposit flows never pay that cost. The product flow passes its snapshotted
// key so later configuration drift cannot remount or re-authorize the widget.
function MoonPayGate({
  enabled,
  apiKey,
  children,
}: {
  enabled: boolean
  apiKey: string | undefined
  children: ReactNode
}) {
  if (!enabled || !apiKey) return <>{children}</>
  return <MoonPayProvider apiKey={apiKey}>{children}</MoonPayProvider>
}

export type DepositSource = 'connected' | 'external' | 'credit-card'

type DepositViewName =
  | 'method'
  | 'deposit'
  | 'select-token'
  | 'external-deposit'
  | 'credit-card-widget'

type DepositFlowView =
  | 'depositing'
  | 'deposit-success'
  | 'deposit-timeout'
  | 'deposit-error'
  | 'lock-error'

function formatPostDepositLockFailure(
  error: PostDepositLockError | null,
  token: TokenConfig | undefined
): string {
  if (
    error?.reason === 'credited-below-signed' &&
    error.creditedAmount !== undefined &&
    error.signedAmount !== undefined &&
    token
  ) {
    const creditedAmount = `${formatUnits(error.creditedAmount, token.decimals)} ${token.symbol}`
    const signedAmount = `${formatUnits(error.signedAmount, token.decimals)} ${token.symbol}`
    return `Credited amount (${creditedAmount}) is below the signed lock amount (${signedAmount})`
  }
  return error?.message ?? 'Lock submission failed'
}

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
  const {
    serviceName,
    enabledTokens,
    defaultToken,
    hostedAuthConfig,
    serviceAddress,
    getChainById,
    getTokenById,
    networkConfig,
    onRamp,
  } = usePrivanaContext()
  const { address } = useAccount()
  const { privateReadQueryScope } = usePrivateReadRequest()
  const [privateReadApiUrl, accountingChainId, beneficiaryAddress] = privateReadQueryScope
  const appName = serviceName ?? 'Privana'
  const [activeTab, setActiveTab] = useState<DepositMethodTab>(defaultTab)
  const [view, setView] = useState<DepositViewName>('method')
  const [source, setSource] = useState<DepositSource>('connected')
  const [selectedTokenId, setSelectedTokenId] = useState(defaultToken?.id ?? '')
  const [amount, setAmount] = useState('')
  const [cardFlow, setCardFlow] = useState<ProductOnRampFlowSnapshot | null>(null)
  const [cardFlowActive, setCardFlowActive] = useState(false)
  const [cardUnsafeToClose, setCardUnsafeToClose] = useState(false)
  const nextCardFlowId = useRef(0)

  const stateSelectedToken = enabledTokens.find((t) => t.id === selectedTokenId) ?? defaultToken
  const cardOnRamp = useMemo(
    () =>
      resolveProductOnRamp({
        config: onRamp,
        enabledTokens,
        legacyToken: stateSelectedToken,
        moonpayApiKey: networkConfig.moonpayApiKey,
      }),
    [enabledTokens, networkConfig.moonpayApiKey, onRamp, stateSelectedToken]
  )
  const cardOnRampScope = useMemo(
    () => ({
      apiUrl: privateReadApiUrl,
      accountingChainId,
      accountingContract: networkConfig.accountingContract,
      beneficiaryAddress,
    }),
    [accountingChainId, beneficiaryAddress, networkConfig.accountingContract, privateReadApiUrl]
  )
  // Do not mount a submitted flow for a different API, Accounting deployment,
  // or beneficiary while the effect below clears its parent-owned state.
  const mountedCardFlow =
    cardFlow && matchesProductOnRampScope(cardFlow.scope, cardOnRampScope) ? cardFlow : null
  const displayedCardOnRamp =
    view === 'credit-card-widget' && mountedCardFlow ? mountedCardFlow.selection : cardOnRamp
  const selectedToken = source === 'credit-card' ? displayedCardOnRamp.token : stateSelectedToken
  const depositAddressState = useDepositAddress({
    enabled:
      (source === 'external' && (view === 'deposit' || view === 'external-deposit')) ||
      (source === 'connected' && view === 'deposit'),
  })
  const externalMinimum =
    source !== 'external' || !selectedToken
      ? undefined
      : depositAddressState.isError
        ? null
        : depositAddressState.response
          ? (getMinDepositBaseUnits(depositAddressState.response, selectedToken.chainId, 'erc20') ??
            null)
          : undefined
  const walletMinimum =
    source === 'connected' && selectedToken
      ? getMinDepositBaseUnits(
          depositAddressState.response,
          selectedToken.chainId,
          selectedToken.contract === zeroAddress ? 'native' : 'erc20'
        )
      : undefined

  const prevAddressRef = useRef(address)
  useEffect(() => {
    const prev = prevAddressRef.current
    prevAddressRef.current = address
    if (hostedAuthConfig) return
    if (prev && address && prev !== address) {
      setView('method')
      setAmount('')
      setSelectedTokenId('')
      setCardFlow(null)
      setCardFlowActive(false)
      setCardUnsafeToClose(false)
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
  const [lockFailure, setLockFailure] = useState<PostDepositLockError | null>(null)

  const finishDeposit = () => {
    setAmount('')
    if (view === 'external-deposit') setView('deposit')
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
    setCardFlowActive(false)
    setCardUnsafeToClose(false)
    setAmount('')
    onDepositSuccess?.()
  }

  const leaveCardPurchase = useCallback(() => {
    setCardFlow(null)
    setCardFlowActive(false)
    setCardUnsafeToClose(false)
    setAmount('')
    setView('deposit')
  }, [])

  useEffect(() => {
    if (cardFlow && !matchesProductOnRampScope(cardFlow.scope, cardOnRampScope)) {
      leaveCardPurchase()
    }
  }, [cardFlow, cardOnRampScope, leaveCardPurchase])

  const cardOutcomeCallbacks = mountedCardFlow
    ? createProductOnRampOutcomeCallbacks({
        requiresLock: mountedCardFlow.requiresLock,
        onComplete: finishCardPurchase,
        onLockFailed: (err) => {
          setCardFlowActive(false)
          setCardUnsafeToClose(false)
          setLockFailure(err)
          onLockFailed?.(err)
        },
      })
    : null

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
      setLockFailure(null)
      finishDeposit()
    },
    // The deposit credited; only the policy lock failed. Success must not
    // fire (the host would act on unlocked funds) — show the dedicated
    // error view and let the host re-prompt for a fresh lock.
    onLockFailed: (err) => {
      setIsSubmittingLock(false)
      setLockFailure(err)
      onLockFailed?.(err)
    },
    onCheckTimeout: () => {
      setAmount('')
      setShowTimeout(true)
    },
  })

  // Pre-signed lock for the external-wallet flow. The connected flow above
  // runs its lock inside useDeposit; here the transfer happens outside the
  // app, so signing (handleSubmit) and settling (ExternalDepositView's credit
  // callback) are wired separately through this hook.
  const externalLock = useExternalDepositLock({
    allowance,
    onLockSubmitted: () => {
      setLockFailure(null)
      finishDeposit()
    },
    // Same contract as the connected flow: the deposit credited, only the
    // lock failed — never report success, show the lock-error view instead.
    onLockFailed: (err) => {
      setLockFailure(err)
      onLockFailed?.(err)
    },
  })

  useEffect(() => {
    const restored = externalLock.session
    if (!restored) return
    const canRestore =
      view === 'method' ||
      (source === 'external' && (view === 'deposit' || view === 'external-deposit'))
    if (!canRestore) return
    const token = getTokenById(restored.tokenId)
    if (!token) return
    setSource('external')
    setSelectedTokenId(token.id)
    setAmount(formatUnits(BigInt(restored.depositAmount), token.decimals))
    setView('external-deposit')
  }, [externalLock.session, getTokenById, source, view])

  useEffect(() => {
    if (view === 'external-deposit' && allowance && !externalLock.session) {
      setView('deposit')
    }
  }, [allowance, externalLock.session, view])

  const isUnsafeToClose =
    ((isGettingAddress || isSendingTransaction) && !cancelled) ||
    externalLock.isSigning ||
    externalLock.isSubmittingLock ||
    cardUnsafeToClose
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
      const token = enabledTokens.find((candidate) => candidate.id === args.tokenId)
      if (!token) return
      if (token.contract === zeroAddress) {
        toast.error('External deposits support ERC20 tokens only')
        return
      }
      const depositAmount = parseTokenAmount(args.amount, token.decimals)
      if (typeof externalMinimum !== 'bigint') {
        toast.error('Minimum deposit is unavailable. Please try again.')
        return
      }
      if (depositAmount < externalMinimum) {
        toast.error(
          `Minimum deposit is ${formatUnits(externalMinimum, token.decimals)} ${token.symbol}`
        )
        return
      }
      if (!allowance) {
        setView('external-deposit')
        return
      }
      externalLock
        .signAndPersist({
          tokenId: token.id,
          amount: depositAmount,
        })
        .then(() => setView('external-deposit'))
        .catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'Policy signing failed')
        })
      return
    }
    if (args.source === 'credit-card') {
      // The pre-signed lock for card purchases is created inside the on-ramp
      // flow itself — see the postDepositLock wiring in CreditCardWidgetView.
      if (cardFlow && cardFlowActive) {
        setView('credit-card-widget')
        return
      }
      try {
        setCardFlow(
          createProductOnRampFlowSnapshot({
            id: ++nextCardFlowId.current,
            selection: cardOnRamp,
            amount: args.amount,
            allowance,
            lockServiceAddress: serviceAddress,
            moonpayApiKey: networkConfig.moonpayApiKey,
            scope: cardOnRampScope,
          })
        )
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Card purchase is unavailable')
        return
      }
      setCardFlowActive(false)
      setCardUnsafeToClose(false)
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
  const hasExternalLockRecovery =
    view === 'external-deposit' && !!externalLock.session?.creditedAmount
  const externalSubmissionAmbiguous =
    hasExternalLockRecovery && !!lockFailure?.submissionMayHaveSucceeded
  const savedExternalPayloadUsable =
    !!externalLock.session?.payload && isSignedLockUsable(externalLock.session.payload)
  const ambiguousRecoveryMustBeAbandoned =
    externalSubmissionAmbiguous && !savedExternalPayloadUsable
  const externalRecoveryExitLabel = externalSubmissionAmbiguous
    ? 'Stop recovery'
    : 'Keep funds unlocked'
  const lockFailureToken =
    hasExternalLockRecovery && externalLock.session
      ? (getTokenById(externalLock.session.tokenId) ?? selectedToken)
      : selectedToken
  const lockFailureMessage = formatPostDepositLockFailure(lockFailure, lockFailureToken)
  const flowView: DepositFlowView | null = showSuccess
    ? 'deposit-success'
    : lockFailure
      ? 'lock-error'
      : showTimeout
        ? 'deposit-timeout'
        : verificationFailed
          ? 'deposit-error'
          : (isPending && !cancelled) || isSubmittingLock
            ? 'depositing'
            : null
  const activeView: DepositViewName | DepositFlowView = flowView ?? view

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
    if (hasExternalLockRecovery && !externalLock.discardSession()) {
      toast.error('Deposit recovery changed in another tab. Please review the current state.')
      return
    }
    setLockFailure(null)
    setAmount('')
    setCancelled(false)
    resetDeposit()
    if (view === 'external-deposit') setView('deposit')
    if (view === 'credit-card-widget') {
      setCardFlow(null)
      setCardFlowActive(false)
      setCardUnsafeToClose(false)
      setView('deposit')
    }
  }

  const handleExternalLockRetry = () => {
    externalLock.retryAfterCredit().catch((err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Policy signing failed')
    })
  }

  const handleExternalVerificationDiscard = () => {
    if (!externalLock.discardSession()) {
      toast.error('Deposit recovery changed in another tab. Please review the current state.')
      return
    }
    setAmount('')
    setView('deposit')
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
        ? { to: 'deposit' as const, label: 'Buy with card and deposit' }
        : view === 'select-token'
          ? { to: 'deposit' as const, label: 'Deposit' }
          : { to: 'method' as const, label: 'Deposit Method' }

  const goBack = () => {
    if (view === 'external-deposit' && externalLock.session) {
      toast.error('Cancel the active deposit from the address screen before going back')
      return
    }
    if (view === 'credit-card-widget' && (cardUnsafeToClose || cardFlowActive)) {
      toast.error('Finish or recover the active card purchase before going back')
      return
    }
    if (view === 'credit-card-widget') {
      setCardFlow(null)
      setCardUnsafeToClose(false)
    }
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
              title={
                externalSubmissionAmbiguous
                  ? 'Deposit credited, lock status unknown'
                  : 'Deposit credited, lock failed'
              }
              message={
                externalSubmissionAmbiguous
                  ? `Your deposit was credited, but the lock for ${appName} may already have succeeded. Retry only the saved signature; if it has expired, check locked funds before stopping recovery.`
                  : `Your deposit was credited but locking the funds for ${appName} failed: ${lockFailureMessage}`
              }
              onDone={
                hasExternalLockRecovery && !ambiguousRecoveryMustBeAbandoned
                  ? handleExternalLockRetry
                  : handleLockFailedDone
              }
              actionLabel={
                hasExternalLockRecovery
                  ? ambiguousRecoveryMustBeAbandoned
                    ? externalRecoveryExitLabel
                    : externalLock.session?.payload
                      ? 'Retry lock submission'
                      : 'Sign policy and lock funds'
                  : undefined
              }
              pendingLabel={externalLock.isSigning ? 'Confirm policy in wallet…' : 'Locking funds…'}
              isPending={externalLock.isSigning || externalLock.isSubmittingLock}
              onDismiss={
                hasExternalLockRecovery && !ambiguousRecoveryMustBeAbandoned
                  ? handleLockFailedDone
                  : undefined
              }
              dismissLabel={externalRecoveryExitLabel}
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
                  ? `Your transfer was sent on-chain but we could not verify the deposit. The funds are already at the deposit address. Retry verification instead of starting a new deposit. (${depositError.message})`
                  : 'Your transfer was sent on-chain but we could not verify the deposit. The funds are already at the deposit address. Retry verification instead of starting a new deposit.'
              }
              explorerUrl={explorerTxUrl}
              explorerLabel="View transaction"
              onRetry={handleRetryVerification}
              onDismiss={handleDismissVerificationError}
            />
          )}
          {activeView === 'depositing' && (
            <TransactionProgressView
              title="Depositing…"
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
              {activeTab === 'crypto' ? 'Choose the deposit method' : 'Buy with card and deposit'}
            </h2>
            <p className="text-muted-foreground text-sm">
              {activeTab === 'crypto'
                ? 'Choose the deposit method.'
                : 'Buy crypto by card and deposit it into your account.'}
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
                title="Buy with card"
                description="Purchase and deposit directly into your account."
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
        <MoonPayGate
          enabled={
            source === 'credit-card' &&
            cardOnRamp.provider === 'moonpay' &&
            !cardOnRamp.unavailableReason
          }
          apiKey={networkConfig.moonpayApiKey}
        >
          <DepositView
            source={source}
            selectedToken={selectedToken}
            onRamp={cardOnRamp}
            amount={amount}
            allowance={allowance}
            externalMinimum={externalMinimum}
            walletMinimum={walletMinimum}
            onAmountChange={setAmount}
            onSelectToken={() => setView('select-token')}
            onConnectWallet={onConnectWallet}
            onSubmit={handleSubmit}
            isSubmitting={isPending || externalLock.isSigning || externalLock.isSubmittingLock}
          />
        </MoonPayGate>
      )}

      {activeView === 'select-token' && (
        <TokenSelectorView
          selectedTokenId={selectedToken?.id}
          onSelect={(id) => {
            if (id !== selectedToken?.id) setAmount('')
            setSelectedTokenId(id)
            setView('deposit')
          }}
        />
      )}

      {activeView === 'external-deposit' && (!allowance || externalLock.session) && (
        <ExternalDepositView
          token={selectedToken}
          amount={amount}
          depositAddressState={depositAddressState}
          externalMinimum={externalMinimum}
          onCredited={allowance ? undefined : onDepositSuccess}
          onDiscardLock={handleExternalVerificationDiscard}
          // Routed on the signed session, not the allowance prop: once a
          // policy is signed it must settle even if the host's allowance
          // changes, and after it settles credits get the default handling.
          lock={externalLock.session ? externalLock : undefined}
        />
      )}

      {activeView === 'credit-card-widget' && mountedCardFlow && (
        <MoonPayGate
          enabled={mountedCardFlow.selection.provider === 'moonpay'}
          apiKey={mountedCardFlow.moonpayApiKey}
        >
          <CreditCardWidgetView
            key={mountedCardFlow.id}
            token={mountedCardFlow.selection.token}
            onRamp={mountedCardFlow.selection}
            amount={mountedCardFlow.amount}
            allowance={mountedCardFlow.allowance}
            lockServiceAddress={mountedCardFlow.lockServiceAddress}
            onUnsafeToCloseChange={setCardUnsafeToClose}
            onActiveFlowChange={setCardFlowActive}
            // Both provider leaves route only this snapshot's signed intent.
            // With an allowance, host success waits for lock acceptance.
            onCredited={cardOutcomeCallbacks?.onCredited}
            onLockSubmitted={cardOutcomeCallbacks?.onLockSubmitted}
            onLockFailed={cardOutcomeCallbacks?.onLockFailed}
            onLeave={leaveCardPurchase}
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
