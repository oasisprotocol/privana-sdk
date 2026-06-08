'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useBalance, useDepositVerification, usePrivanaContext } from '@oasisprotocol/privana-sdk'
import { FiatOnRampForm } from '@oasisprotocol/privana-sdk/on-ramp'
import type { FiatOnRampDebugEvent } from '@oasisprotocol/privana-sdk/on-ramp'
import { SectionLabel } from './preview-layout'

type PreviewDebugEvent = FiatOnRampDebugEvent & { source?: 'sdk' }

const MAX_DEBUG_EVENTS = 60
const MOONPAY_CURRENCY_CODE = 'usdc'

export function OnRampPreview() {
  const { enabledTokens, getChainById, tokensStatus, tokensError } = usePrivanaContext()
  const [selectedTokenId, setSelectedTokenId] = useState<string>('')
  const [manualTxHash, setManualTxHash] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualMessage, setManualMessage] = useState<string | null>(null)
  const debugEventsRef = useRef<PreviewDebugEvent[]>([])
  const selectedToken = enabledTokens.find((token) => token.id === selectedTokenId)
  const selectedChain = selectedToken ? getChainById(selectedToken.chainId) : undefined
  const {
    balanceWei,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
    error: balanceError,
    refetch: refetchBalance,
  } = useBalance({
    tokenId: selectedTokenId ? (selectedTokenId as `0x${string}`) : undefined,
    enabled: Boolean(selectedTokenId),
  })
  const {
    isVerifying,
    didTimeout,
    verificationFailed,
    error: verificationError,
    verify,
  } = useDepositVerification({
    onCredited: (txHash, response) => {
      setManualMessage(`Credited ${txHash}: ${response.deposit_id ?? 'deposit confirmed'}`)
      void refetchBalance()
    },
    onCheckTimeout: (txHash) => {
      setManualMessage(`Verification is still pending for ${txHash}`)
    },
    onError: (err) => {
      setManualMessage(err.message)
    },
  })

  const appendDebugEvent = useCallback((event: PreviewDebugEvent) => {
    debugEventsRef.current = [...debugEventsRef.current.slice(-(MAX_DEBUG_EVENTS - 1)), event]
  }, [])

  const verifyManualOnRamp = useCallback(async () => {
    if (!selectedToken) {
      setManualMessage('Select a token first.')
      return
    }
    if (!manualTxHash.startsWith('0x')) {
      setManualMessage('Paste the full 0x transaction hash.')
      return
    }
    if (!manualAmount || Number(manualAmount) <= 0) {
      setManualMessage('Enter the delivered token amount shown by MoonPay.')
      return
    }

    setManualMessage(null)
    await verify({
      hash: manualTxHash as `0x${string}`,
      chainId: selectedToken.chainId,
      amount: parseUnits(manualAmount, selectedToken.decimals),
    })
  }, [manualAmount, manualTxHash, selectedToken, verify])

  useEffect(() => {
    if ((!selectedTokenId || !selectedToken) && enabledTokens.length > 0) {
      setSelectedTokenId(enabledTokens[0].id)
    }
  }, [enabledTokens, selectedToken, selectedTokenId])

  return (
    <div>
      <SectionLabel>On Ramp Preview</SectionLabel>
      <div className="border-border bg-card text-card-foreground space-y-4 rounded-xl border p-4 text-sm">
        <div>
          <p className="mb-3 font-semibold">MoonPay on-ramp</p>

          {tokensStatus === 'loading' ? (
            <p>Loading tokens…</p>
          ) : tokensStatus === 'error' ? (
            <p>Error: {tokensError?.message}</p>
          ) : enabledTokens.length === 0 ? (
            <p>No enabled on-ramp tokens.</p>
          ) : (
            <>
              <select
                className="border-border bg-background mb-3 w-full rounded border px-2 py-1 text-xs"
                value={selectedTokenId}
                onChange={(e) => setSelectedTokenId(e.target.value)}
              >
                {enabledTokens.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.symbol ?? t.id} ({getChainById(t.chainId)?.name ?? `Chain ${t.chainId}`})
                  </option>
                ))}
              </select>
              <div className="border-border bg-background mb-3 grid gap-2 rounded border px-3 py-2 text-xs sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground">Privana credit token</p>
                  <p className="font-medium">
                    {selectedToken?.symbol ?? 'Unknown'} on{' '}
                    {selectedChain?.name ?? `chain ${selectedToken?.chainId ?? 'unknown'}`}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">MoonPay sandbox currency</p>
                  <p className="font-medium">{MOONPAY_CURRENCY_CODE.toUpperCase()}</p>
                </div>
              </div>
              <div className="border-border bg-background mb-3 flex items-center justify-between rounded border px-3 py-2 text-xs">
                <span className="text-muted-foreground">Privana balance</span>
                <span className="font-medium">
                  {isBalanceLoading
                    ? 'Loading...'
                    : isBalanceError
                      ? 'Unavailable'
                      : `${formatPreviewBalance(balanceWei, selectedToken?.decimals ?? 18)} ${
                          selectedToken?.symbol ?? ''
                        }`}
                </span>
              </div>
              {isBalanceError && (
                <p className="text-destructive mb-3 text-xs">
                  Balance error: {balanceError?.message ?? 'Unable to load balance.'}
                </p>
              )}
              {selectedTokenId && (
                <FiatOnRampForm
                  tokenId={selectedTokenId as `0x${string}`}
                  currencyCode={MOONPAY_CURRENCY_CODE}
                  tokenSymbol={selectedToken?.symbol}
                  onCredited={(txHash) => {
                    console.log('[on-ramp] credited, verification tx:', txHash)
                    void refetchBalance()
                  }}
                  onError={(err) => console.error('[on-ramp] error:', err)}
                  onDebugEvent={(event) => appendDebugEvent({ ...event, source: 'sdk' })}
                />
              )}
            </>
          )}
        </div>

        <p className="text-muted-foreground text-xs">
          MoonPay delivers the sandbox asset directly to the per-user Privana deposit address — the
          connected wallet is only used for SIWE auth and signs no on-chain transfer. After MoonPay
          completes, the SDK waits for the backend webhook to surface the on-chain tx hash, then
          triggers Privana verification (<code>checkDeposit</code> + <code>getDepositStatus</code>{' '}
          poll). If the tab is closed mid-flow, the row stays in <code>pending</code> for the
          recovery CTA.
        </p>
      </div>

      <div className="border-border bg-card text-card-foreground mt-4 space-y-3 rounded-xl border p-4 text-sm">
        <div>
          <p className="font-semibold">Verify MoonPay tx hash</p>
          <p className="text-muted-foreground text-xs">
            Manual PoC recovery when MoonPay completes but the widget does not emit transaction
            callbacks.
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
          <input
            className="border-border bg-background rounded border px-2 py-1 text-xs"
            placeholder="0x transaction hash"
            value={manualTxHash}
            onChange={(event) => setManualTxHash(event.target.value.trim())}
          />
          <input
            className="border-border bg-background rounded border px-2 py-1 text-xs"
            inputMode="decimal"
            placeholder={`${selectedToken?.symbol ?? 'Token'} amount`}
            value={manualAmount}
            onChange={(event) => setManualAmount(event.target.value.trim())}
          />
          <button
            type="button"
            className="border-border bg-background rounded border px-3 py-1 text-xs font-medium disabled:opacity-50"
            disabled={isVerifying}
            onClick={() => void verifyManualOnRamp()}
          >
            {isVerifying ? 'Verifying...' : 'Verify'}
          </button>
        </div>
        <p className="text-muted-foreground text-xs">
          Selected token: {selectedToken?.symbol ?? 'unknown'} on chain{' '}
          {selectedToken?.chainId ?? 'unknown'}, decimals {selectedToken?.decimals ?? 'unknown'}.
        </p>
        {(manualMessage || verificationError || didTimeout || verificationFailed) && (
          <p className="text-muted-foreground text-xs">
            {manualMessage ??
              verificationError?.message ??
              (didTimeout ? 'Verification timed out.' : 'Verification failed.')}
          </p>
        )}
      </div>

      <div className="border-border bg-card text-card-foreground mt-4 space-y-3 rounded-xl border p-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-semibold">On-ramp debug events</p>
            <p className="text-muted-foreground text-xs">
              Captures MoonPay callbacks and SDK state transitions without updating React state. Use
              DevTools Network for HTTP request bodies.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              className="border-border bg-background rounded border px-2 py-1 text-xs"
              onClick={() =>
                void navigator.clipboard?.writeText(JSON.stringify(debugEventsRef.current, null, 2))
              }
            >
              Copy JSON
            </button>
            <button
              type="button"
              className="border-border bg-background rounded border px-2 py-1 text-xs"
              onClick={() => {
                debugEventsRef.current = []
              }}
            >
              Clear
            </button>
          </div>
        </div>

        <p className="border-border bg-background text-muted-foreground rounded border p-3 text-xs">
          Events are buffered in memory only. Click <span className="font-medium">Copy JSON</span>{' '}
          after a test run.
        </p>
      </div>
    </div>
  )
}

function formatPreviewBalance(balanceWei: string, decimals: number): string {
  try {
    const value = BigInt(balanceWei)
    const formatted = formatUnits(value, decimals)
    const [whole, fraction = ''] = formatted.split('.')
    const trimmedFraction = fraction.replace(/0+$/, '').slice(0, 6)
    if (trimmedFraction) return `${whole}.${trimmedFraction}`
    if (value > 0n && whole === '0') return '<0.000001'
    return whole
  } catch {
    return '0'
  }
}
