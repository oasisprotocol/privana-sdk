import type { WalletClient } from 'viem'
import type { Address, Network } from '../types'
import { createDomain, WITHDRAW_TYPES, type WithdrawMessage } from './eip712-types'

export interface SignWithdrawParams {
  walletClient: WalletClient
  network: Network
  verifyingContract: Address
  message: WithdrawMessage
}

export async function signWithdrawMessage({
  walletClient,
  network,
  verifyingContract,
  message,
}: SignWithdrawParams): Promise<`0x${string}`> {
  const account = walletClient.account
  if (!account) {
    throw new Error('No account connected to wallet client')
  }

  const domain = createDomain(network, verifyingContract)

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: WITHDRAW_TYPES,
    primaryType: 'Withdraw',
    message,
  })

  return signature
}
