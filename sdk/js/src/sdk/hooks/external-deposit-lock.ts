import type { PrivanaClient } from '../client'
import type {
  Address,
  Bytes32,
  LockFundsRequest,
  TransactionSubmissionResponse,
} from '../types'
import {
  getSharedBrowserStorageItem,
  removeSharedBrowserStorageItem,
  setSharedBrowserStorageItem,
} from './browser-storage'
import { AccountingApiError } from '../client/errors'
import { PostDepositLockError, submitPendingLock } from './pending-lock'

const ACTIVE_SESSION_PREFIX = 'privana:external-deposit-lock:active:'
const SESSION_PREFIX = 'privana:external-deposit-lock:session:'

export interface ExternalDepositVerificationRecord {
  hash: `0x${string}`
  chainId: number
  amount: string
  logIndex?: number
}

export interface ExternalDepositLockSessionRecord {
  version: 1
  owner: Address
  serviceAddress: Address
  chainId: number
  tokenId: Bytes32
  /** Latest source block observed after signing; older candidates cannot consume this policy. */
  startBlock: number
  depositAmount: string
  maxLockAmount: string
  lockDuration: number
  generation: string
  verification?: ExternalDepositVerificationRecord
  creditedAmount?: string
  /** Once an API attempt starts, recovery may only replay this exact signature. */
  submissionAmbiguous?: boolean
  payload?: LockFundsRequest
}

export class ExternalDepositLockSessionChangedError extends Error {
  constructor() {
    super('External deposit lock session changed')
    this.name = 'ExternalDepositLockSessionChangedError'
    Object.setPrototypeOf(this, ExternalDepositLockSessionChangedError.prototype)
  }
}

export function externalDepositSessionId(chainId: number, tokenId: string): string {
  return `${chainId}:${tokenId.toLowerCase()}`
}

export function isExternalDepositBlockInSession(
  session: ExternalDepositLockSessionRecord,
  blockNumber: number
): boolean {
  return Number.isSafeInteger(blockNumber) && blockNumber > session.startBlock
}

/** True only while a verification callback still owns the active, uncredited candidate. */
export function isCurrentExternalDepositVerification(
  session: ExternalDepositLockSessionRecord,
  txHash: string
): boolean {
  return (
    session.creditedAmount === undefined &&
    session.verification?.hash.toLowerCase() === txHash.toLowerCase()
  )
}

function activeSessionKey(owner: string): string {
  return `${ACTIVE_SESSION_PREFIX}${owner.toLowerCase()}`
}

function sessionKey(owner: string, sessionId: string): string {
  return `${SESSION_PREFIX}${owner.toLowerCase()}:${sessionId}`
}

function activeSessionId(owner: string): string | undefined {
  const value = getSharedBrowserStorageItem(activeSessionKey(owner))
  return value || undefined
}

function isPositiveIntegerString(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    return BigInt(value) > 0n
  } catch {
    return false
  }
}

function isSessionRecord(value: unknown): value is ExternalDepositLockSessionRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<ExternalDepositLockSessionRecord>
  if (
    record.version !== 1 ||
    typeof record.owner !== 'string' ||
    typeof record.serviceAddress !== 'string' ||
    !Number.isInteger(record.chainId) ||
    (record.chainId ?? 0) <= 0 ||
    typeof record.tokenId !== 'string' ||
    !Number.isSafeInteger(record.startBlock) ||
    (record.startBlock ?? -1) < 0 ||
    !isPositiveIntegerString(record.depositAmount) ||
    !isPositiveIntegerString(record.maxLockAmount) ||
    !Number.isInteger(record.lockDuration) ||
    (record.lockDuration ?? 0) <= 0 ||
    typeof record.generation !== 'string' ||
    !record.generation ||
    (record.submissionAmbiguous !== undefined && typeof record.submissionAmbiguous !== 'boolean') ||
    (record.creditedAmount !== undefined && !isPositiveIntegerString(record.creditedAmount))
  ) {
    return false
  }
  if (
    record.verification &&
    (typeof record.verification.hash !== 'string' ||
      record.verification.chainId !== record.chainId ||
      !isPositiveIntegerString(record.verification.amount) ||
      (record.verification.logIndex !== undefined &&
        (!Number.isInteger(record.verification.logIndex) || record.verification.logIndex < 0)))
  ) {
    return false
  }
  if (record.verification && record.creditedAmount !== undefined) return false
  if (record.submissionAmbiguous && record.creditedAmount === undefined) return false
  if (!record.payload) {
    return record.creditedAmount !== undefined && !record.submissionAmbiguous
  }
  if (
    typeof record.payload.signature !== 'string' ||
    typeof record.payload.token_id !== 'string' ||
    typeof record.payload.service_address !== 'string' ||
    record.payload.signature !== record.generation ||
    record.payload.token_id.toLowerCase() !== record.tokenId.toLowerCase() ||
    record.payload.service_address.toLowerCase() !== record.serviceAddress.toLowerCase() ||
    !isPositiveIntegerString(record.payload.amount)
  ) {
    return false
  }
  return BigInt(record.payload.amount) <= BigInt(record.maxLockAmount)
}

