import {
  AccountingApiError,
  PrivateReadAuthRequiredError,
  TransferRateLimitedError,
} from '../client'
import { isAddress, zeroAddress } from 'viem'
import type { PrivanaClient } from '../client'
import type {
  Address,
  SystemAddress,
  TransactionSubmissionResponse,
  TransferFundsRequest,
} from '../types'
import { formatTokenAmount, parseAmountInput, type TokenMeta } from './amount-format'

export const TRANSFER_SIGN_IN_MESSAGE = 'Sign in to Privana to send funds.'

const BURN_ADDRESSES: SystemAddress[] = [
  { address: zeroAddress, name: 'Zero address' },
  { address: '0x000000000000000000000000000000000000dEaD', name: 'Burn address' },
]

export function withBuiltInSystemAddresses(
  accountingContract: Address,
  systemAddresses: readonly SystemAddress[] = []
): SystemAddress[] {
  return [
    ...BURN_ADDRESSES,
    { address: accountingContract, name: 'Privana vault' },
    ...systemAddresses,
  ]
}

export async function submitTransfer(
  executePrivateRead: <T>(request: (client: PrivanaClient) => Promise<T>) => Promise<T>,
  request: TransferFundsRequest
): Promise<TransactionSubmissionResponse> {
  try {
    return await executePrivateRead((client) =>
      client.transferFunds(request).catch((error: unknown) => {
        // Mapped here, not below, so a rate-limited sign-in isn't reported as too many transfers.
        if (error instanceof AccountingApiError && error.statusCode === 429) {
          throw new TransferRateLimitedError()
        }
        throw error
      })
    )
  } catch (error) {
    if (
      error instanceof PrivateReadAuthRequiredError ||
      (error instanceof AccountingApiError && error.statusCode === 401)
    ) {
      throw new PrivateReadAuthRequiredError(TRANSFER_SIGN_IN_MESSAGE)
    }
    throw error
  }
}

export function transferRecipientError(
  input: string,
  sender: string | undefined,
  systemAddresses: readonly SystemAddress[]
): string | undefined {
  const to = input.trim()
  if (to === '') return undefined
  if (!/^0x[0-9a-fA-F]{40}$/.test(to)) {
    return 'That does not look like a valid address. It starts with 0x and has 42 characters.'
  }
  if (!isAddress(to)) return 'That address has a typo: its checksum does not match.'

  const lower = to.toLowerCase()
  if (sender && lower === sender.toLowerCase()) {
    return 'That is your own address. Send to someone else.'
  }
  const system = systemAddresses.find((entry) => entry.address.toLowerCase() === lower)
  if (system) {
    return `That is a Privana system address (${system.name}) and cannot receive internal transfers.`
  }
  return undefined
}

export function transferAmountError(
  text: string,
  token: TokenMeta,
  available: bigint | undefined
): string | undefined {
  const parsed = parseAmountInput(text, token)
  if (!parsed.ok) {
    if (parsed.reason === 'empty') return undefined
    if (parsed.reason === 'too-precise') return `Too many decimal places (max: ${token.decimals})`
    if (parsed.reason === 'nan') return 'Enter a valid amount.'
    return 'Enter an amount above zero.'
  }
  if (parsed.raw <= 0n) return 'Enter an amount above zero.'
  if (available !== undefined && parsed.raw > available) {
    const balance = formatTokenAmount(available, token).display
    return `More than your Available balance of ${balance} ${token.symbol}.`
  }
  return undefined
}
