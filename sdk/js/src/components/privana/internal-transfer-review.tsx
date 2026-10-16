'use client'

import { useState, type ReactNode } from 'react'
import type { TokenConfig } from '@/sdk/types/tokens'
import { useHistory } from '@/sdk/hooks'
import { formatTokenAmount } from '@/sdk/utils/amount-format'

function ReviewRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground shrink-0">{label}</dt>
      <dd className="text-foreground min-w-0 text-right">{children}</dd>
    </div>
  )
}

function ReviewAddress({ address }: { address: string }) {
  return (
    <span className="break-all">
      <span className="font-semibold">{address.slice(0, 6)}</span>
      <span className="text-muted-foreground">{address.slice(6, -4)}</span>
      <span className="font-semibold">{address.slice(-4)}</span>
    </span>
  )
}

export function InternalTransferReview({
  token,
  amount,
  toAddress,
  chainName,
  amountError,
  confirmDisabled,
  onBack,
  onConfirm,
}: {
  token: TokenConfig
  amount: bigint
  toAddress: string
  chainName: string | undefined
  amountError?: string
  confirmDisabled: boolean
  onBack: () => void
  onConfirm: () => void
}) {
  const [acknowledged, setAcknowledged] = useState(false)
  const { history, isLoading: isHistoryLoading } = useHistory()
  const firstSend = !history.some(
    (entry) =>
      entry.kind === 'transferBalanceOut' &&
      entry.counterparty?.toLowerCase() === toAddress.toLowerCase()
  )

  return (
    <div className="bg-muted flex flex-col gap-6 rounded-[10px] p-5">
      <h2 className="text-foreground text-[28px] leading-8 font-medium">Review transfer</h2>

      <dl className="flex flex-col gap-3 text-sm">
        <ReviewRow label="Amount">
          <span className="text-xl font-medium">
            {formatTokenAmount(amount, token).display} {token.symbol}
          </span>
        </ReviewRow>
        <ReviewRow label="To">
          <ReviewAddress address={toAddress} />
        </ReviewRow>
        <ReviewRow label="From">Your Available balance · {chainName ?? '—'}</ReviewRow>
        <ReviewRow label="Fee">Free</ReviewRow>
      </dl>
      {amountError && <p className="text-destructive text-sm">{amountError}</p>}

      <p className="rounded-[10px] bg-amber-500/10 px-3 py-2.5 text-sm text-amber-400">
        Internal transfers cannot be undone. Send only to an address whose owner uses it with
        Privana.
      </p>

      {!isHistoryLoading && firstSend && (
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 shrink-0 cursor-pointer"
          />
          <span className="text-foreground">
            I checked this address with the recipient. I have not sent to it before.
          </span>
        </label>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onBack}
          className="border-border text-foreground hover:bg-secondary flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] border px-3 py-2 text-sm font-medium transition-colors"
        >
          Back
        </button>
        <button
          type="button"
          disabled={confirmDisabled || isHistoryLoading || (firstSend && !acknowledged)}
          onClick={onConfirm}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex h-10 flex-1 cursor-pointer items-center justify-center rounded-[10px] px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          Confirm and sign
        </button>
      </div>
    </div>
  )
}
