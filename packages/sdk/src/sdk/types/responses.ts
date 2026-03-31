import type { Address, Bytes32, HexString } from './common'

export interface TransactionData {
  to: Address
  value: string
  data: string
  chain_id: number
}

export interface DepositQuoteResponse {
  user_address: Address
  token_id: Bytes32
  amount: string
  deposit_address: Address
  transaction: TransactionData
  instructions: string
}

export interface IncludeDepositResponse {
  status: string
}

export interface TransactionSubmissionResponse {
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
  token_type: number
  token_type_name: string
  data: string
  chain_id?: number | null
  chain_name?: string | null
  token_address?: Address | null
}

export interface LockInfo {
  lock_id: number
  user_address: Address
  service_address: Address
  token_id: Bytes32
  amount: string
  expiry: number
  is_expired: boolean
}

export interface LockedFundsResponse {
  user_address: Address
  service_address?: Address
  locks: LockInfo[]
  total_locked: string
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
  nonce: string
}

export interface WithdrawalNonceResponse {
  user_address: Address
  nonce: string
}

export interface LockNonceResponse {
  user_address: Address
  nonce: string
}

export interface TransferLockedNonceResponse {
  service_address: Address
  nonce: string
}

export interface SiweDomainResponse {
  domain: string
}

export interface SiweNonceResponse {
  address: Address
  nonce: string
  expires_in: number
}

export interface SiweLoginResponse {
  siwe_token: HexString
  jwt_access_token: string
  jwt_refresh_token: string
  address: Address
  jwt_expires_in: number
  jwt_refresh_expires_in: number
}

export interface HostedAuthTokenExchangeResponse {
  access_token: string
  id_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  refresh_expires_in: number
  address: Address
}

export interface JwtRefreshResponse {
  token: string
  refresh_token: string
  expires_in: number
  refresh_expires_in: number
}

export interface JwtLogoutResponse {
  message: string
  revoked_tokens: number
}
