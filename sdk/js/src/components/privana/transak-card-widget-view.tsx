'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleCheckIcon, Loader2 } from 'lucide-react'
import { formatUnits, parseUnits } from 'viem'
import { Button } from '@/components/ui/button'
import { useTransakOnRamp } from '@/sdk/hooks/use-transak-on-ramp'
import { canRetryOnRampVerification, matchesOnRampTransaction } from '@/sdk/on-ramp/provider'
import {
  getTransakMinimumTargetBaseUnits,
  matchesFrozenOnRampToken,
} from '@/sdk/on-ramp/product-config'
import type { Allowance } from '@/sdk/types/allowance'
import type { Address, OnRampRecord } from '@/sdk/types'
import type { TokenConfig } from '@/sdk/types/tokens'
import type { PostDepositLockError } from '@/sdk/hooks/pending-lock'

type UseTransakOnRampHook = typeof useTransakOnRamp

export interface TransakCardWidgetViewProps {
  token: TokenConfig
  providerAssetCode: string
  amount: string
  allowance?: Allowance
  lockServiceAddress?: Address
  onCredited?: () => void
  onLockSubmitted?: () => void
  onLockFailed?: (error: PostDepositLockError) => void
  onLeave?: () => void
  onUnsafeToCloseChange?: (unsafe: boolean) => void
  onActiveFlowChange?: (active: boolean) => void
  /** Test seam; production always uses the real hook. */
  useOnRamp?: UseTransakOnRampHook
}

/**
 * The disabled button is presentation only. Enforce the launch preconditions
 * before any state changes so a programmatic call cannot bypass the
 * token-drift and unknown-minimum gates.
 */
export function assertTransakCheckoutPreconditions({
  activeIntentId,
  canOpen,
  canRecreateSession,
}: {
  activeIntentId: string | null
  canOpen: boolean
  canRecreateSession: boolean
}): void {
  if (activeIntentId && !canRecreateSession) {
    throw new Error('Continue signed-intent recovery instead of reopening this checkout')
  }
  if (!canOpen) {
    throw new Error('Card checkout is unavailable; close this purchase and start again')
  }
}

