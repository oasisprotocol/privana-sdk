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
    { name: 'userAddress', type: 'address' },
    { name: 'serviceAddress', type: 'address' },
    { name: 'tokenId', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
  ],
} as const

export const TRANSFER_TYPES = {
  Transfer: [
    { name: 'userAddress', type: 'address' },
    { name: 'toAddress', type: 'address' },
    { name: 'tokenId', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
  ],
} as const

export const TRANSFER_LOCKED_TYPES = {
  TransferLocked: [
    { name: 'userAddress', type: 'address' },
    { name: 'toAddress', type: 'address' },
    { name: 'lockId', type: 'uint256' },
    { name: 'amount', type: 'uint256' },
  ],
} as const

export const WITHDRAW_TYPES = {
  Withdraw: [
    { name: 'userAddress', type: 'address' },
    { name: 'tokenId', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
  ],
} as const

export interface LockMessage {
  userAddress: Address
  serviceAddress: Address
  tokenId: Bytes32
  amount: bigint
  expiry: bigint
}

export interface TransferMessage {
  userAddress: Address
  toAddress: Address
  tokenId: Bytes32
  amount: bigint
}

export interface TransferLockedMessage {
  userAddress: Address
  toAddress: Address
  lockId: bigint
  amount: bigint
}

export interface WithdrawMessage {
  userAddress: Address
  tokenId: Bytes32
  amount: bigint
  nonce: bigint
}
