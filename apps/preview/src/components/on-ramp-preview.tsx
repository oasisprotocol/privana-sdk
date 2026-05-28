'use client'

import { useEffect, useState } from 'react'
import { useTokenList } from '@oasisprotocol/privana-sdk'
import { FiatOnRampForm } from '@oasisprotocol/privana-sdk/on-ramp'
import { SectionLabel } from './preview-layout'

export function OnRampPreview() {
  const { tokens, isLoading, isError, error } = useTokenList()
  const [selectedTokenId, setSelectedTokenId] = useState<string>('')

  useEffect(() => {
    if (!selectedTokenId && tokens.length > 0) {
      setSelectedTokenId(tokens[0].token_id)
    }
  }, [tokens, selectedTokenId])

  return (
    <div>
      <SectionLabel>On Ramp Preview</SectionLabel>
      <div className="border-border bg-card text-card-foreground space-y-4 rounded-xl border p-4 text-sm">
        <div>
          <p className="mb-2 font-semibold">{'<FiatOnRampForm />'}</p>
          <pre className="bg-background mb-2 overflow-x-auto rounded p-2 text-[11px]">
            {`<FiatOnRampForm tokenId={...} currencyCode="usdc_base_sepolia" />`}
          </pre>

          {isLoading ? (
            <p>Loading tokens…</p>
          ) : isError ? (
            <p>Error: {error?.message}</p>
          ) : tokens.length === 0 ? (
            <p>No tokens available.</p>
          ) : (
            <>
              <select
                className="border-border bg-background mb-3 w-full rounded border px-2 py-1 text-xs"
                value={selectedTokenId}
                onChange={(e) => setSelectedTokenId(e.target.value)}
              >
                {tokens.map((t) => (
                  <option key={t.token_id} value={t.token_id}>
                    {t.symbol ?? t.token_id} ({t.chain_name})
                  </option>
                ))}
              </select>
              {selectedTokenId && (
                <FiatOnRampForm
                  tokenId={selectedTokenId as `0x${string}`}
                  currencyCode="usdc_base_sepolia"
                  onCredited={(txHash) =>
                    console.log('[on-ramp] credited, verification tx:', txHash)
                  }
                  onError={(err) => console.error('[on-ramp] error:', err)}
                />
              )}
            </>
          )}
        </div>

        <p className="text-muted-foreground text-xs">
          MoonPay delivers USDC directly to the per-user Privana deposit address — the connected
          wallet is only used for SIWE auth and signs no on-chain transfer. After MoonPay completes,
          the SDK waits for the backend webhook to surface the on-chain tx hash, then triggers
          Privana verification (<code>checkDeposit</code> + <code>getDepositStatus</code> poll). If
          the tab is closed mid-flow, the row stays in <code>pending</code> for the recovery CTA.
        </p>
      </div>
    </div>
  )
}