function writeSessionRecord(session: ExternalDepositLockSessionRecord): boolean {
  const id = externalDepositSessionId(session.chainId, session.tokenId)
  return setSharedBrowserStorageItem(sessionKey(session.owner, id), JSON.stringify(session))
}

export function saveExternalDepositLockSession(
  session: ExternalDepositLockSessionRecord,
  expectedSession: ExternalDepositLockSessionRecord | null = null
): void {
  if (!isSessionRecord(session)) throw new Error('Invalid external deposit lock session')
  const current = loadExternalDepositLockSession(session.owner)
  if (
    (expectedSession === null && current) ||
    (expectedSession !== null && (!current || !isSameSessionSnapshot(current, expectedSession)))
  ) {
    throw new ExternalDepositLockSessionChangedError()
  }
  const nextId = externalDepositSessionId(session.chainId, session.tokenId)
  const previousId = activeSessionId(session.owner)
  if (!writeSessionRecord(session)) {
    throw new Error('Unable to persist external deposit lock session')
  }
  if (previousId !== nextId) {
    if (!setSharedBrowserStorageItem(activeSessionKey(session.owner), nextId)) {
      removeSharedBrowserStorageItem(sessionKey(session.owner, nextId))
      throw new Error('Unable to persist external deposit lock session')
    }
    if (previousId) {
      removeSharedBrowserStorageItem(sessionKey(session.owner, previousId))
    }
  }
}

export function loadExternalDepositLockSession(
  owner: Address
): ExternalDepositLockSessionRecord | undefined {
  const id = activeSessionId(owner)
  if (!id) return undefined
  const key = sessionKey(owner, id)
  try {
    const raw = getSharedBrowserStorageItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : undefined
    if (
      !isSessionRecord(parsed) ||
      parsed.owner.toLowerCase() !== owner.toLowerCase() ||
      externalDepositSessionId(parsed.chainId, parsed.tokenId) !== id
    ) {
      removeSharedBrowserStorageItem(key)
      removeSharedBrowserStorageItem(activeSessionKey(owner))
      return undefined
    }
    return parsed
  } catch {
    removeSharedBrowserStorageItem(key)
    removeSharedBrowserStorageItem(activeSessionKey(owner))
    return undefined
  }
}

export function subscribeExternalDepositLockSession(
  owner: Address,
  onChange: (session: ExternalDepositLockSessionRecord | undefined) => void
): () => void {
  if (typeof window === 'undefined') return () => undefined

  let localStorage: Storage
  try {
    localStorage = window.localStorage
  } catch {
    return () => undefined
  }

  const activeKey = activeSessionKey(owner)
  const ownerSessionPrefix = `${SESSION_PREFIX}${owner.toLowerCase()}:`
  const handleStorage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return
    if (
      event.key !== null &&
      event.key !== activeKey &&
      !event.key.startsWith(ownerSessionPrefix)
    ) {
      return
    }
    onChange(loadExternalDepositLockSession(owner))
  }

  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}

export function clearExternalDepositLockSession(
  owner: Address,
  expectedSessionId?: string,
  expectedGeneration?: string
): void {
  const id = activeSessionId(owner)
  if (!id || (expectedSessionId && id !== expectedSessionId)) return
  if (expectedGeneration) {
    const current = loadExternalDepositLockSession(owner)
    if (!current || current.generation !== expectedGeneration) return
  }
  removeSharedBrowserStorageItem(sessionKey(owner, id))
  removeSharedBrowserStorageItem(activeSessionKey(owner))
}

