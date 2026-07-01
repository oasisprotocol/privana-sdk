import type { WalletClient } from 'viem'
import type { Address, Bytes32 } from '../types'
import {
  createDomain,
  DEPOSIT_LOCK_AUTHORIZATION_TYPES,
  type DepositLockAuthorizationMessage,
} from './eip712-types'

export interface SignDepositLockAuthorizationParams {
  walletClient: WalletClient
  chainId: number
  verifyingContract: Address
  message: DepositLockAuthorizationMessage
}

export async function signDepositLockAuthorizationMessage({
  walletClient,
  chainId,
  verifyingContract,
  message,
}: SignDepositLockAuthorizationParams): Promise<`0x${string}`> {
  const account = walletClient.account
  if (!account) {
    throw new Error('No account connected to wallet client')
  }

  const domain = createDomain(chainId, verifyingContract)

  return walletClient.signTypedData({
    account,
    domain,
    types: DEPOSIT_LOCK_AUTHORIZATION_TYPES,
    primaryType: 'DepositLockAuthorization',
    message,
  })
}

export function createDepositLockAuthorizationDeadline(minutesFromNow: number = 60): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutesFromNow * 60)
}

export function createDepositLockDuration(minutes: number = 60): bigint {
  return BigInt(minutes * 60)
}

export function createDepositLockIntentId(): Bytes32 {
  const bytes = new Uint8Array(32)
  globalThis.crypto.getRandomValues(bytes)
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
}