export function TransakCardWidgetView({
  token,
  providerAssetCode,
  amount,
  allowance,
  lockServiceAddress,
  onCredited,
  onLockSubmitted,
  onLockFailed,
  onLeave,
  onUnsafeToCloseChange,
  onActiveFlowChange,
  useOnRamp = useTransakOnRamp,
}: TransakCardWidgetViewProps) {
  const [actionError, setActionError] = useState<Error | null>(null)
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null)
  const [lockSettled, setLockSettled] = useState(false)
  const [lockError, setLockError] = useState<PostDepositLockError | null>(null)
  const [ownedTerminal, setOwnedTerminal] = useState(false)
  const ownedIntentIdRef = useRef<string | null>(null)
  const postDepositLock = useMemo(
    () =>
      allowance
        ? {
            serviceAddress: lockServiceAddress,
            maxAmount: BigInt(allowance.value),
            lockDuration: allowance.lockDuration,
          }
        : undefined,
    [allowance, lockServiceAddress]
  )

  const ownsRecord = useCallback(
    (record: OnRampRecord) =>
      Boolean(
        ownedIntentIdRef.current && matchesOnRampTransaction(record, ownedIntentIdRef.current)
      ),
    []
  )

  const {
    status,
    activeIntentId,
    pending,
    activeVerificationId,
    error,
    finalityProgress,
    depositAddress,
    minDepositBaseUnits,
    selectedToken,
    isLaunching,
    isWidgetOpen,
    canRecreateSession,
    widget,
    launch,
    recreateSession,
    closeWidget,
    finishPendingVerification,
    refreshPending,
  } = useOnRamp({
    tokenId: token.id,
    postDepositLock,
    iframeTitle: 'Card checkout',
    iframeClassName: 'h-[680px] w-full border-0',
    onCredited: (_depositTxHash, record) => {
      if (!ownsRecord(record)) return
      onCredited?.()
      if (!postDepositLock) {
        setOwnedTerminal(true)
        onActiveFlowChange?.(false)
      }
    },
    onLockSubmitted: (_response, record) => {
      if (!ownsRecord(record)) return
      setLockError(null)
      setLockSettled(true)
      setOwnedTerminal(true)
      onActiveFlowChange?.(false)
      onLockSubmitted?.()
    },
    onLockFailed: (nextError, record) => {
      if (!ownsRecord(record)) return
      setLockError(nextError)
      setOwnedTerminal(true)
      onActiveFlowChange?.(false)
      onLockFailed?.(nextError)
    },
  })
  const ownedIntentId = ownedIntentIdRef.current ?? activeIntentId
  useEffect(() => {
    if (activeIntentId && !ownedIntentIdRef.current) {
      ownedIntentIdRef.current = activeIntentId
    }
  }, [activeIntentId])

  let amountBaseUnits: bigint | undefined
  try {
    amountBaseUnits = parseUnits(amount, token.decimals)
  } catch {
    // The amount form already blocks malformed values. Keep this view closed
    // if stale or programmatic input reaches it anyway.
  }
  const minimumTargetBaseUnits =
    minDepositBaseUnits === undefined
      ? undefined
      : getTransakMinimumTargetBaseUnits(minDepositBaseUnits)
  const belowMinimum =
    amountBaseUnits !== undefined &&
    minimumTargetBaseUnits !== undefined &&
    amountBaseUnits < minimumTargetBaseUnits
  // Fail closed on an unknown minimum: an unverifiable-below-minimum purchase
  // is only discovered after the user has already paid.
  const minimumUnknown = minimumTargetBaseUnits === undefined
  const tokenMismatch = !matchesFrozenOnRampToken(token, selectedToken)
  const isSettling = status === 'awaiting-delivery' || status === 'verifying'
  const lockPending = !!allowance && status === 'credited' && !lockSettled && !lockError
  const ownedPending = ownedIntentId
    ? pending.filter((record) => matchesOnRampTransaction(record, ownedIntentId))
    : []
  const ownedFlowActive =
    !ownedTerminal &&
    (Boolean(activeIntentId && activeIntentId === ownedIntentId) ||
      ownedPending.length > 0 ||
      lockPending)
  const canOpen =
    Boolean(selectedToken && depositAddress && amountBaseUnits && amountBaseUnits > 0n) &&
    !tokenMismatch &&
    !minimumUnknown &&
    !belowMinimum &&
    !isLaunching &&
    !isWidgetOpen &&
    !isSettling &&
    status !== 'credited' &&
    (!activeIntentId || canRecreateSession)

  useEffect(() => {
    onActiveFlowChange?.(ownedFlowActive)
  }, [onActiveFlowChange, ownedFlowActive])

  const unsafeToClose = isLaunching || lockPending
  useEffect(() => {
    onUnsafeToCloseChange?.(unsafeToClose)
    return () => onUnsafeToCloseChange?.(false)
  }, [onUnsafeToCloseChange, unsafeToClose])

  const runCheckout = useCallback(async () => {
    setActionError(null)
    try {
      // Gate before the resets: a blocked click must not drop ownership of a
      // still-pending flow (ownedFlowActive would wrongly release the parent).
      assertTransakCheckoutPreconditions({ activeIntentId, canOpen, canRecreateSession })
      setLockError(null)
      setLockSettled(false)
      setOwnedTerminal(false)
      if (!activeIntentId) ownedIntentIdRef.current = null
      if (activeIntentId) await recreateSession()
      else await launch({ providerAssetCode, quoteCurrencyAmount: amount })
    } catch (nextError) {
      setActionError(
        nextError instanceof Error ? nextError : new Error('Failed to open card checkout')
      )
    }
  }, [
    activeIntentId,
    amount,
    canOpen,
    canRecreateSession,
    launch,
    providerAssetCode,
    recreateSession,
  ])

  const handleClose = useCallback(async () => {
    setActionError(null)
    try {
      await closeWidget()
    } catch (nextError) {
      setActionError(
        nextError instanceof Error ? nextError : new Error('Failed to close card checkout')
      )
    }
  }, [closeWidget])

  const handleLeave = useCallback(() => {
    // The signed intent is durable. Parent unmount closes the iframe immediately;
    // a later mount resumes exact recovery without waiting on delivery polling.
    setActionError(null)
    onActiveFlowChange?.(false)
    onLeave?.()
  }, [onActiveFlowChange, onLeave])

  return (
    <div className="bg-muted flex flex-col gap-4 rounded-[10px] p-5">
      <div>
        <h2 className="text-foreground text-[28px] leading-8 font-medium">
          Complete your purchase
        </h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Buy {token.symbol} and deposit it directly into your Privana balance.
        </p>
      </div>

      <div className="border-border bg-card rounded-lg border p-3 text-sm">
        <p className="text-foreground font-medium">
          Target receipt: at least {amount} {token.symbol}
        </p>
        <p className="text-muted-foreground mt-1">
          In Transak, adjust the fiat amount until “You receive” is at least this target.
        </p>
        {allowance && (
          <p className="text-muted-foreground mt-1">
            The pre-signed lock is 98% of the target, capped by the service allowance.
          </p>
        )}
      </div>

      {widget ? (
        <div className="border-border bg-card overflow-hidden rounded-xl border">
          <div className="border-border flex items-center justify-between border-b px-4 py-2 text-sm">
            <span className="font-medium">Card checkout</span>
            <Button type="button" variant="outline" size="sm" onClick={() => void handleClose()}>
              Close
            </Button>
          </div>
          {widget}
        </div>
      ) : status === 'credited' && !lockPending && !lockError ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CircleCheckIcon className="text-primary size-8" aria-hidden />
          <p className="text-foreground text-sm font-medium">Purchase credited</p>
          <p className="text-muted-foreground text-sm">
            Your {token.symbol} deposit is now available in your balance.
          </p>
        </div>
      ) : !activeIntentId || canRecreateSession ? (
        <Button type="button" disabled={!canOpen} onClick={() => void runCheckout()}>
          {isLaunching && <Loader2 className="animate-spin" aria-hidden />}
          {isLaunching
            ? 'Opening checkout…'
            : activeIntentId
              ? 'Reopen card checkout'
              : allowance
                ? 'Sign policy and open checkout'
                : 'Open card checkout'}
        </Button>
      ) : (
        <p className="text-muted-foreground text-sm">
          This signed purchase is in recovery. Do not open another checkout for it.
        </p>
      )}

      {!depositAddress && !error && !actionError && (
        <p className="text-muted-foreground text-sm">Preparing your secure deposit address…</p>
      )}
      {tokenMismatch && (
        <p className="text-destructive text-sm" role="alert">
          The token configuration changed. Close this purchase and start again.
        </p>
      )}
      {!tokenMismatch && depositAddress && minimumUnknown && !error && !actionError && (
        <p className="text-destructive text-sm" role="alert">
          The minimum purchase amount is unavailable. Close this purchase and try again.
        </p>
      )}
      {belowMinimum && minimumTargetBaseUnits !== undefined && (
        <p className="text-destructive text-sm" role="alert">
          Minimum target is {formatUnits(minimumTargetBaseUnits, token.decimals)} {token.symbol},
          including a 5% delivery buffer.
        </p>
      )}
      {isSettling && pending.length === 0 && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Verifying your purchase…
        </p>
      )}
      {lockPending && (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Purchase credited. Locking your funds…
        </p>
      )}

      {pending.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-foreground text-sm font-medium">Validating purchases</p>
          {pending.map((record) => {
            const isActivelyVerifying = record.transaction_id === activeVerificationId
            const progress = parseFinalityProgress(finalityProgress[record.transaction_id])
            const showRetry = canRetryOnRampVerification(record, activeVerificationId)
            return (
              <div
                key={record.transaction_id}
                className="border-border flex flex-col gap-2 rounded-md border p-2"
              >
                <p className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  {record.on_chain_tx_hash
                    ? (progress ?? (isActivelyVerifying ? 'Verifying…' : 'Ready to verify'))
                    : 'Waiting for provider delivery…'}
                </p>
                {rowError?.id === record.transaction_id && (
                  <p className="text-destructive text-xs">{rowError.message}</p>
                )}
                {showRetry && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      setRowError(null)
                      try {
                        await finishPendingVerification(record)
                      } catch (nextError) {
                        setRowError({
                          id: record.transaction_id,
                          message:
                            nextError instanceof Error ? nextError.message : 'Verification failed',
                        })
                      }
                    }}
                  >
                    Retry verification
                  </Button>
                )}
                {!record.on_chain_tx_hash && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void refreshPending()}
                  >
                    Refresh delivery
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {onLeave && ownedFlowActive && !unsafeToClose && (
        <div className="flex flex-col gap-1">
          <Button type="button" variant="outline" onClick={handleLeave}>
            Leave checkout
          </Button>
          <p className="text-muted-foreground text-xs">
            Privana will keep this signed purchase available for exact recovery.
          </p>
        </div>
      )}

      {(actionError ?? error) && (
        <p className="text-destructive text-sm" role="alert">
          {(actionError ?? error)?.message}
        </p>
      )}
      {lockError && (
        <p className="text-destructive text-sm" role="alert">
          Purchase credited, but locking the funds failed: {lockError.message}
        </p>
      )}
    </div>
  )
}

function parseFinalityProgress(message: string | undefined): string | null {
  if (!message) return null
  const match = message.match(/(\d+\/\d+)\s+confirmations/i)
  return match ? `${match[1]} confirmations` : null
}
