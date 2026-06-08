'use client'

import { useCallback, useRef, useState } from 'react'
import { formatUnits, parseUnits } from 'viem'
import { useBalance, useDepositVerification, usePrivanaContext } from '@oasisprotocol/privana-sdk'
import { FiatOnRampForm } from '@oasisprotocol/privana-sdk/on-ramp'
import type { FiatOnRampDebugEvent } from '@oasisprotocol/privana-sdk/on-ramp'
import { SectionLabel } from './preview-layout'

type PreviewDebugEvent = FiatOnRampDebugEvent & { source?: 'sdk' }

const MAX_DEBUG_EVENTS = 60
const MOONPAY_CURRENCY_CODE = 'usdc'
// MoonPay's sandbox only delivers MPT (ETH Sepolia). The backend doesn't tag
// which tokens are on-ramp-supported, so we hardcode the single sandbox token here.
const ONRAMP_TOKEN_ID = '0xbd3a41ffd21be1cfcdca7a4e7755842a5b78c9443fb7ea008e6a7314f0caea87'

export function OnRampPreview() {
  const { enabledTokens, getChainById, tokensStatus, tokensError } = usePrivanaContext()
  const [manualTxHash, setManualTxHash] = useState('')
  const [manualAmount, setManualAmount] = useState('')
  const [manualMessage, setManualMessage] = useState<string | null>(null)
  const debugEventsRef = useRef<PreviewDebugEvent[]>([])
  const selectedToken = enabledTokens.find((token) => token.id === ONRAMP_TOKEN_ID)
  const selectedChain = selectedToken ? getChainById(selectedToken.chainId) : undefined
  const {
    balanceWei,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
    error: balanceError,
    refetch: refetchBalance,
  } = useBalance({
    tokenId: ONRAMP_TOKEN_ID,
    enabled: Boolean(selectedToken),
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
          ) : !selectedToken ? (
            <p>Sandbox MPT token ({ONRAMP_TOKEN_ID.slice(0, 10)}…) is not in the enabled list.</p>
          ) : (
            <>
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
                      : `${formatUnits(BigInt(balanceWei || '0'), selectedToken.decimals)} ${selectedToken.symbol}`}
                </span>
              </div>
              {isBalanceError && (
                <p className="text-destructive mb-3 text-xs">
                  Balance error: {balanceError?.message ?? 'Unable to load balance.'}
                </p>
              )}
              <FiatOnRampForm
                tokenId={ONRAMP_TOKEN_ID}
                currencyCode={MOONPAY_CURRENCY_CODE}
                tokenSymbol={selectedToken.symbol}
                onCredited={(txHash) => {
                  console.log('[on-ramp] credited, verification tx:', txHash)
                  void refetchBalance()
                }}
                onError={(err) => console.error('[on-ramp] error:', err)}
                onDebugEvent={(event) => appendDebugEvent({ ...event, source: 'sdk' })}
              />
            </>
          )}
        </div>
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
