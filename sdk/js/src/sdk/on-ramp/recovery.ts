import { AccountingApiError } from '../client'
import type { PrivanaClient } from '../client'
import type { Address, OnRampRecord, PendingOnRampsResponse } from '../types'
import {
  getBrowserStorageItem,
  removeBrowserStorageItem,
  setBrowserStorageItem,
} from '../hooks/browser-storage'
import { getOnRampVerificationKey } from './provider'

export const MAX_UNRESOLVED_ONRAMP_INTENTS = 10
export const MAX_CREDITED_ONRAMP_VERIFICATIONS = 1_000
/**
 * A pending read can fan out to isolate up to ten invalid signed intents.
 * Ten seconds leaves room under the backend's 20 requests / 60 seconds limit
 * even for that one-time recovery burst.
 */
export const MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS = 10_000
const ONRAMP_INTENT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000
const ONRAMP_RECOVERY_VERSION = 1
const ONRAMP_CREDIT_RECOVERY_VERSION = 1

export interface OnRampRecoveryScope {
  apiUrl: string
  chainId: number
  userAddress: Address
}

export interface UnresolvedOnRampIntent {
  transactionId: string
  savedAt: number
}

interface PersistedOnRampRecovery {
  version: typeof ONRAMP_RECOVERY_VERSION
  intents: UnresolvedOnRampIntent[]
}

export interface CreditedOnRampVerification {
  verificationKey: string
  savedAt: number
}

interface PersistedOnRampCredits {
  version: typeof ONRAMP_CREDIT_RECOVERY_VERSION
  verifications: CreditedOnRampVerification[]
}

function recoveryKey(scope: OnRampRecoveryScope): string {
  const api = encodeURIComponent(scope.apiUrl.replace(/\/$/, ''))
  return `privana:onramp-intents:${api}:${scope.chainId}:${scope.userAddress.toLowerCase()}`
}

function creditedRecoveryKey(scope: OnRampRecoveryScope): string {
  const api = encodeURIComponent(scope.apiUrl.replace(/\/$/, ''))
  return `privana:onramp-credited:${api}:${scope.chainId}:${scope.userAddress.toLowerCase()}`
}

function isIntent(value: unknown): value is UnresolvedOnRampIntent {
  if (!value || typeof value !== 'object') return false
  const intent = value as Partial<UnresolvedOnRampIntent>
  return (
    typeof intent.transactionId === 'string' &&
    intent.transactionId.length > 0 &&
    intent.transactionId.length <= 512 &&
    Number.isFinite(intent.savedAt) &&
    (intent.savedAt ?? 0) > 0
  )
}

function writeIntents(scope: OnRampRecoveryScope, intents: UnresolvedOnRampIntent[]): boolean {
  if (intents.length === 0) {
    removeBrowserStorageItem(recoveryKey(scope))
    return true
  }
  return setBrowserStorageItem(
    recoveryKey(scope),
    JSON.stringify({
      version: ONRAMP_RECOVERY_VERSION,
      intents,
    } satisfies PersistedOnRampRecovery)
  )
}

function isCreditedVerification(value: unknown): value is CreditedOnRampVerification {
  if (!value || typeof value !== 'object') return false
  const verification = value as Partial<CreditedOnRampVerification>
  return (
    typeof verification.verificationKey === 'string' &&
    verification.verificationKey.length > 0 &&
    verification.verificationKey.length <= 512 &&
    Number.isFinite(verification.savedAt) &&
    (verification.savedAt ?? 0) > 0
  )
}

function writeCreditedVerifications(
  scope: OnRampRecoveryScope,
  verifications: CreditedOnRampVerification[]
): boolean {
  const key = creditedRecoveryKey(scope)
  if (verifications.length === 0) {
    removeBrowserStorageItem(key)
    return true
  }
  return setBrowserStorageItem(
    key,
    JSON.stringify({
      version: ONRAMP_CREDIT_RECOVERY_VERSION,
      verifications,
    } satisfies PersistedOnRampCredits)
  )
}

