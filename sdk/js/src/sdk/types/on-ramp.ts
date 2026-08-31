import type { Address, Bytes32, HexString } from './common'

export type OnRampProvider = 'moonpay' | 'transak'
export type OnRampStatus = 'pending' | 'completed' | 'failed' | 'cancelled'

/** Product-level card on-ramp selection supplied by the SDK host. */
export interface OnRampConfig {
  /** The only provider the product UI may launch. */
  provider: OnRampProvider
  /** The only Privana token the configured provider may deposit. */
  tokenId: Bytes32
  /** Provider-side asset identifier expected in the signed intent. */
  providerAssetCode: string
}

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
  /** MoonPay compatibility field retained while its SDK adapter is active. */
  moonpay_currency_code?: string
}

export type CreateOnRampIntentResponse = OnRampRecord

/** Opaque edge-signed claim. Pass through without inspecting or modifying it. */
export interface OnRampIpAttestation {
  readonly v: 1
  readonly ip: string
  readonly iat: number
  readonly exp: number
  readonly nonce: string
  readonly sig: string
}

/** Request body / response of POST /v1/accounting/onramp/session. */
export interface CreateOnRampSessionRequest {
  transaction_id: string
  /** Required by attested mode; omitted only by legacy header-mode callers. */
  ip_attestation?: OnRampIpAttestation
}

export interface OnRampSessionResponse {
  provider: 'transak'
  /** Opaque, single-use URL. Do not persist, log, or modify it. */
  url: string
  /** Unix timestamp in seconds by which the URL must be loaded. */
  expires_at: number
}

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
}

export type UpdateOnRampResponse = OnRampRecord

export interface OnRampRecord {
  transaction_id: string
  external_transaction_id?: string | null
  provider: OnRampProvider
  provider_transaction_id?: string | null
  provider_asset_code: string
  moonpay_transaction_id?: string | null
  status: OnRampStatus
  wallet_address?: Address | null
  token_id?: Bytes32 | null
  chain_id?: number | null
  moonpay_currency_code?: string | null
  base_currency_code?: string | null
  base_currency_amount?: string | null
  quote_currency_amount?: string | null
  on_chain_tx_hash?: HexString | null
  deposit_id?: string | null
  deposit_tx_hash?: HexString | null
  deposit_triggered_at?: number | null
  credited_at?: number | null
  created_at: number
  updated_at: number
}

/** Response body of GET /api/onramp/pending */
export interface PendingOnRampsResponse {
  pending: OnRampRecord[]
}
