import type { Address, Bytes32, HexString, HostedAuthResponseMode, IntegerLike } from './common'

export interface DepositQuoteRequest {
  user_address: Address
  token_id: Bytes32
  amount: IntegerLike
}

export interface IncludeDepositRequest {
  user_address: Address
  token_id: Bytes32
  evm_transaction_data: HexString
  rlp_block_header?: HexString
  transaction_index_rlp?: HexString
  transaction_proof_stack?: HexString
}

export interface LockFundsRequest {
  user_address: Address
  service_address: Address
  token_id: Bytes32
  amount: IntegerLike
  expiry: IntegerLike
  nonce: IntegerLike
  signature: HexString
}

export interface ModifyLockRequest {
  user_address: Address
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
  user_address: Address
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
  user_address: Address
  token_id: Bytes32
  amount: IntegerLike
  nonce: IntegerLike
  signature: HexString
}

export interface BatchBalancesRequest {
  token_ids: Bytes32[]
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
