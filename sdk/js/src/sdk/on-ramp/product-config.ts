import { parseUnits, zeroAddress } from 'viem'
import type { Allowance } from '../types/allowance'
import type { Address, OnRampConfig, OnRampProvider } from '../types'
import type { PostDepositLockError } from '../utils/pending-lock'
import type { TokenConfig } from '../types/tokens'

const BYTES32_PATTERN = /^0x[0-9a-fA-F]{64}$/
const PROVIDER_ASSET_CODE_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/
const TRANSAK_MINIMUM_TARGET_PERCENT = 105n

export interface ProductOnRampSelection {
  provider: OnRampProvider | null
  token: TokenConfig | undefined
  providerAssetCode: string | undefined
  /** Explicit product configuration permits no token picker or fallback. */
  tokenSelectionLocked: boolean
  unavailableReason: string | null
}

export interface ProductOnRampFlowSnapshot {
  /** Local render identity. It contains no credential or signed intent. */
  id: number
  selection: ProductOnRampSelection & {
    provider: OnRampProvider
    token: TokenConfig
    providerAssetCode: string
    unavailableReason: null
  }
  amount: string
  amountBaseUnits: bigint
  allowance: Allowance | undefined
  requiresLock: boolean
  /** Exact service authorized for the optional pre-signed post-credit lock. */
  lockServiceAddress: Address | undefined
  /** Frozen only for the mounted MoonPay provider; never persisted or logged. */
  moonpayApiKey: string | undefined
  /** Exact Privana deployment and authenticated beneficiary that own this flow. */
  scope: ProductOnRampScope
}

export interface ProductOnRampScope {
  apiUrl: string
  accountingChainId: number
  accountingContract: Address
  beneficiaryAddress: Address | null
}

interface ResolveProductOnRampOptions {
  config: OnRampConfig | undefined
  enabledTokens: readonly TokenConfig[]
  /** Current modal selection used only by the legacy MoonPay path. */
  legacyToken: TokenConfig | undefined
  moonpayApiKey: string | undefined
}

/**
 * Resolve the sole product-authorized card flow. Explicit configuration is
 * strict and fail-closed; an absent configuration preserves legacy MoonPay.
 */
export function resolveProductOnRamp({
  config,
  enabledTokens,
  legacyToken,
  moonpayApiKey,
}: ResolveProductOnRampOptions): ProductOnRampSelection {
  if (config === undefined) {
    if (!moonpayApiKey) {
      return unavailable('moonpay', legacyToken, false, 'MoonPay is not configured.')
    }
    if (!legacyToken) {
      return available('moonpay', undefined, undefined, false)
    }
    if (!legacyToken.moonpayCurrencyCode) {
      return unavailable(
        'moonpay',
        legacyToken,
        false,
        `${legacyToken.symbol} isn’t available for card purchases yet.`
      )
    }
    return available('moonpay', legacyToken, legacyToken.moonpayCurrencyCode, false)
  }

  if (!isValidConfig(config)) {
    return unavailable(null, undefined, true, 'Card on-ramp configuration is invalid.')
  }

  const providerAssetCode = config.providerAssetCode.trim().toLowerCase()
  const token = enabledTokens.find(
    (candidate) => candidate.id.toLowerCase() === config.tokenId.toLowerCase()
  )
  if (!token) {
    return unavailable(
      config.provider,
      undefined,
      true,
      'The configured card-purchase token is not enabled.'
    )
  }
  if (token.contract.toLowerCase() === zeroAddress) {
    return unavailable(config.provider, token, true, 'Card purchases require an ERC20 token.')
  }

  if (config.provider === 'moonpay') {
    if (!moonpayApiKey) {
      return unavailable('moonpay', token, true, 'MoonPay is not configured.')
    }
    if (
      !token.moonpayCurrencyCode ||
      token.moonpayCurrencyCode.toLowerCase() !== providerAssetCode
    ) {
      return unavailable(
        'moonpay',
        token,
        true,
        'The configured MoonPay asset does not match the selected token.'
      )
    }
  }

  return available(config.provider, token, providerAssetCode, true)
}

