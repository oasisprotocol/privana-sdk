import type { Address, Bytes32, HexString, HostedAuthResponseMode, IntegerLike } from './common'

export interface DepositAddressRequest {
  chain_type?: string
  version?: number
}

export interface DepositCheckRequest {
  chain_type?: string
  chain_id: number
  tx_hash: HexString
  amount: IntegerLike
  log_index?: number
  version?: number
}

export interface LockFundsRequest {
  service_address: Address
  token_id: Bytes32
  amount: IntegerLike
  expiry: IntegerLike
  nonce: IntegerLike
  signature: HexString
}

export interface ModifyLockRequest {
  lock_id: number
  amount: IntegerLike
  new_expiry: IntegerLike
  nonce: IntegerLike
  signature: HexString
}

export interface UnlockFundsRequest {
  user_address: Address
  lock_id: number
}

export interface UnlockAllExpiredRequest {
  user_address: Address
}

export interface TransferFundsRequest {
  to_address: Address
  token_id: Bytes32
  amount: IntegerLike
  nonce: IntegerLike
  signature: HexString
}

export interface TransferLockedFundsRequest {
  user_address: Address
  lock_id: number
  to_address: Address
  amount: IntegerLike
  service_address: Address
  nonce: IntegerLike
  signature: HexString
}

export interface WithdrawalRequest {
  token_id: Bytes32
  amount: IntegerLike
  nonce: IntegerLike
  signature: HexString
}

export interface WithdrawFromLockRequest {
  to_address: Address
  lock_id: number
  amount: IntegerLike
  nonce: IntegerLike
  signature: HexString
}

export interface BatchBalancesRequest {
  token_ids: Bytes32[]
}

export interface HistoryRequest {
  offset?: number
  limit?: number
}

export interface SiweLoginRequest {
  siwe_message: string
  signature: HexString
}

export interface HostedAuthAuthorizeUrlRequest {
  client_id: string
  redirect_uri: string
  code_challenge: string
  state: string
  chain_id: number
  response_mode?: HostedAuthResponseMode
  code_challenge_method?: 'S256'
}

export interface HostedAuthTokenExchangeRequest {
  grant_type?: 'authorization_code'
  code: string
  code_verifier: string
  client_id: string
  redirect_uri: string
}

export interface JwtRefreshRequest {
  refresh_token: string
}

export interface JwtLogoutRequest {
  refresh_token?: string
  revoke_all?: boolean
}
