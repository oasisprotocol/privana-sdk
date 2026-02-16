import type { WalletClient } from 'viem'
import type { Address } from '../types'
import { createDomain, MODIFY_LOCK_TYPES, type ModifyLockMessage } from './eip712-types'

export interface SignModifyLockParams {
  walletClient: WalletClient
  chainId: number
  verifyingContract: Address
  message: ModifyLockMessage
}

export async function signModifyLockMessage({
  walletClient,
  chainId,
  verifyingContract,
  message,
}: SignModifyLockParams): Promise<`0x${string}`> {
  const account = walletClient.account
  if (!account) {
    throw new Error('No account connected to wallet client')
  }

  const domain = createDomain(chainId, verifyingContract)

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: MODIFY_LOCK_TYPES,
    primaryType: 'ModifyLock',
    message,
  })

  return signature
}
