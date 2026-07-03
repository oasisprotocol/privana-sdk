'use client'

import { useEffect, useId, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { usePrivanaContext } from '@/sdk/context/privana-provider'
import { useBalance } from '@/sdk/hooks'
import { cn, formatTimeRemaining, formatTokenAmount, parseTokenAmount } from '@/lib/utils'
import { CloseIcon } from './icons'
import { AllowancePolicySection } from './allowance-policy-section'
import type { DepositMethodHandlers } from './deposit-modal'

const AVAILABLE_COLOR = 'bg-[#007bff]'
const IN_USE_COLOR = 'bg-[#4fc77f]'

export interface WalletSession {
  /**
   * Funds committed to the active game session, in the display token's base
   * units. Host-computed — must already reflect the session's wins/losses,
   * which never exist on-chain until settlement.
   */
  inUse: string | bigint
  /** Unix timestamp (seconds) when the session lock expires; shows the countdown. */
  expiry?: number
}

export interface WalletModalHandlers extends DepositMethodHandlers {
  session?: WalletSession
  onPlay?: (args: { tokenId: string; amount: string }) => void
  onEndSession?: () => Promise<void>
}

function toInUseWei(value: string | bigint): bigint {
  if (typeof value === 'bigint') return value
  try {
    return BigInt(value)
  } catch {
    console.warn(`[privana-sdk] Invalid session.inUse value: ${value}`)
    return 0n
  }
}

function useNow(intervalMs: number, enabled: boolean) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, enabled])
}

function SegmentedBalanceBar({
  availableWei,
  inUseWei,
}: {
  availableWei: bigint
  inUseWei: bigint
}) {
  const total = availableWei + inUseWei
  // With no funds at all, show a full "available" track.
  const showAvailable = inUseWei === 0n || availableWei > 0n
  const showInUse = inUseWei > 0n
  const grow = (part: bigint) => (total > 0n ? Number((part * 1000n) / total) : 1)

  return (
    <div className="flex h-1.5 w-full">
      {showAvailable && (
        <div
          className={cn(AVAILABLE_COLOR, 'rounded-l-full', !showInUse && 'rounded-r-full')}
          style={{ flexGrow: grow(availableWei) }}
        />
      )}
      {showInUse && (
        <div
          className={cn(IN_USE_COLOR, 'rounded-r-full', !showAvailable && 'rounded-l-full')}
          style={{ flexGrow: grow(inUseWei) }}
        />
      )}
    </div>
  )
}

function BalanceLegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn('h-2.5 w-2.5 rounded-full', color)} />
      <span className="text-foreground text-sm leading-5">{label}</span>
    </div>
  )
}

type BalanceVariant = 'idle' | 'session-zero' | 'fully-in-use' | 'mixed'

