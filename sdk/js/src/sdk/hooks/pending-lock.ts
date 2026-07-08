import type { WalletClient } from 'viem'
import type { PrivanaClient } from '../client'
import { signLockMessage } from '../signatures'
import {
  getBrowserStorageItem,
  removeBrowserStorageItem,
  setBrowserStorageItem,
} from './browser-storage'
import type {
  Address,
  Bytes32,
  LockFundsRequest,
  NetworkConfig,
  TransactionSubmissionResponse,
} from '../types'

/**
 * Deposit-and-lock without backend involvement: the user pre-signs a regular
 * `Lock` (EIP-712) for the exact expected amount before the deposit, the SDK
 * persists the payload, and submits it to POST /funds/lock once the deposit is
 * credited. Every failure fails closed — if the credited amount is short or the
 * nonce went stale, the lock reverts, the funds stay in the user's available
 * balance, and the UI re-prompts a fresh signature at the actual amount.
 * Services must only act on lock confirmation, never on deposit.
 */
export interface PostDepositLockConfig {
  /** Service the funds get locked to. Defaults to the provider's `serviceAddress`. */
  serviceAddress?: Address
  /**
   * Lock lifetime in seconds from signing (default 259200, 3 days). The `Lock` expiry is
   * an absolute timestamp baked into the signature, so it runs from signing
   * time, not from credit time — budget for the expected delivery delay.
   */
  lockDuration?: number
  /**
   * Cap on the locked amount in base units (the allowance the service
   * requested). The signed amount is `min(computed amount, maxAmount)`.
   */
  maxAmount?: bigint
}

/** `PostDepositLockConfig` for on-ramps, where fees make delivery inexact. */
export interface OnRampPostDepositLockConfig extends PostDepositLockConfig {
  /**
   * Fraction shaved off the quoted amount before signing (default 0.02), so
   * settlement-rate drift on slow payment rails can't push the delivered
   * amount below the signed amount. The difference stays in the user's
   * available balance. Card purchases target the quote amount; the buffer
   * mainly matters for bank rails that settle at a later rate.
   */
  buffer?: number
}

// 3 days: on-ramp purchases can sit in manual KYC review or bank-rail
// settlement for more than a day, and a lock that expires before credit
// strands the purchase as credited-without-lock.
export const DEFAULT_LOCK_DURATION_SECONDS = 259200
export const DEFAULT_ONRAMP_LOCK_BUFFER = 0.02

/** Fixed-point scale for the buffer so the shave is integer math (floor). */
const BUFFER_SCALE = 1_000_000n

/**
 * `floor(amount × (1 − buffer))` in base units. Always rounds down so the
 * signed amount never exceeds what the buffer is meant to guarantee.
 */
export function applyLockBuffer(
  amount: bigint,
  buffer: number = DEFAULT_ONRAMP_LOCK_BUFFER
): bigint {
  if (!Number.isFinite(buffer) || buffer < 0 || buffer >= 1) {
    throw new Error(`Lock buffer must be in [0, 1), got ${buffer}`)
  }
  // Quantize the shave to ppm rounding UP (with a hair of tolerance for float
  // representation error, e.g. 0.02 × 1e6 → 20000.000000000004), so a buffer
  // finer than ppm can only shave more, never less.
  const shave = BigInt(Math.max(0, Math.ceil(buffer * Number(BUFFER_SCALE) - 1e-6)))
  return (amount * (BUFFER_SCALE - shave)) / BUFFER_SCALE
}

/**
 * `min(amount, maxAmount)` — the allowance cap the service requested. The
 * signed lock must never exceed it, no matter what the flow computed.
 */
export function clampLockAmount(amount: bigint, maxAmount?: bigint): bigint {
  return maxAmount !== undefined && maxAmount < amount ? maxAmount : amount
}

export interface CreateSignedLockRequestParams {
  client: PrivanaClient
  walletClient: WalletClient
  userAddress: Address
  networkConfig: NetworkConfig
  serviceAddress: Address
  tokenId: Bytes32
  /** Exact amount to lock, in base units. */
  amount: bigint
  lockDuration?: number
}

/**
 * Fetch the user's lock nonce and sign a ready-to-submit `Lock` payload.
 * Validity is bounded by the single-use nonce — any other lock operation by
 * the user invalidates it, which fails closed (revert → re-prompt).
 */
export async function createSignedLockRequest({
  client,
  walletClient,
  userAddress,
  networkConfig,
  serviceAddress,
  tokenId,
  amount,
  lockDuration = DEFAULT_LOCK_DURATION_SECONDS,
}: CreateSignedLockRequestParams): Promise<LockFundsRequest> {
  if (amount <= 0n) {
    throw new Error('Lock amount must be positive')
  }
  const expiry = BigInt(Math.floor(Date.now() / 1000) + lockDuration)
  const { nonce } = await client.getLockNonce(userAddress)
  const signature = await signLockMessage({
    walletClient,
    chainId: networkConfig.chainId,
    verifyingContract: networkConfig.accountingContract,
    message: {
      serviceAddress,
      tokenId,
      amount,
      expiry,
      nonce: BigInt(nonce),
    },
  })
  return {
    service_address: serviceAddress,
    token_id: tokenId,
    amount: amount.toString(),
    expiry: expiry.toString(),
    nonce: String(nonce),
    signature,
  }
}