function isSameVerification(
  left: ExternalDepositVerificationRecord | undefined,
  right: ExternalDepositVerificationRecord | undefined
): boolean {
  if (!left || !right) return left === right
  return (
    left.hash.toLowerCase() === right.hash.toLowerCase() &&
    left.chainId === right.chainId &&
    left.amount === right.amount &&
    (left.logIndex ?? 0) === (right.logIndex ?? 0)
  )
}

function isSamePayload(left: LockFundsRequest | undefined, right: LockFundsRequest | undefined) {
  if (!left || !right) return left === right
  return (
    left.service_address.toLowerCase() === right.service_address.toLowerCase() &&
    left.token_id.toLowerCase() === right.token_id.toLowerCase() &&
    left.amount === right.amount &&
    left.expiry === right.expiry &&
    left.nonce === right.nonce &&
    left.signature === right.signature
  )
}

function isSameSessionSnapshot(
  left: ExternalDepositLockSessionRecord,
  right: ExternalDepositLockSessionRecord
): boolean {
  return (
    left.version === right.version &&
    left.owner.toLowerCase() === right.owner.toLowerCase() &&
    left.serviceAddress.toLowerCase() === right.serviceAddress.toLowerCase() &&
    left.chainId === right.chainId &&
    left.tokenId.toLowerCase() === right.tokenId.toLowerCase() &&
    left.startBlock === right.startBlock &&
    left.depositAmount === right.depositAmount &&
    left.maxLockAmount === right.maxLockAmount &&
    left.lockDuration === right.lockDuration &&
    left.generation === right.generation &&
    left.creditedAmount === right.creditedAmount &&
    left.submissionAmbiguous === right.submissionAmbiguous &&
    isSameVerification(left.verification, right.verification) &&
    isSamePayload(left.payload, right.payload)
  )
}

export function isSameExternalDepositLockSession(
  left: ExternalDepositLockSessionRecord,
  right: ExternalDepositLockSessionRecord
): boolean {
  return isSameSessionSnapshot(left, right)
}

/**
 * Clears only the exact failed verification candidate. The signed policy and
 * source-chain boundary stay intact so discovery can continue safely.
 */
export function clearExternalDepositVerification(
  session: ExternalDepositLockSessionRecord
): ExternalDepositLockSessionRecord | undefined {
  if (!session.verification || session.creditedAmount) return undefined
  const current = loadExternalDepositLockSession(session.owner)
  if (
    !current ||
    current.generation !== session.generation ||
    current.creditedAmount ||
    !isSameVerification(current.verification, session.verification)
  ) {
    return undefined
  }
  const next = { ...current, verification: undefined }
  if (!writeSessionRecord(next)) {
    throw new Error('Unable to clear failed deposit verification')
  }
  return next
}

/** Clear a recovery session only when no cross-tab progress replaced the snapshot. */
export function discardExternalDepositLockSession(
  session: ExternalDepositLockSessionRecord
): boolean {
  const current = loadExternalDepositLockSession(session.owner)
  if (!current) return true
  if (!isSameSessionSnapshot(current, session)) return false
  clearExternalDepositLockSession(
    current.owner,
    externalDepositSessionId(current.chainId, current.tokenId),
    current.generation
  )
  return loadExternalDepositLockSession(current.owner) === undefined
}

function clearSubmittedPayload(
  session: ExternalDepositLockSessionRecord,
  signature: string,
  clearAmbiguous = false
): boolean {
  const current = loadExternalDepositLockSession(session.owner)
  if (
    !current?.payload ||
    current.payload.signature !== signature ||
    (current.submissionAmbiguous && !clearAmbiguous)
  ) {
    return false
  }
  return writeSessionRecord({ ...current, submissionAmbiguous: undefined, payload: undefined })
}

function markSubmissionAmbiguous(
  session: ExternalDepositLockSessionRecord,
  signature: string
): boolean {
  const current = loadExternalDepositLockSession(session.owner)
  if (!current?.payload || current.payload.signature !== signature) return false
  if (current.submissionAmbiguous) return true
  return writeSessionRecord({ ...current, submissionAmbiguous: true })
}

function ambiguousSubmissionError(error: PostDepositLockError): PostDepositLockError {
  return new PostDepositLockError(
    'Lock submission could not be confirmed. Retry only the saved signature, or check locked funds before stopping recovery.',
    error.reason,
    error.signedAmount,
    error.creditedAmount,
    {
      cause: error.cause,
      submissionMayHaveSucceeded: true,
    }
  )
}