function WalletBalanceView({
  session,
  allowance,
  amount,
  onAmountChange,
  onPlay,
  onAddFunds,
  onWithdraw,
}: {
  session?: WalletSession
  allowance?: WalletModalHandlers['allowance']
  amount: string
  onAmountChange: (value: string) => void
  onPlay?: WalletModalHandlers['onPlay']
  onAddFunds?: () => void
  onWithdraw?: () => void
}) {
  const { serviceName, serviceIcon, defaultToken } = usePrivanaContext()
  const appName = serviceName ?? 'Privana'
  const token = defaultToken

  const {
    balanceWei,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
  } = useBalance({ tokenId: token?.id, enabled: !!token })

  const inUseWei = session ? toInUseWei(session.inUse) : 0n
  const availableWei = BigInt(balanceWei)
  const variant: BalanceVariant = !session
    ? 'idle'
    : inUseWei === 0n
      ? 'session-zero'
      : availableWei === 0n
        ? 'fully-in-use'
        : 'mixed'

  const expiry = session?.expiry
  useNow(30_000, expiry != null)
  const countdown = expiry != null ? formatTimeRemaining(expiry) : null

  const decimals = token?.decimals ?? 18
  const totalFormatted = formatTokenAmount((availableWei + inUseWei).toString(), decimals)
  const availableFormatted = formatTokenAmount(availableWei.toString(), decimals)
  const inUseFormatted = formatTokenAmount(inUseWei.toString(), decimals)

  const hasValidAmount = !!amount && parseFloat(amount) > 0
  const tooManyDecimals =
    hasValidAmount &&
    !!token &&
    amount.includes('.') &&
    amount.split('.')[1].length > token.decimals
  // Only available funds can be committed to a session — in-use funds are
  // already locked.
  const exceedsBalance =
    hasValidAmount &&
    !tooManyDecimals &&
    !!token &&
    !isBalanceLoading &&
    !isBalanceError &&
    parseTokenAmount(amount, token.decimals) > availableWei

  const canPlay =
    hasValidAmount &&
    !!token &&
    !tooManyDecimals &&
    !exceedsBalance &&
    !isBalanceLoading &&
    !isBalanceError

  const handleMax = () => {
    const max = availableFormatted.replace(/\s/g, '')
    if (parseFloat(max) > 0) onAmountChange(max)
  }

  const handlePlay = () => {
    if (!token || !canPlay || !onPlay) return
    onPlay({ tokenId: token.id, amount })
    onAmountChange('')
  }

  const showInput = variant !== 'fully-in-use'
  const showInlinePlay = variant === 'session-zero' || variant === 'mixed'

  return (
    <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground text-sm leading-[14px]">Total</span>
          <span className="bg-secondary text-muted-foreground rounded-full px-2 py-[5px] text-[10px] leading-[10px] font-bold">
            {token?.symbol ?? '—'}
          </span>
        </div>
        {isBalanceLoading ? (
          <Skeleton className="h-9 w-40" />
        ) : (
          <span className="text-foreground text-[32px] leading-9 font-medium">
            {totalFormatted}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <SegmentedBalanceBar availableWei={availableWei} inUseWei={inUseWei} />
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {variant === 'fully-in-use' ? (
              <BalanceLegendItem color={IN_USE_COLOR} label="In use" />
            ) : variant === 'mixed' ? (
              <>
                <BalanceLegendItem
                  color={AVAILABLE_COLOR}
                  label={`Available (${availableFormatted})`}
                />
                <BalanceLegendItem color={IN_USE_COLOR} label={`In use (${inUseFormatted})`} />
              </>
            ) : (
              <BalanceLegendItem color={AVAILABLE_COLOR} label="Available" />
            )}
          </div>
          {countdown && (
            <span className="text-muted-foreground text-sm leading-5 whitespace-nowrap">
              {countdown}
            </span>
          )}
        </div>
      </div>

      {showInput && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="border-border bg-input flex h-10 flex-1 items-center gap-2 rounded-[10px] border py-1 pr-1 pl-3">
              <input
                type="text"
                inputMode="decimal"
                placeholder="Enter Amount"
                value={amount}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9.,]/g, '').replace(/,/g, '.')
                  if (value.split('.').length <= 2) onAmountChange(value)
                }}
                className="text-foreground placeholder:text-muted-foreground/50 min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                onClick={handleMax}
                className="text-foreground cursor-pointer rounded px-3 py-2.5 text-xs font-semibold"
              >
                MAX
              </button>
            </div>
            {showInlinePlay && (
              <button
                type="button"
                disabled={!onPlay || !canPlay}
                onClick={handlePlay}
                className="border-border flex h-10 min-w-20 cursor-pointer items-center justify-center rounded-[10px] border px-3 text-sm font-medium text-[#4fc77f] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Play
              </button>
            )}
          </div>
          {tooManyDecimals && token && (
            <p className="text-destructive text-sm">
              Too many decimal places (max: {token.decimals})
            </p>
          )}
          {exceedsBalance && <p className="text-destructive text-sm">Insufficient balance</p>}
        </div>
      )}

      {variant === 'idle' && allowance && (
        <div className="bg-muted rounded-[10px] p-4">
          <AllowancePolicySection
            allowance={allowance}
            serviceName={appName}
            serviceIcon={serviceIcon}
          />
        </div>
      )}

      <div className="flex items-start gap-4">
        {variant === 'idle' ? (
          <>
            <button
              type="button"
              disabled={!onPlay || !canPlay}
              onClick={handlePlay}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Play
            </button>
            <button
              type="button"
              disabled={!onAddFunds}
              onClick={onAddFunds}
              className="bg-secondary text-foreground hover:bg-secondary/80 flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add funds
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              disabled={!onAddFunds}
              onClick={onAddFunds}
              className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add Funds
            </button>
            <button
              type="button"
              disabled={!onWithdraw}
              onClick={onWithdraw}
              className="bg-secondary text-foreground hover:bg-secondary/80 flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              Withdraw
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function WalletModalContent({
  session,
  allowance,
  onPlay,
  onClose,
}: WalletModalHandlers & {
  onClose?: () => void
}) {
  const { serviceName } = usePrivanaContext()
  const appName = serviceName ?? 'Privana'
  const [amount, setAmount] = useState('')

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

      <div className="flex items-center px-5 py-4">
        <span className="text-foreground text-xl leading-5 font-medium">{appName}</span>
      </div>

      <WalletBalanceView
        session={session}
        allowance={allowance}
        amount={amount}
        onAmountChange={setAmount}
        onPlay={onPlay}
      />
    </>
  )
}

export interface WalletModalProps extends WalletModalHandlers {
  open: boolean
  onClose: () => void
}

export function WalletModal({ open, onClose, ...handlers }: WalletModalProps) {
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
          Wallet
        </DialogTitle>
        <DialogDescription id={descId} className="sr-only">
          Manage your account balance.
        </DialogDescription>
        <WalletModalContent onClose={onClose} {...handlers} />
      </DialogContent>
    </Dialog>
  )
}

export interface WalletInlineModalProps extends WalletModalHandlers {
  className?: string
}

export function WalletInlineModal({ className, ...handlers }: WalletInlineModalProps) {
  return (
    <div
      data-privana
      className={cn(
        'bg-card relative flex w-[560px] max-w-full flex-col gap-2 overflow-hidden rounded-2xl p-2 shadow-lg',
        className
      )}
    >
      <WalletModalContent {...handlers} />
    </div>
  )
}
