import { useEffect, useRef, useState } from 'react'
import { formatUnits, zeroAddress } from 'viem'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import type { TokenConfig } from '@/sdk/types/tokens'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { useDepositVerification, usePendingDeposits, type VerificationContext } from '@/sdk/hooks'
import type { UseDepositAddressResult } from '@/sdk/hooks/use-deposit-address'
import { isExternalDepositBlockInSession } from '@/sdk/utils/external-deposit-lock'
import type { UseExternalDepositLockResult } from '@/sdk/hooks/use-external-deposit-lock'
import { formatCountdown, shortenAddress } from '@/lib/utils'
import { CopyIcon } from './icons'
import {
  Spinner,
  TransactionSuccessView,
  TransactionWarningView,
  TransactionErrorView,
} from './transaction-steps'

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

export function ExternalDepositView({
  token,
  amount,
  depositAddressState,
  externalMinimum,
  onCredited,
  onDiscardLock,
  lock,
}: {
  token: TokenConfig | undefined
  amount: string
  depositAddressState: UseDepositAddressResult
  /** `undefined` while loading, `null` when unavailable, otherwise base units. */
  externalMinimum?: bigint | null
  /** When set, the host owns the success UX — the inline success view is skipped. */
  onCredited?: () => void
  /** Explicitly abandons a signed session before any transfer is discovered. */
  onDiscardLock?: () => void
  /** When set, every credit routes to the pre-signed lock instead of the success views. */
  lock?: Pick<
    UseExternalDepositLockResult,
    | 'isSigning'
    | 'isSubmittingLock'
    | 'recordVerification'
    | 'settleAfterCredit'
    | 'retryAfterCredit'
    | 'clearVerification'
    | 'session'
  >
}) {
  const { getChainById, getTokenById, serviceName } = usePrivanaContext()
  const appName = serviceName ?? 'Privana'
  const { depositAddress, isReady, isLoading } = depositAddressState
  const minimumLabel =
    token && typeof externalMinimum === 'bigint'
      ? `${formatUnits(externalMinimum, token.decimals)} ${token.symbol}`
      : undefined
  const chain = token ? getChainById(token.chainId) : undefined
  const lockSession = lock?.session
  const recordVerification = lock?.recordVerification
  const settleAfterCredit = lock?.settleAfterCredit
  const retryAfterCredit = lock?.retryAfterCredit
  const discoveryToken = lockSession ? getTokenById(lockSession.tokenId) : token
  const [copied, setCopied] = useState(false)

  const [deadline] = useState(() => Date.now() + LISTENING_WINDOW_MS)
  const secondsLeft = useCountdown(deadline)
  const listening = secondsLeft > 0
  const [nothingFound, setNothingFound] = useState(false)
  const [credited, setCredited] = useState<{ txHash: string } | null>(null)
  const [showCancelWarning, setShowCancelWarning] = useState(false)

  const verification = useDepositVerification({
    onCredited: (txHash, _response, creditedAmount) => {
      if (settleAfterCredit) {
        void settleAfterCredit(txHash, creditedAmount)
        return
      }
      if (onCredited) {
        onCredited()
        return
      }
      setCredited({ txHash })
    },
  })
  const { isVerifying, verificationFailed, canCheckAnotherTransfer, didTimeout, verify } =
    verification
  const scanPaused =
    isVerifying ||
    verificationFailed ||
    didTimeout ||
    !!credited ||
    !!lock?.isSigning ||
    !!lock?.isSubmittingLock ||
    !!lockSession?.verification ||
    !!lockSession?.creditedAmount
  const showDepositInstructions = !credited && !lockSession?.creditedAmount

  const {
    pending,
    isFetching: isScanning,
    isError: isScanError,
    isRateLimited,
    isUnavailable,
    refetch: refetchPendingDeposits,
  } = usePendingDeposits({
    chainId: discoveryToken?.chainId,
    tokenAddress: discoveryToken?.contract === zeroAddress ? undefined : discoveryToken?.contract,
    enabled:
      isReady && !!depositAddress && !!discoveryToken && discoveryToken.contract !== zeroAddress,
    refetchInterval: listening && !scanPaused ? 30_000 : false,
  })

  const processedRef = useRef(new Set<string>())
  const verificationRunRef = useRef<string | null>(null)
  useEffect(
    () => () => {
      verificationRunRef.current = null
    },
    []
  )

  useEffect(() => {
    const stored = lockSession?.verification
    if (!stored || lockSession.creditedAmount || isVerifying || verificationFailed || didTimeout) {
      return
    }
    const key = `${lockSession.generation}:${stored.chainId}:${stored.hash}:${stored.logIndex ?? 0}`
    if (verificationRunRef.current === key) return
    verificationRunRef.current = key
    processedRef.current.add(`${stored.hash}:${stored.logIndex ?? 0}`)
    void verify({
      hash: stored.hash,
      chainId: stored.chainId,
      amount: BigInt(stored.amount),
      logIndex: stored.logIndex,
    })
  }, [didTimeout, isVerifying, lockSession, verificationFailed, verify])

  useEffect(() => {
    if (scanPaused) return
    const next = [...pending]
      .sort((a, b) => a.block_number - b.block_number)
      .find(
        (deposit) =>
          (!lockSession || isExternalDepositBlockInSession(lockSession, deposit.block_number)) &&
          !processedRef.current.has(`${deposit.tx_hash}:${deposit.log_index}`)
      )
    if (!next) return
    const context: VerificationContext = {
      hash: next.tx_hash,
      chainId: next.chain_id,
      amount: BigInt(next.amount),
      logIndex: next.log_index,
    }
    if (recordVerification) {
      try {
        recordVerification(context)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to save deposit recovery state')
        return
      }
    }
    processedRef.current.add(`${next.tx_hash}:${next.log_index}`)
    if (!recordVerification) void verify(context)
  }, [lockSession, pending, recordVerification, scanPaused, verify])

  const nothingFoundTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(nothingFoundTimerRef.current), [])

  const handleRefresh = () => {
    processedRef.current.clear()
    void refetchPendingDeposits().then((result) => {
      if (!result || result.pending.length === 0) {
        setNothingFound(true)
        clearTimeout(nothingFoundTimerRef.current)
        nothingFoundTimerRef.current = setTimeout(() => setNothingFound(false), 4000)
      }
    })
  }

  const handleCopy = async () => {
    if (!depositAddress) return
    try {
      await navigator.clipboard.writeText(depositAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Unable to copy the deposit address')
    }
  }

  const handleCheckAnotherTransfer = () => {
    try {
      if (!lock?.clearVerification()) {
        toast.error('Deposit recovery changed in another tab. Please review the current state.')
        return
      }
      verificationRunRef.current = null
      verification.reset()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to continue deposit discovery')
    }
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

      {showDepositInstructions && (
        <>
          {!scanPaused && (
            <p className="text-muted-foreground text-sm">
              Send the displayed amount in one transfer. Transfers below the minimum
              {minimumLabel ? ` (${minimumLabel})` : ''} are not combined or automatically returned.
            </p>
          )}

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
                  <p className="text-foreground min-w-0 flex-1 truncate text-sm">
                    {depositAddress}
                  </p>
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
        </>
      )}

      {showCancelWarning &&
      lockSession &&
      !lockSession.verification &&
      !lockSession.creditedAmount ? (
        <TransactionWarningView
          title="Cancel this deposit?"
          message="Only cancel if you have not sent funds. Canceling after a transfer was sent stops recovery and can leave the transfer uncredited or unlocked."
          onDone={() => onDiscardLock?.()}
          actionLabel="I haven’t sent funds"
          onDismiss={() => setShowCancelWarning(false)}
          dismissLabel="Keep waiting"
        />
      ) : lock?.isSigning ? (
        <AwaitingDepositStatus
          title="Confirm policy in your wallet"
          subtitle="Sign a fresh policy for the funds already credited."
        />
      ) : lock?.isSubmittingLock ? (
        <AwaitingDepositStatus
          title={`Locking funds for ${appName}`}
          subtitle="Deposit credited. Applying your signed policy…"
        />
      ) : lock?.session?.creditedAmount ? (
        <TransactionWarningView
          title={lock.session.submissionAmbiguous ? 'Lock status unknown' : 'Deposit credited'}
          message={
            lock.session.submissionAmbiguous
              ? 'The lock may already have succeeded. Retry only the saved signature, or check locked funds before stopping recovery.'
              : 'The deposit is credited, but its signed lock still needs to be submitted.'
          }
          onDone={() => {
            void retryAfterCredit?.().catch((err: unknown) => {
              toast.error(err instanceof Error ? err.message : 'Policy recovery failed')
            })
          }}
          actionLabel={
            lock.session.payload ? 'Retry lock submission' : 'Sign policy and lock funds'
          }
        />
      ) : credited ? (
        <TransactionSuccessView
          title="Deposit Credited"
          message={`Transfer ${shortenAddress(credited.txHash)} has been credited to your Privana balance.`}
          onDone={() => {
            setCredited(null)
            verification.reset()
            void refetchPendingDeposits()
          }}
        />
      ) : verificationFailed || didTimeout ? (
        <TransactionErrorView
          title="Could not verify deposit"
          message={
            didTimeout
              ? 'Verification timed out — your deposit may still be credited in the background.'
              : (verification.error?.message ??
                'Your transfer was found but could not be verified.')
          }
          onRetry={() => void verification.retryVerification()}
          onDismiss={
            lock
              ? canCheckAnotherTransfer
                ? handleCheckAnotherTransfer
                : undefined
              : () => verification.reset()
          }
          dismissLabel={lock && canCheckAnotherTransfer ? 'Check another transfer' : undefined}
          isRetrying={isVerifying}
        />
      ) : isVerifying ? (
        <AwaitingDepositStatus
          title="Deposit detected"
          subtitle="Crediting the incoming transaction to your Privana balance…"
        />
      ) : (
        <>
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
            {lockSession && !lockSession.verification && !lockSession.creditedAmount && (
              <button
                type="button"
                onClick={() => setShowCancelWarning(true)}
                className="border-border text-foreground hover:bg-secondary flex h-10 w-full cursor-pointer items-center justify-center rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors"
              >
                Cancel deposit
              </button>
            )}
            {isRateLimited ? (
              <p className="text-muted-foreground text-center text-sm">
                Checked too recently. Try again in a moment.
              </p>
            ) : isUnavailable ? (
              <p className="text-muted-foreground text-center text-sm">
                Deposit discovery is unavailable for this chain.
              </p>
            ) : isScanError ? (
              <p className="text-muted-foreground text-center text-sm">
                Chain temporarily unreachable. Retrying automatically.
              </p>
            ) : nothingFound ? (
              <p className="text-muted-foreground text-center text-sm">
                No incoming transaction found yet.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
