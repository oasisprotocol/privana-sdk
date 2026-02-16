import type { WalletClient } from 'viem'
import type { Address } from '../types'
import { createDomain, LOCK_TYPES, type LockMessage } from './eip712-types'

export interface SignLockParams {
  walletClient: WalletClient
  chainId: number
  verifyingContract: Address
  message: LockMessage
}

export async function signLockMessage({
  walletClient,
  chainId,
  verifyingContract,
  message,
}: SignLockParams): Promise<`0x${string}`> {
  const account = walletClient.account
  if (!account) {
    throw new Error('No account connected to wallet client')
  }

  const domain = createDomain(chainId, verifyingContract)

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: LOCK_TYPES,
    primaryType: 'Lock',
    message,
  })

  return signature
}

export function createLockExpiry(minutesFromNow: number = 60): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + minutesFromNow * 60)
}
