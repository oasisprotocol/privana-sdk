import type { WalletClient } from 'viem'
import type { Address } from '../types'
import { createDomain, TRANSFER_LOCKED_TYPES, type TransferLockedMessage } from './eip712-types'

export interface SignTransferLockedParams {
  walletClient: WalletClient
  chainId: number
  verifyingContract: Address
  message: TransferLockedMessage
}

export async function signTransferLockedMessage({
  walletClient,
  chainId,
  verifyingContract,
  message,
}: SignTransferLockedParams): Promise<`0x${string}`> {
  const account = walletClient.account
  if (!account) {
    throw new Error('No account connected to wallet client')
  }

  const domain = createDomain(chainId, verifyingContract)

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: TRANSFER_LOCKED_TYPES,
    primaryType: 'TransferLocked',
    message,
  })

  return signature
}
