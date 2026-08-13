import type { PrivanaClient } from '../client'
import type {
  Address,
  Bytes32,
  CreateOnRampIntentRequest,
  HexString,
  OnRampProvider,
  OnRampRecord,
} from '../types'

export interface OnRampProviderIntentInput {
  walletAddress: Address
  tokenId: Bytes32
  chainId: number
  providerAssetCode: string
}

export interface OnRampProviderTransactionContext {
  client: PrivanaClient
  intentId: string
  providerTransactionId: string
  tokenId: Bytes32
  chainId: number
}

export interface OnRampProviderDepositContext {
  client: PrivanaClient
  record: OnRampRecord
  depositTxHash: HexString
}

/**
 * The deliberately small backend-facing provider seam. Provider launch UI
 * normalizes its callbacks into `OnRampProviderEvent`; the shared hook owns
 * recovery, receipt verification, credit, and lock settlement.
 */
export interface OnRampProviderAdapter {
  provider: OnRampProvider
  pollPendingWhileOpen: boolean
  buildIntentRequest(input: OnRampProviderIntentInput): CreateOnRampIntentRequest
  registerTransaction?(context: OnRampProviderTransactionContext): Promise<OnRampRecord | undefined>
  /**
   * Optional provider compatibility write after Privana has already credited
   * the verified on-chain deposit. It never authorizes or gates credit.
   */
  recordDeposit?(context: OnRampProviderDepositContext): Promise<OnRampRecord | undefined>
}

export type OnRampProviderEventKind = 'transaction-created' | 'transaction-completed'

export interface OnRampProviderEvent {
  provider: OnRampProvider
  kind: OnRampProviderEventKind
  providerTransactionId: string
  /** Signed Privana intent echoed by the provider, when present. */
  intentId?: string
}

export interface OnRampProviderEventTarget {
  intentId: string
  isActive: boolean
  isStale: boolean
}

export function resolveOnRampProviderEventTarget(
  configuredProvider: OnRampProvider,
  activeIntentId: string | null,
  event: OnRampProviderEvent
): OnRampProviderEventTarget {
  if (event.provider !== configuredProvider) {
    throw new Error(
      `On-ramp event provider ${event.provider} does not match configured adapter ${configuredProvider}`
    )
  }
  if (!event.providerTransactionId) {
    throw new Error('On-ramp provider event is missing a transaction id')
  }

  const intentId = event.intentId || activeIntentId || event.providerTransactionId
  const isActive = activeIntentId !== null && intentId === activeIntentId
  return {
    intentId,
    isActive,
    isStale: activeIntentId !== null && event.intentId !== undefined && !isActive,
  }
}

export function assertOnRampRecordProvider(
  record: OnRampRecord,
  configuredProvider: OnRampProvider
): void {
  if (record.provider !== configuredProvider) {
    throw new Error(
      `On-ramp record provider ${String(record.provider)} does not match configured adapter ${configuredProvider}`
    )
  }
}

export function matchesOnRampTransaction(record: OnRampRecord, transactionId: string): boolean {
  return (
    record.transaction_id === transactionId ||
    record.external_transaction_id === transactionId ||
    record.provider_transaction_id === transactionId ||
    record.moonpay_transaction_id === transactionId
  )
}

export function getOnRampVerificationKey(record: OnRampRecord): string {
  return record.on_chain_tx_hash ?? record.transaction_id
}

export function getOnRampIntentId(record: OnRampRecord): string {
  return record.external_transaction_id ?? record.transaction_id
}

export async function recordOnRampProviderDeposit(
  adapter: OnRampProviderAdapter,
  context: OnRampProviderDepositContext
): Promise<OnRampRecord | undefined> {
  if (context.record.provider !== adapter.provider) return undefined
  return adapter.recordDeposit?.(context)
}

export async function verifyPendingOnRampsSequentially({
  records,
  shouldStop,
  wasTriggered,
  trigger,
  waitForTerminal,
}: {
  records: readonly OnRampRecord[]
  shouldStop: () => boolean
  wasTriggered: (verificationKey: string) => boolean
  trigger: (record: OnRampRecord) => Promise<void>
  waitForTerminal: (verificationKey: string) => Promise<void>
}): Promise<void> {
  for (const record of records) {
    if (shouldStop()) return
    if (!record.on_chain_tx_hash) continue
    const key = getOnRampVerificationKey(record)
    if (wasTriggered(key)) continue
    try {
      await trigger(record)
    } catch {
      continue
    }
    await waitForTerminal(key)
  }
}
