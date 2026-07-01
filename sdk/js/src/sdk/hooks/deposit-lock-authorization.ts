import type { WalletClient } from 'viem'
import { keccak256, toBytes } from 'viem'
import type { Address, Bytes32, DepositLockAuthorizationRequest, NetworkConfig } from '../types'
import {
  createDepositLockAuthorizationDeadline,
  createDepositLockDuration,
  createDepositLockIntentId,
  signDepositLockAuthorizationMessage,
} from '../signatures'

export interface DepositLockAuthorizationConfig {
  serviceAddress?: Address
  maxAmount?: bigint
  minAmount?: bigint
  lockDuration?: bigint
  authorizationDeadline?: bigint
  intentId?: Bytes32
}

export interface CreateSignedDepositLockAuthorizationParams {
  walletClient: WalletClient
  userAddress: Address
  networkConfig: NetworkConfig
  tokenId: Bytes32
  serviceAddress: Address
  maxAmount: bigint
  minAmount?: bigint
  lockDuration?: bigint
  authorizationDeadline?: bigint
  intentId?: Bytes32
}

export async function createSignedDepositLockAuthorization({
  walletClient,
  userAddress,
  networkConfig,
  tokenId,
  serviceAddress,
  maxAmount,
  minAmount = 0n,
  lockDuration = createDepositLockDuration(60),
  authorizationDeadline = createDepositLockAuthorizationDeadline(60),
  intentId = createDepositLockIntentId(),
}: CreateSignedDepositLockAuthorizationParams): Promise<DepositLockAuthorizationRequest> {
  const signature = await signDepositLockAuthorizationMessage({
    walletClient,
    chainId: networkConfig.chainId,
    verifyingContract: networkConfig.accountingContract,
    message: {
      userAddress,
      serviceAddress,
      tokenId,
      maxAmount,
      minAmount,
      lockDuration,
      authorizationDeadline,
      intentId,
    },
  })

  return {
    service_address: serviceAddress,
    token_id: tokenId,
    max_amount: maxAmount.toString(),
    min_amount: minAmount.toString(),
    lock_duration: lockDuration.toString(),
    authorization_deadline: authorizationDeadline.toString(),
    intent_id: intentId,
    signature,
  }
}

export function createDepositLockIntentIdFromString(value: string): Bytes32 {
  return keccak256(toBytes(value)) as Bytes32
}

// Mirrors the backend's deadline buffer: /deposits/check rejects the whole
// request when the authorization expires within this window, which would block
// crediting a real deposit. Authorizations past this point must be dropped
// before submission so the deposit is still credited (without the lock).
const AUTHORIZATION_DEADLINE_BUFFER_SECONDS = 300

export function isDepositLockAuthorizationUsable(
  authorization: DepositLockAuthorizationRequest
): boolean {
  const deadline = Number(authorization.authorization_deadline)
  if (!Number.isFinite(deadline)) return false
  return deadline > Math.floor(Date.now() / 1000) + AUTHORIZATION_DEADLINE_BUFFER_SECONDS
}

export { createDepositLockAuthorizationDeadline } from '../signatures'