/** Freeze every user-authorized field before the provider flow is mounted. */
export function createProductOnRampFlowSnapshot({
  id,
  selection,
  amount,
  allowance,
  lockServiceAddress,
  moonpayApiKey,
  scope,
}: {
  id: number
  selection: ProductOnRampSelection
  amount: string
  allowance: Allowance | undefined
  lockServiceAddress: Address | undefined
  moonpayApiKey: string | undefined
  scope: ProductOnRampScope
}): ProductOnRampFlowSnapshot {
  if (
    selection.unavailableReason ||
    !selection.provider ||
    !selection.token ||
    !selection.providerAssetCode
  ) {
    throw new Error(selection.unavailableReason ?? 'Card on-ramp configuration is unavailable.')
  }
  const amountBaseUnits = parseUnits(amount, selection.token.decimals)
  if (amountBaseUnits <= 0n) throw new Error('Card purchase amount must be positive.')
  if (!scope.beneficiaryAddress) {
    throw new Error('Sign in or connect a wallet before starting a card purchase.')
  }
  if (allowance && !lockServiceAddress) {
    throw new Error('The lock service address is not configured.')
  }

  return {
    id,
    selection: {
      ...selection,
      provider: selection.provider,
      token: { ...selection.token },
      providerAssetCode: selection.providerAssetCode,
      unavailableReason: null,
    },
    amount,
    amountBaseUnits,
    allowance: cloneAllowance(allowance),
    requiresLock: allowance !== undefined,
    lockServiceAddress: allowance ? lockServiceAddress : undefined,
    moonpayApiKey: selection.provider === 'moonpay' ? moonpayApiKey : undefined,
    scope: { ...scope },
  }
}

/** A submitted flow is valid only for the deployment and beneficiary that created it. */
export function matchesProductOnRampScope(
  expected: ProductOnRampScope,
  current: ProductOnRampScope
): boolean {
  return (
    expected.apiUrl === current.apiUrl &&
    expected.accountingChainId === current.accountingChainId &&
    expected.accountingContract.toLowerCase() === current.accountingContract.toLowerCase() &&
    expected.beneficiaryAddress?.toLowerCase() === current.beneficiaryAddress?.toLowerCase()
  )
}

export function isMoonPayProductOnRamp(selection: ProductOnRampSelection): boolean {
  return selection.provider === 'moonpay' && !selection.unavailableReason
}

/** Add the provider-delivery margin and round up in token base units. */
export function getTransakMinimumTargetBaseUnits(minimum: bigint): bigint {
  return (minimum * TRANSAK_MINIMUM_TARGET_PERCENT + 99n) / 100n
}

export function getOnRampTokenFingerprint(token: TokenConfig | undefined): string {
  if (!token) return ''
  return [token.id.toLowerCase(), token.contract.toLowerCase(), token.chainId, token.decimals].join(
    '\u0000'
  )
}

/**
 * The frozen snapshot token is the launch authority. The shared core resolves
 * its token from live configuration by id, so a host config change between
 * snapshot and launch must fail closed instead of silently diverging.
 */
export function matchesFrozenOnRampToken(
  frozen: TokenConfig,
  live: TokenConfig | undefined
): boolean {
  return live !== undefined && getOnRampTokenFingerprint(live) === getOnRampTokenFingerprint(frozen)
}

/** One outcome policy shared by both product provider leaves. */
export function createProductOnRampOutcomeCallbacks({
  requiresLock,
  onComplete,
  onLockFailed,
}: {
  requiresLock: boolean
  onComplete: () => void
  onLockFailed: (error: PostDepositLockError) => void
}): {
  onCredited: (() => void) | undefined
  onLockSubmitted: () => void
  onLockFailed: (error: PostDepositLockError) => void
} {
  return {
    onCredited: requiresLock ? undefined : onComplete,
    onLockSubmitted: onComplete,
    onLockFailed,
  }
}

function isValidConfig(config: OnRampConfig): boolean {
  const candidate: unknown = config
  if (!isPlainRecord(candidate)) return false
  if (candidate.provider !== 'moonpay' && candidate.provider !== 'transak') return false
  if (typeof candidate.tokenId !== 'string' || !BYTES32_PATTERN.test(candidate.tokenId)) {
    return false
  }
  return (
    typeof candidate.providerAssetCode === 'string' &&
    PROVIDER_ASSET_CODE_PATTERN.test(candidate.providerAssetCode.trim())
  )
}

function available(
  provider: OnRampProvider,
  token: TokenConfig | undefined,
  providerAssetCode: string | undefined,
  tokenSelectionLocked: boolean
): ProductOnRampSelection {
  return {
    provider,
    token,
    providerAssetCode,
    tokenSelectionLocked,
    unavailableReason: null,
  }
}

function unavailable(
  provider: OnRampProvider | null,
  token: TokenConfig | undefined,
  tokenSelectionLocked: boolean,
  unavailableReason: string
): ProductOnRampSelection {
  return {
    provider,
    token,
    providerAssetCode: undefined,
    tokenSelectionLocked,
    unavailableReason,
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function cloneAllowance(allowance: Allowance | undefined): Allowance | undefined {
  if (!allowance) return undefined
  return {
    value: allowance.value,
    minAmount: allowance.minAmount,
    lockDuration: allowance.lockDuration,
    terms: allowance.terms
      ? {
          permissions: allowance.terms.permissions?.map((term) => ({ ...term })),
          restrictions: allowance.terms.restrictions?.map((term) => ({ ...term })),
        }
      : undefined,
  }
}