// Submitting a lock whose expiry is at or past block.timestamp is a
// guaranteed revert; the slack absorbs submission latency.
const EXPIRY_SLACK_SECONDS = 60

/** False once the signed lock's expiry is too close to be worth submitting. */
export function isSignedLockUsable(payload: LockFundsRequest): boolean {
  const expiry = Number(payload.expiry)
  if (!Number.isFinite(expiry)) return false
  return expiry > Math.floor(Date.now() / 1000) + EXPIRY_SLACK_SECONDS
}

export type PostDepositLockFailureReason =
  /** The signed lock's expiry passed before the deposit was credited. */
  | 'expired'
  /** The credited amount is below the signed amount; submitting would revert. */
  | 'credited-below-signed'
  /** The API rejected the submission (stale nonce, revert, transport error). */
  | 'submission-failed'
  /** No persisted signed lock for this deposit (storage cleared, other device). */
  | 'not-found'

/**
 * The deposit itself was credited; only the post-credit lock failed. UIs
 * should re-prompt a fresh `Lock` signature at the actual credited amount.
 */
export class PostDepositLockError extends Error {
  constructor(
    message: string,
    public readonly reason: PostDepositLockFailureReason,
    public readonly signedAmount?: bigint,
    public readonly creditedAmount?: bigint,
    options?: { cause?: unknown }
  ) {
    super(message, options)
    this.name = 'PostDepositLockError'
    Object.setPrototypeOf(this, PostDepositLockError.prototype)
  }
}

export interface SubmitPendingLockParams {
  client: PrivanaClient
  payload: LockFundsRequest
  /** Credited amount in base units, when known — skips a guaranteed revert. */
  creditedAmount?: bigint
}

/**
 * Submit a pre-signed lock after the deposit credited. Throws
 * `PostDepositLockError` on every failure path so callers can route to the
 * re-prompt flow.
 */
export async function submitPendingLock({
  client,
  payload,
  creditedAmount,
}: SubmitPendingLockParams): Promise<TransactionSubmissionResponse> {
  // Guard the parse so a corrupted stored payload surfaces as a typed error
  // instead of a raw TypeError that callers' catch blocks would re-trip on.
  let signedAmount: bigint
  try {
    signedAmount = BigInt(payload.amount)
  } catch (err) {
    throw new PostDepositLockError(
      'Stored signed lock payload is malformed',
      'submission-failed',
      undefined,
      creditedAmount,
      { cause: err }
    )
  }
  if (!isSignedLockUsable(payload)) {
    throw new PostDepositLockError(
      'Signed lock expired before the deposit was credited',
      'expired',
      signedAmount,
      creditedAmount
    )
  }
  if (creditedAmount !== undefined && creditedAmount < signedAmount) {
    throw new PostDepositLockError(
      `Credited amount (${creditedAmount}) is below the signed lock amount (${signedAmount})`,
      'credited-below-signed',
      signedAmount,
      creditedAmount
    )
  }
  try {
    return await client.lockFunds(payload)
  } catch (err) {
    throw new PostDepositLockError(
      err instanceof Error ? err.message : 'Lock submission failed',
      'submission-failed',
      signedAmount,
      creditedAmount,
      { cause: err }
    )
  }
}

interface PendingSignedLock {
  payload: LockFundsRequest
  savedAt: number
}

function pendingLockKey(userAddress: string, correlationId: string): string {
  return `privana:pending-lock:${userAddress.toLowerCase()}:${correlationId}`
}

/**
 * Persist a signed lock so submission survives a page reload between deposit
 * and credit. `correlationId` ties it to the deposit (tx hash) or on-ramp
 * intent (transaction id).
 */
export function savePendingLock(
  userAddress: string,
  correlationId: string,
  payload: LockFundsRequest
): void {
  const record: PendingSignedLock = { payload, savedAt: Date.now() }
  const stored = setBrowserStorageItem(
    pendingLockKey(userAddress, correlationId),
    JSON.stringify(record)
  )
  if (!stored) {
    throw new Error('Unable to persist signed lock for recovery')
  }
}

/**
 * Returns the stored payload even when its expiry passed — expiry belongs to
 * `submitPendingLock`, which reports it as a precise `'expired'` failure.
 */
export function loadPendingLock(
  userAddress: string,
  correlationId: string
): LockFundsRequest | undefined {
  const key = pendingLockKey(userAddress, correlationId)
  try {
    const raw = getBrowserStorageItem(key)
    if (!raw) return undefined
    const record = JSON.parse(raw) as PendingSignedLock
    if (!record?.payload?.signature) {
      removeBrowserStorageItem(key)
      return undefined
    }
    return record.payload
  } catch {
    return undefined
  }
}

export function clearPendingLock(userAddress: string, correlationId: string): void {
  removeBrowserStorageItem(pendingLockKey(userAddress, correlationId))
}