export function loadUnresolvedOnRampIntents(
  scope: OnRampRecoveryScope,
  now = Date.now()
): UnresolvedOnRampIntent[] {
  const key = recoveryKey(scope)
  try {
    const raw = getBrowserStorageItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<PersistedOnRampRecovery>
    if (parsed.version !== ONRAMP_RECOVERY_VERSION || !Array.isArray(parsed.intents)) {
      removeBrowserStorageItem(key)
      return []
    }

    const retained = parsed.intents
      .filter(isIntent)
      .filter((intent) => now - intent.savedAt <= ONRAMP_INTENT_RETENTION_MS)
      .sort((left, right) => left.savedAt - right.savedAt)
      .slice(-MAX_UNRESOLVED_ONRAMP_INTENTS)
    if (retained.length !== parsed.intents.length) writeIntents(scope, retained)
    return retained
  } catch {
    removeBrowserStorageItem(key)
    return []
  }
}

export function rememberUnresolvedOnRampIntent(
  scope: OnRampRecoveryScope,
  transactionId: string,
  now = Date.now()
): boolean {
  const intents = loadUnresolvedOnRampIntents(scope, now).filter(
    (intent) => intent.transactionId !== transactionId
  )
  intents.push({ transactionId, savedAt: now })
  return writeIntents(scope, intents.slice(-MAX_UNRESOLVED_ONRAMP_INTENTS))
}

export function forgetUnresolvedOnRampIntent(
  scope: OnRampRecoveryScope,
  transactionId: string,
  now = Date.now()
): void {
  const intents = loadUnresolvedOnRampIntents(scope, now).filter(
    (intent) => intent.transactionId !== transactionId
  )
  writeIntents(scope, intents)
}

/**
 * Load bounded local markers for deposits already credited by Privana.
 * Provider rows can remain visible after credit, so these keys prevent a
 * reload from submitting the same verified deposit again.
 */
export function loadCreditedOnRampVerifications(
  scope: OnRampRecoveryScope,
  now = Date.now()
): CreditedOnRampVerification[] {
  const key = creditedRecoveryKey(scope)
  try {
    const raw = getBrowserStorageItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<PersistedOnRampCredits>
    if (parsed.version !== ONRAMP_CREDIT_RECOVERY_VERSION || !Array.isArray(parsed.verifications)) {
      removeBrowserStorageItem(key)
      return []
    }

    const retained = parsed.verifications
      .filter(isCreditedVerification)
      .filter((verification) => now - verification.savedAt <= ONRAMP_INTENT_RETENTION_MS)
      .sort((left, right) => left.savedAt - right.savedAt)
      .slice(-MAX_CREDITED_ONRAMP_VERIFICATIONS)
    if (retained.length !== parsed.verifications.length) {
      writeCreditedVerifications(scope, retained)
    }
    return retained
  } catch {
    removeBrowserStorageItem(key)
    return []
  }
}

export function rememberCreditedOnRampVerification(
  scope: OnRampRecoveryScope,
  verificationKey: string,
  now = Date.now()
): boolean {
  if (!verificationKey || verificationKey.length > 512) return false
  const verifications = loadCreditedOnRampVerifications(scope, now).filter(
    (verification) => verification.verificationKey !== verificationKey
  )
  verifications.push({ verificationKey, savedAt: now })
  return writeCreditedVerifications(scope, verifications.slice(-MAX_CREDITED_ONRAMP_VERIFICATIONS))
}

export function filterCreditedOnRampRecords(
  records: readonly OnRampRecord[],
  creditedVerificationKeys: Iterable<string>
): OnRampRecord[] {
  const credited = new Set(creditedVerificationKeys)
  if (credited.size === 0) return [...records]
  return records.filter((record) => !credited.has(getOnRampVerificationKey(record)))
}

