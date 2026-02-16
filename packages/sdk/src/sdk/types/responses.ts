import type { Address, Bytes32 } from './common'

export interface TransactionData {
  to: Address
  value: string
  data: string
  chain_id: number
}

export interface DepositQuoteResponse {
  user_address: Address
  token_id: Bytes32
  amount: number
  deposit_address: Address
  transaction: TransactionData
  instructions: string
}

export interface IncludeDepositResponse {
  submission_id: string
  status: string
}

export interface TransactionSubmissionResponse {
  submission_id: string
  status: string
  detail?: string
}

export interface BalanceResponse {
  user_address: Address
  token_id: Bytes32
  balance: string
  token_symbol: string
  chain_id: string
}

export interface TokenBalance {
  token_id: Bytes32
  balance: string
  token_symbol: string
  chain_id: string
}

export interface BatchBalancesResponse {
  user_address: Address
  balances: TokenBalance[]
}

export interface TokenInfoResponse {
  token_id: Bytes32
  symbol: string
  decimals: number
  chain_id: number
  contract_address?: Address
}

export interface LockInfo {
  lock_id: number
  user_address: Address
  service_address: Address
  token_id: Bytes32
  amount: number
  expiry: number
  is_expired: boolean
}

export interface LockedFundsResponse {
  user_address: Address
  service_address?: Address
  locks: LockInfo[]
  total_locked: number
}

export interface ExpiredLocksResponse {
  user_address: Address
  expired_locks: LockInfo[]
}

export interface TotalLockedBalanceResponse {
  user_address: Address
  token_id: Bytes32
  total_locked: string
}

export interface WithdrawalInfo {
  index: number
  user_address: Address
  amount: string
  block_number: number
  token_id: Bytes32
  resolved: boolean
  tx_identifier: string
}

export interface PendingWithdrawalsResponse {
  user_address: Address
  pending_withdrawals: WithdrawalInfo[]
}

export type WithdrawalInfoResponse = WithdrawalInfo

export interface TransferNonceResponse {
  user_address: Address
  nonce: number
}

export interface SiweDomainResponse {
  domain: string
}

export interface SiweLoginResponse {
  token: string
}