function isDefinitiveSubmissionFailure(error: PostDepositLockError): boolean {
  const cause = error.cause
  return cause instanceof AccountingApiError && cause.statusCode !== 408 && cause.statusCode < 500
}

function submissionLockName(session: ExternalDepositLockSessionRecord): string {
  return `privana:external-deposit-lock:submit:${session.owner.toLowerCase()}:${externalDepositSessionId(session.chainId, session.tokenId)}`
}

async function withSubmissionLock<T>(
  session: ExternalDepositLockSessionRecord,
  task: (crossTabExclusive: boolean) => Promise<T>
): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  if (!locks) return task(false)
  return locks.request(submissionLockName(session), () => task(true))
}

export function externalDepositRetryAmount(session: ExternalDepositLockSessionRecord): bigint {
  if (!session.creditedAmount) throw new Error('No credited external deposit to recover')
  const creditedAmount = BigInt(session.creditedAmount)
  const maxLockAmount = BigInt(session.maxLockAmount)
  return creditedAmount < maxLockAmount ? creditedAmount : maxLockAmount
}

export async function submitExternalDepositLock(
  client: PrivanaClient,
  session: ExternalDepositLockSessionRecord
): Promise<TransactionSubmissionResponse> {
  return withSubmissionLock(session, async (crossTabExclusive) => {
    const current = loadExternalDepositLockSession(session.owner)
    if (!current || current.generation !== session.generation) {
      throw new PostDepositLockError(
        'External deposit lock session changed before submission',
        'not-found',
        BigInt(session.maxLockAmount),
        session.creditedAmount ? BigInt(session.creditedAmount) : undefined
      )
    }
    const result = await submitExternalDepositLockAttempt(client, current, crossTabExclusive)
    clearExternalDepositLockSession(
      current.owner,
      externalDepositSessionId(current.chainId, current.tokenId),
      current.generation
    )
    return result
  })
}

async function submitExternalDepositLockAttempt(
  client: PrivanaClient,
  session: ExternalDepositLockSessionRecord,
  crossTabExclusive: boolean
): Promise<TransactionSubmissionResponse> {
  const creditedAmount = session.creditedAmount ? BigInt(session.creditedAmount) : undefined
  if (!creditedAmount) {
    throw new PostDepositLockError(
      'External deposit has not been credited',
      'submission-failed',
      BigInt(session.maxLockAmount)
    )
  }
  const payload = session.payload
  if (!payload) {
    throw new PostDepositLockError(
      'No persisted signed policy found for this deposit session',
      'not-found',
      BigInt(session.maxLockAmount),
      creditedAmount
    )
  }
  try {
    return await submitPendingLock({
      client,
      payload,
      creditedAmount,
      beforeSubmit: () => {
        if (!markSubmissionAmbiguous(session, payload.signature)) {
          throw new Error('Unable to persist lock submission recovery state')
        }
      },
    })
  } catch (err) {
    if (
      err instanceof PostDepositLockError &&
      err.reason === 'submission-failed' &&
      crossTabExclusive &&
      !session.submissionAmbiguous &&
      isDefinitiveSubmissionFailure(err)
    ) {
      if (!clearSubmittedPayload(session, payload.signature, true)) {
        const latest = loadExternalDepositLockSession(session.owner)
        if (latest?.submissionAmbiguous) throw ambiguousSubmissionError(err)
      }
    } else if (err instanceof PostDepositLockError && err.reason === 'submission-failed') {
      const ambiguous =
        markSubmissionAmbiguous(session, payload.signature) ||
        loadExternalDepositLockSession(session.owner)?.submissionAmbiguous === true
      if (ambiguous) throw ambiguousSubmissionError(err)
    } else {
      const current = loadExternalDepositLockSession(session.owner)
      if (session.submissionAmbiguous || current?.submissionAmbiguous) {
        if (err instanceof PostDepositLockError) throw ambiguousSubmissionError(err)
        throw err
      }
      if (!clearSubmittedPayload(session, payload.signature)) {
        const latest = loadExternalDepositLockSession(session.owner)
        if (latest?.submissionAmbiguous && err instanceof PostDepositLockError) {
          throw ambiguousSubmissionError(err)
        }
      }
    }
    throw err
  }
}
