import type { Address, Bytes32, HexString } from './common'
import type { DepositLockAuthorizationRequest } from './requests'

export type OnRampStatus = 'pending' | 'completed' | 'failed' | 'cancelled'

/** Request body / response of POST /api/onramp/sign-url */
export interface SignOnRampUrlRequest {
  url: string
}

export interface SignOnRampUrlResponse {
  signature: string
}

/** Request body / response of POST /api/onramp/intent. */
export interface CreateOnRampIntentRequest {
  wallet_address?: Address
  token_id: Bytes32
  chain_id: number
  moonpay_currency_code: string
  base_currency_code?: string
  base_currency_amount?: string
}

export type CreateOnRampIntentResponse = OnRampRecord

/** Request body / response of POST /api/onramp/{id}. */
export interface UpdateOnRampRequest {
  wallet_address?: Address
  token_id?: Bytes32
  chain_id?: number
  moonpay_transaction_id?: string
  base_currency_code?: string
  base_currency_amount?: string
  quote_currency_amount?: string
  on_chain_tx_hash?: HexString
  deposit_tx_hash?: HexString
  lock_authorization?: DepositLockAuthorizationRequest
}

export type UpdateOnRampResponse = OnRampRecord

export interface OnRampRecord {
  transaction_id: string
  external_transaction_id?: string
  moonpay_transaction_id?: string
  status: OnRampStatus
  wallet_address?: Address
  token_id?: Bytes32
  chain_id?: number
  moonpay_currency_code?: string
  base_currency_code?: string
  base_currency_amount?: string
  quote_currency_amount?: string
  on_chain_tx_hash?: HexString
  deposit_tx_hash?: HexString
  lock_authorization?: DepositLockAuthorizationRequest
  deposit_triggered_at?: number
  credited_at?: number
  created_at: number
  updated_at: number
}

/** Response body of GET /api/onramp/pending */
export interface PendingOnRampsResponse {
  pending: OnRampRecord[]
}
