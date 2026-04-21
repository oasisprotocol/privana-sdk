import type { WalletClient } from 'viem'
import type { Address } from '../types'
import {
  createDomain,
  WITHDRAW_FROM_LOCK_TYPES,
  type WithdrawFromLockMessage,
} from './eip712-types'

export interface SignWithdrawFromLockParams {
  walletClient: WalletClient
  chainId: number
  verifyingContract: Address
  message: WithdrawFromLockMessage
}

export async function signWithdrawFromLockMessage({
  walletClient,
  chainId,
  verifyingContract,
  message,
}: SignWithdrawFromLockParams): Promise<`0x${string}`> {
  const account = walletClient.account
  if (!account) {
    throw new Error('No account connected to wallet client')
  }

  const domain = createDomain(chainId, verifyingContract)

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: WITHDRAW_FROM_LOCK_TYPES,
    primaryType: 'WithdrawFromLock',
    message,
  })

  return signature
}
