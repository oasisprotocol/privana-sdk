import type { WalletClient } from 'viem'
import type { Address } from '../types'
import { createDomain, WITHDRAW_TYPES, type WithdrawMessage } from './eip712-types'

export interface SignWithdrawParams {
  walletClient: WalletClient
  chainId: number
  verifyingContract: Address
  message: WithdrawMessage
}

export async function signWithdrawMessage({
  walletClient,
  chainId,
  verifyingContract,
  message,
}: SignWithdrawParams): Promise<`0x${string}`> {
  const account = walletClient.account
  if (!account) {
    throw new Error('No account connected to wallet client')
  }

  const domain = createDomain(chainId, verifyingContract)

  const signature = await walletClient.signTypedData({
    account,
    domain,
    types: WITHDRAW_TYPES,
    primaryType: 'Withdraw',
    message,
  })

  return signature
}