export interface InvalidOnRampIntentDisposition {
  activeIntentId: string | null
  invalidatedActiveIntent: boolean
}

/** Remove a definitively rejected recovery hint and its matching in-memory intent. */
export function discardInvalidOnRampIntent(
  scope: OnRampRecoveryScope,
  invalidIntentId: string,
  activeIntentId: string | null
): InvalidOnRampIntentDisposition {
  forgetUnresolvedOnRampIntent(scope, invalidIntentId)
  const invalidatedActiveIntent = activeIntentId === invalidIntentId
  return {
    activeIntentId: invalidatedActiveIntent ? null : activeIntentId,
    invalidatedActiveIntent,
  }
}

export type OnRampCloseRecoveryAction = 'refresh' | 'refresh-and-retain' | 'poll-for-delivery'

/**
 * Provider events are wake-up hints, not proof that no purchase happened.
 * A signed intent must therefore survive a close with no observed event.
 */
export function getOnRampCloseRecoveryAction(
  activeIntentId: string | null,
  purchaseEventObserved: boolean
): OnRampCloseRecoveryAction {
  if (!activeIntentId) return 'refresh'
  return purchaseEventObserved ? 'poll-for-delivery' : 'refresh-and-retain'
}

export function createPendingOnRampReadCoordinator<T>({
  read,
  intervalMs = MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS,
  now = Date.now,
  sleep = (milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
}: {
  read: () => Promise<T>
  intervalMs?: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}): () => Promise<T> {
  const safeInterval = Math.max(
    MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS,
    Number.isFinite(intervalMs) ? intervalMs : MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS
  )
  let inFlight: Promise<T> | null = null
  let nextReadAt = 0

  return () => {
    if (inFlight) return inFlight

    const request = (async () => {
      const delay = Math.max(0, nextReadAt - now())
      if (delay > 0) await sleep(delay)
      nextReadAt = now() + safeInterval
      return read()
    })()
    const tracked: Promise<T> = request.finally(() => {
      if (inFlight === tracked) inFlight = null
    })
    inFlight = tracked
    return tracked
  }
}

export async function getPendingOnRampsWithRecovery({
  client,
  intentIds,
  onInvalidIntent,
}: {
  client: Pick<PrivanaClient, 'getPendingOnRamps'>
  intentIds: readonly string[]
  onInvalidIntent: (intentId: string) => void
}): Promise<PendingOnRampsResponse> {
  const bounded = [...new Set(intentIds)].slice(-MAX_UNRESOLVED_ONRAMP_INTENTS)
  try {
    return await client.getPendingOnRamps(bounded)
  } catch (error) {
    if (!isBadRequest(error) || bounded.length === 0) throw error
  }

  const validResponses: PendingOnRampsResponse[] = []
  for (const intentId of bounded) {
    try {
      validResponses.push(await client.getPendingOnRamps([intentId]))
    } catch (error) {
      if (!isBadRequest(error)) throw error
      onInvalidIntent(intentId)
    }
  }
  if (validResponses.length === 0) return client.getPendingOnRamps([])
  return { pending: mergePendingOnRampRows(validResponses.flatMap((response) => response.pending)) }
}

function mergePendingOnRampRows(rows: readonly OnRampRecord[]): OnRampRecord[] {
  const seen = new Set<string>()
  return rows
    .filter((record) => {
      const identifier = record.provider_transaction_id || record.transaction_id
      const key = `${record.provider}\u0000${identifier}`
      if (!identifier || seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort(
      (left, right) =>
        right.updated_at - left.updated_at ||
        right.created_at - left.created_at ||
        String(right.provider_transaction_id ?? '').localeCompare(
          String(left.provider_transaction_id ?? '')
        )
    )
}

function isBadRequest(error: unknown): boolean {
  return error instanceof AccountingApiError && error.statusCode === 400
}
