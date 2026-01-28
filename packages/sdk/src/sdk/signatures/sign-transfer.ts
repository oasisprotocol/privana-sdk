import type { WalletClient } from 'viem'
import type { Address, Network } from '../types'
import { createDomain, TRANSFER_TYPES, type TransferMessage } from './eip712-types'

export interface SignTransferParams {
  walletClient: WalletClient
  network: Network
  verifyingContract: Address
  message: TransferMessage
}

export async function signTransferMessage({
  walletClient,
  network,
  verifyingContract,
  message,
}: SignTransferParams): Promise<`0x${string}`> {
  const account = walletClient.account
  if (!account) {
    throw new Error('No account connected to wallet client')
  }

  const domain = createDomain(network, verifyingContract)

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: TRANSFER_TYPES,
    primaryType: 'Transfer',
    message,
  })

  return signature
}
