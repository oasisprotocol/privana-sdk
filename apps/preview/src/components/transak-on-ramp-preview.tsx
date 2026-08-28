'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useAccount } from 'wagmi'
import { useBalance } from '@oasisprotocol/privana-sdk'
import {
  getTransakMinimumTargetBaseUnits,
  useTransakOnRamp,
  type TransakOnRampDebugEvent,
} from '@oasisprotocol/privana-sdk/on-ramp'
import { SectionLabel } from './preview-layout'

const TRANSAK_TOKEN_ID = '0xe0cf8bcfab4702a9404ff78f0d28cb60561ace07e918f9634d039943fd26a7c3'
const TRANSAK_ASSET_CODE = 'usdc'
const EXPECTED_STAGING_ORIGIN = 'https://app.testnet.privana.finance'
const MAX_DEBUG_EVENTS = 100

function shortId(value: string | null | undefined): string {
  if (!value) return 'none'
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value
}

function errorMessage(error: Error): string {
  const detail = 'detail' in error && typeof error.detail === 'string' ? error.detail : null
  return detail ? `${error.message}: ${detail}` : error.message
}

export function TransakOnRampPreview() {
  const { address, isConnected } = useAccount()
  const [lockAfterCredit, setLockAfterCredit] = useState(false)
  const [quoteAmount, setQuoteAmount] = useState('')
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [debugEvents, setDebugEvents] = useState<TransakOnRampDebugEvent[]>([])
  const [browserOrigin, setBrowserOrigin] = useState('')
  const postDepositLock = useMemo(
    () => (lockAfterCredit ? { buffer: 0.02 } : undefined),
    [lockAfterCredit]
  )
  const appendDebugEvent = useCallback((event: TransakOnRampDebugEvent) => {
    setDebugEvents((current) => [...current.slice(-(MAX_DEBUG_EVENTS - 1)), event])
  }, [])

  useEffect(() => {
    setBrowserOrigin(window.location.origin)
  }, [])
  const {
    balanceWei,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
    error: balanceError,
    refetch: refetchBalance,
  } = useBalance({
    tokenId: TRANSAK_TOKEN_ID,
    enabled: isConnected,
  })
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
    finishPendingVerification,
    refreshPending,
    isLaunching,
    isWidgetOpen,
    canRecreateSession,
    widget,
    launch,
    recreateSession,
    closeWidget,
  } = useTransakOnRamp({
    tokenId: TRANSAK_TOKEN_ID,
    postDepositLock,
    iframeTitle: 'Transak staging checkout',
    iframeClassName: 'h-[680px] w-full border-0',
    onCredited: (txHash) => {
      setActionMessage(`Credited deposit ${shortId(txHash)}.`)
      void refetchBalance()
    },
    onLockSubmitted: () => {
      setActionMessage('Deposit credited and the pre-signed lock was submitted.')
      void refetchBalance()
    },
    onLockFailed: (lockError) => {
      setActionMessage(`Deposit credited, but the lock failed: ${errorMessage(lockError)}`)
      void refetchBalance()
    },
    onError: (nextError) => setActionMessage(errorMessage(nextError)),
    onDebugEvent: appendDebugEvent,
  })

  let quoteAmountBaseUnits: bigint | undefined
  if (selectedToken && quoteAmount.trim()) {
    try {
      quoteAmountBaseUnits = parseUnits(quoteAmount, selectedToken.decimals)
    } catch {
      // Keep launch disabled for malformed or over-precision input.
    }
  }
  const minimumTargetBaseUnits =
    minDepositBaseUnits === undefined
      ? undefined
      : getTransakMinimumTargetBaseUnits(minDepositBaseUnits)
  const quoteAmountMeetsMinimum =
    quoteAmountBaseUnits !== undefined &&
    quoteAmountBaseUnits > 0n &&
    minimumTargetBaseUnits !== undefined &&
    quoteAmountBaseUnits >= minimumTargetBaseUnits
  const settingsLocked = Boolean(activeIntentId || isLaunching || isWidgetOpen)
  const canLaunch =
    isConnected &&
    Boolean(selectedToken && depositAddress) &&
    !activeIntentId &&
    !isLaunching &&
    !isWidgetOpen &&
    (!lockAfterCredit || quoteAmountMeetsMinimum)
  const canReopen = Boolean(activeIntentId) && canRecreateSession && !isLaunching && !isWidgetOpen
  const isApprovedOrigin = browserOrigin === EXPECTED_STAGING_ORIGIN

  const runAction = useCallback(async (label: string, action: () => Promise<void>) => {
    setActionMessage(`${label}…`)
    try {
      await action()
      setActionMessage(`${label} complete.`)
    } catch (actionError) {
      setActionMessage(
        actionError instanceof Error ? errorMessage(actionError) : `${label} failed unexpectedly.`
      )
    }
  }, [])

  return (
    <div>
      <SectionLabel>Transak staging E2E</SectionLabel>

      <div className="border-border bg-card text-card-foreground space-y-4 rounded-xl border p-4 text-sm">
        <div>
          <p className="font-semibold">Readiness</p>
          <p className="text-muted-foreground text-xs">
            Uses the live Base Sepolia TRNSK token and the configured staging API.
          </p>
        </div>

        <div className="border-border bg-background grid gap-3 rounded border p-3 text-xs sm:grid-cols-2">
          <div>
            <p className="text-muted-foreground">Wallet</p>
            <p className="font-medium break-all">
              {isConnected ? address : 'Connect a wallet to begin'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Flow status</p>
            <p className="font-medium">{status}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Token</p>
            <p className="font-medium">
              {selectedToken
                ? `${selectedToken.symbol} on chain ${selectedToken.chainId}`
                : 'Waiting for the token registry'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Privana balance</p>
            <p className="font-medium">
              {isBalanceLoading
                ? 'Loading…'
                : isBalanceError
                  ? 'Unavailable'
                  : selectedToken
                    ? `${formatUnits(BigInt(balanceWei || '0'), selectedToken.decimals)} ${selectedToken.symbol}`
                    : 'Waiting for token'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Minimum deposit</p>
            <p className="font-medium">
              {selectedToken && minDepositBaseUnits !== undefined
                ? `${formatUnits(minDepositBaseUnits, selectedToken.decimals)} ${selectedToken.symbol}`
                : 'Loading…'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Active intent</p>
            <p className="font-mono font-medium">{shortId(activeIntentId)}</p>
          </div>
        </div>

        <div>
          <p className="text-muted-foreground text-xs">Deposit address</p>
          <p className="font-mono text-xs break-all">
            {depositAddress ?? 'Waiting for authentication…'}
          </p>
        </div>

        {!isApprovedOrigin && (
          <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Local origin: <span className="font-mono">{browserOrigin || 'unknown'}</span>. The
            harness and staging API can be checked here, but the real widget must be opened from the
            Transak-approved staging origin{' '}
            <span className="font-mono">{EXPECTED_STAGING_ORIGIN}</span>.
          </div>
        )}

        {isBalanceError && (
          <p className="text-destructive text-xs">
            Balance error: {balanceError?.message ?? 'Unable to load balance.'}
          </p>
        )}

        <div className="border-border bg-background space-y-3 rounded border p-3">
          <label className="flex items-start gap-2 text-xs">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={lockAfterCredit}
              disabled={settingsLocked}
              onChange={(event) => setLockAfterCredit(event.target.checked)}
            />
            <span>
              <span className="font-medium">Lock after credit</span>
              <span className="text-muted-foreground block">
                Optional second pass. Pre-signs a 2% buffered lock to the configured Honoroll
                testnet service before creating the purchase intent.
              </span>
            </span>
          </label>

          {lockAfterCredit && (
            <label className="block text-xs">
              <span className="font-medium">Target crypto amount</span>
              <input
                className="border-border bg-card mt-1 w-full rounded border px-2 py-1.5"
                inputMode="decimal"
                placeholder={`Amount in ${selectedToken?.symbol ?? 'TRNSK'}`}
                value={quoteAmount}
                disabled={settingsLocked}
                onChange={(event) => setQuoteAmount(event.target.value.trim())}
              />
              <span className="text-muted-foreground mt-1 block">
                After checkout opens, adjust the fiat payment until Transak estimates at least this
                crypto amount. The signed lock is 98% of this target.
              </span>
              <span className="text-muted-foreground mt-1 block">
                {selectedToken && minimumTargetBaseUnits !== undefined
                  ? `Minimum target: ${formatUnits(minimumTargetBaseUnits, selectedToken.decimals)} ${selectedToken.symbol}, including the 5% delivery buffer.`
                  : 'Loading minimum target…'}
              </span>
            </label>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="bg-primary text-primary-foreground rounded px-3 py-2 text-xs font-medium disabled:opacity-50"
            disabled={!canLaunch}
            onClick={() =>
              void runAction('Launching Transak', () =>
                launch({
                  providerAssetCode: TRANSAK_ASSET_CODE,
                  quoteCurrencyAmount: lockAfterCredit ? quoteAmount : undefined,
                })
              )
            }
          >
            {isLaunching ? 'Launching…' : 'Launch Transak'}
          </button>
          <button
            type="button"
            className="border-border bg-background rounded border px-3 py-2 text-xs font-medium disabled:opacity-50"
            disabled={!isWidgetOpen}
            onClick={() => void runAction('Closing checkout', closeWidget)}
          >
            Close checkout
          </button>
          <button
            type="button"
            className="border-border bg-background rounded border px-3 py-2 text-xs font-medium disabled:opacity-50"
            disabled={!canReopen}
            onClick={() => void runAction('Reopening checkout', recreateSession)}
          >
            Reopen checkout
          </button>
          <button
            type="button"
            className="border-border bg-background rounded border px-3 py-2 text-xs font-medium"
            onClick={() => void runAction('Refreshing pending purchases', refreshPending)}
          >
            Refresh pending
          </button>
        </div>

        {(actionMessage || error) && (
          <p className="border-border bg-background rounded border p-3 text-xs">
            {actionMessage ?? (error ? errorMessage(error) : null)}
          </p>
        )}
      </div>

      {widget && (
        <div className="border-border bg-card mt-4 overflow-hidden rounded-xl border">
          <div className="border-border flex items-center justify-between border-b px-4 py-2 text-xs">
            <span className="font-semibold">Transak checkout</span>
            <button
              type="button"
              className="border-border bg-background rounded border px-2 py-1"
              onClick={() => void runAction('Closing checkout', closeWidget)}
            >
              Close
            </button>
          </div>
          {widget}
        </div>
      )}

      <div className="border-border bg-card text-card-foreground mt-4 space-y-3 rounded-xl border p-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Pending recovery</p>
            <p className="text-muted-foreground text-xs">
              Provider events are hints. These backend rows remain the recovery path after close,
              refresh, or a missed event.
            </p>
          </div>
          <span className="border-border bg-background rounded border px-2 py-1 text-xs">
            {pending.length} row{pending.length === 1 ? '' : 's'}
          </span>
        </div>

        {pending.length === 0 ? (
          <p className="border-border bg-background text-muted-foreground rounded border p-3 text-xs">
            No completed on-ramp is waiting for verification.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map((record) => {
              const isVerifying = activeVerificationId === record.transaction_id
              return (
                <div
                  key={record.transaction_id}
                  className="border-border bg-background space-y-2 rounded border p-3 text-xs"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono font-medium">{shortId(record.transaction_id)}</p>
                      <p className="text-muted-foreground">
                        {record.status} · {record.provider_asset_code.toUpperCase()}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="border-border bg-card rounded border px-2 py-1 font-medium disabled:opacity-50"
                      disabled={isVerifying || !record.on_chain_tx_hash}
                      onClick={() =>
                        void runAction('Verifying pending purchase', () =>
                          finishPendingVerification(record)
                        )
                      }
                    >
                      {isVerifying ? 'Verifying…' : 'Verify'}
                    </button>
                  </div>
                  <p className="font-mono text-[11px] break-all">
                    {record.on_chain_tx_hash ?? 'Waiting for provider delivery hash'}
                  </p>
                  {finalityProgress[record.transaction_id] && (
                    <p className="text-muted-foreground">
                      {finalityProgress[record.transaction_id]}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="border-border bg-card text-card-foreground mt-4 space-y-3 rounded-xl border p-4 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">Diagnostic evidence</p>
            <p className="text-muted-foreground text-xs">
              In-memory SDK transitions only. Session URLs, auth tokens, and signatures are not
              included.
            </p>
          </div>
          <span className="border-border bg-background rounded border px-2 py-1 text-xs">
            {debugEvents.length} event{debugEvents.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="border-border bg-background rounded border px-2 py-1 text-xs"
            onClick={() =>
              void runAction('Copying diagnostics', async () => {
                await navigator.clipboard.writeText(JSON.stringify(debugEvents, null, 2))
              })
            }
          >
            Copy JSON
          </button>
          <button
            type="button"
            className="border-border bg-background rounded border px-2 py-1 text-xs"
            onClick={() => {
              setDebugEvents([])
              setActionMessage('Diagnostics cleared.')
            }}
          >
            Clear
          </button>
        </div>
        <pre className="border-border bg-background max-h-52 overflow-auto rounded border p-3 text-[10px] leading-relaxed">
          {debugEvents.length > 0
            ? JSON.stringify(debugEvents.slice(-8), null, 2)
            : 'No diagnostic events yet.'}
        </pre>
      </div>
    </div>
  )
}
