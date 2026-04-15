'use client'

import { useEffect, useState } from 'react'
import { useTokenInfo, useTokenList } from '@oasisprotocol/flexvaults-sdk'
import { Skeleton } from '../../../../packages/sdk/src/components/ui/skeleton'
import { SectionLabel } from './preview-layout'

export function HooksPreview() {
  const { tokens, isLoading: listLoading, isError: listError, error: listErr } = useTokenList()
  const [selectedTokenId, setSelectedTokenId] = useState<string>('')

  useEffect(() => {
    if (!selectedTokenId && tokens.length > 0) {
      setSelectedTokenId(tokens[0].token_id)
    }
  }, [tokens, selectedTokenId])

  const {
    data: tokenInfo,
    isLoading: infoLoading,
    isError: infoError,
    error: infoErr,
  } = useTokenInfo({ tokenId: selectedTokenId || undefined })

  return (
    <div>
      <SectionLabel>Hooks Preview</SectionLabel>
      <div className="border-border bg-card text-card-foreground space-y-4 rounded-xl border p-4 text-sm">
        <div>
          <p className="mb-2 font-semibold">useTokenList()</p>
          <pre className="bg-background mb-2 overflow-x-auto rounded p-2 text-[11px]">
            {`const { tokens, isLoading, isError, error } = useTokenList()`}
          </pre>
          {listLoading ? (
            <Skeleton className="bg-foreground/10 h-75 w-full" />
          ) : listError ? (
            <p>Error: {listErr?.message}</p>
          ) : (
            <pre className="bg-background max-h-75 overflow-auto rounded p-2 text-[11px]">
              {JSON.stringify(tokens, null, 2)}
            </pre>
          )}
        </div>

        <div>
          <p className="mb-2 font-semibold">useTokenInfo({'{ tokenId }'})</p>
          <pre className="bg-background mb-2 overflow-x-auto rounded p-2 text-[11px]">
            {`const { data, isLoading, isError, error } = useTokenInfo({ tokenId })`}
          </pre>
          <select
            className="border-border bg-background mb-2 w-full rounded border px-2 py-1 text-xs"
            value={selectedTokenId}
            onChange={(e) => setSelectedTokenId(e.target.value)}
            disabled={tokens.length === 0}
          >
            {tokens.map((t) => (
              <option key={t.token_id} value={t.token_id}>
                {t.symbol ?? t.token_id}
              </option>
            ))}
          </select>
          {!selectedTokenId ? (
            <p>Select a token.</p>
          ) : infoLoading ? (
            <Skeleton className="bg-foreground/10 h-[300px] w-full" />
          ) : infoError ? (
            <p>Error: {infoErr?.message}</p>
          ) : tokenInfo ? (
            <pre className="bg-background max-h-[300px] overflow-auto rounded p-2 text-[11px]">
              {JSON.stringify(tokenInfo, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>
    </div>
  )
}
