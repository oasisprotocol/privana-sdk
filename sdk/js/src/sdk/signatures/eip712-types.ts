import type { Address, Bytes32 } from '../types'

export interface EIP712Domain {
  name: string
  version: string
  chainId: number
  verifyingContract: Address
}

export function createDomain(chainId: number, verifyingContract: Address): EIP712Domain {
  return {
    name: 'AccountingModule',
    version: '1',
    chainId,
    verifyingContract,
  }
}

export const LOCK_TYPES = {
  Lock: [
    { name: 'serviceAddress', type: 'address' },
    { name: 'tokenId', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export const DEPOSIT_LOCK_AUTHORIZATION_TYPES = {
  DepositLockAuthorization: [
    { name: 'userAddress', type: 'address' },
    { name: 'serviceAddress', type: 'address' },
    { name: 'tokenId', type: 'bytes32' },
    { name: 'maxAmount', type: 'uint256' },
    { name: 'minAmount', type: 'uint256' },
    { name: 'lockDuration', type: 'uint256' },
    { name: 'authorizationDeadline', type: 'uint256' },
    { name: 'intentId', type: 'bytes32' },
  ],
} as const

export const TRANSFER_TYPES = {
  Transfer: [
    { name: 'toAddress', type: 'address' },
    { name: 'tokenId', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export const TRANSFER_LOCKED_TYPES = {
  TransferLocked: [
    { name: 'userAddress', type: 'address' },
    { name: 'toAddress', type: 'address' },
    { name: 'lockId', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'serviceAddress', type: 'address' },
  ],
} as const

export const WITHDRAW_TYPES = {
  Withdraw: [
    { name: 'tokenId', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export const MODIFY_LOCK_TYPES = {
  ModifyLock: [
    { name: 'lockId', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'newExpiry', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export const WITHDRAW_FROM_LOCK_TYPES = {
  WithdrawFromLock: [
    { name: 'userAddress', type: 'address' },
    { name: 'toAddress', type: 'address' },
    { name: 'lockId', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export interface LockMessage {
  serviceAddress: Address
  tokenId: Bytes32
  amount: bigint
  expiry: bigint
  nonce: bigint
}

export interface DepositLockAuthorizationMessage {
  userAddress: Address
  serviceAddress: Address
  tokenId: Bytes32
  maxAmount: bigint
  minAmount: bigint
  lockDuration: bigint
  authorizationDeadline: bigint
  intentId: Bytes32
}

export interface TransferMessage {
  toAddress: Address
  tokenId: Bytes32
  amount: bigint
  nonce: bigint
}

export interface TransferLockedMessage {
  userAddress: Address
  toAddress: Address
  lockId: bigint
  amount: bigint
  nonce: bigint
  serviceAddress: Address
}

export interface WithdrawMessage {
  tokenId: Bytes32
  amount: bigint
  nonce: bigint
}

export interface ModifyLockMessage {
  lockId: bigint
  amount: bigint
  newExpiry: bigint
  nonce: bigint
}

export interface WithdrawFromLockMessage {
  userAddress: Address
  toAddress: Address
  lockId: bigint
  amount: bigint
  nonce: bigint
}
