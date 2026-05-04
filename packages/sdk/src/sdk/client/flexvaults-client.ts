import { HttpClient, type HttpClientConfig } from './http-client'
import type {
  Address,
  Bytes32,
  DepositAddressRequest,
  DepositAddressResponse,
  DepositCheckRequest,
  DepositCheckResponse,
  HostedAuthAuthorizeUrlRequest,
  HostedAuthTokenExchangeRequest,
  HostedAuthTokenExchangeResponse,
  JwtLogoutRequest,
  JwtLogoutResponse,
  JwtRefreshRequest,
  JwtRefreshResponse,
  LockFundsRequest,
  ModifyLockRequest,
  HistoryRequest,
  UnlockFundsRequest,
  UnlockAllExpiredRequest,
  TransferFundsRequest,
  TransferLockedFundsRequest,
  WithdrawalRequest,
  WithdrawFromLockRequest,
  BatchBalancesRequest,
  TransactionSubmissionResponse,
  BalanceResponse,
  BatchBalancesResponse,
  HistoryResponse,
  TokenInfoResponse,
  LockedFundsResponse,
  ExpiredLocksResponse,
  TotalLockedBalanceResponse,
  PendingWithdrawalsResponse,
  WithdrawalInfoResponse,
  TransferNonceResponse,
  WithdrawalNonceResponse,
  LockNonceResponse,
  ModifyLockNonceResponse,
  TransferLockedNonceResponse,
  SiweDomainResponse,
  SiweNonceResponse,
  SiweLoginRequest,
  SiweLoginResponse,
  TokenListResponse,
} from '../types'
import { normalizeAddress, normalizeHex } from '../types'

export type FlexvaultsClientConfig = HttpClientConfig
const PRIVATE_READ_TOKEN_HEADER = 'X-SIWE-Token'
const MAX_BATCH_BALANCE_TOKEN_IDS = 100
const MAX_HISTORY_PAGE_SIZE = 100

export class FlexvaultsClient {
  private readonly http: HttpClient

  constructor(config: FlexvaultsClientConfig) {
    this.http = new HttpClient(config)
  }

  getBaseUrl(): string {
    return this.http.getBaseUrl()
  }

  async getDepositAddress(request: DepositAddressRequest = {}): Promise<DepositAddressResponse> {
    return this.http.post<DepositAddressResponse>('/v1/accounting/deposits/address', {
      chain_type: request.chain_type ?? 'evm',
      version: request.version ?? 0,
    })
  }

  async checkDeposit(request: DepositCheckRequest): Promise<DepositCheckResponse> {
    return this.http.post<DepositCheckResponse>('/v1/accounting/deposits/check', {
      chain_type: request.chain_type ?? 'evm',
      chain_id: request.chain_id,
      tx_hash: normalizeHex(request.tx_hash),
      amount: String(request.amount),
      log_index: request.log_index ?? 0,
      version: request.version ?? 0,
    })
  }

  async getDepositStatus(depositId: string): Promise<DepositCheckResponse> {
    return this.http.get<DepositCheckResponse>(`/v1/accounting/deposits/status/${depositId}`)
  }

  async getBalance(tokenId: Bytes32 | string): Promise<BalanceResponse> {
    const token = normalizeHex(tokenId)
    return this.http.get<BalanceResponse>(`/v1/accounting/balances/${token}`)
  }

  async getBatchBalances(request: BatchBalancesRequest): Promise<BatchBalancesResponse> {
    if (request.token_ids.length > MAX_BATCH_BALANCE_TOKEN_IDS) {
      throw new Error(
        `Batch balance requests support at most ${MAX_BATCH_BALANCE_TOKEN_IDS} token IDs`
      )
    }

    return this.http.post<BatchBalancesResponse>('/v1/accounting/balances/batch', {
      token_ids: request.token_ids.map((id) => normalizeHex(id)),
    })
  }

  async getHistory(request: HistoryRequest = {}): Promise<HistoryResponse> {
    const offset = request.offset ?? -1
    const limit = request.limit ?? 50

    if (!Number.isSafeInteger(offset)) {
      throw new Error('History offset must be an integer')
    }
    if (!Number.isSafeInteger(limit)) {
      throw new Error('History limit must be an integer')
    }
    if (limit < 0 || limit > MAX_HISTORY_PAGE_SIZE) {
      throw new Error(`History requests support between 0 and ${MAX_HISTORY_PAGE_SIZE} entries`)
    }

    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    })
    return this.http.get<HistoryResponse>(`/v1/accounting/history?${params.toString()}`)
  }

  async listTokens(): Promise<TokenListResponse> {
    return this.http.get<TokenListResponse>('/v1/accounting/tokens')
  }

  async getTokenInfo(tokenId: Bytes32 | string): Promise<TokenInfoResponse> {
    const token = normalizeHex(tokenId)
    return this.http.get<TokenInfoResponse>(`/v1/accounting/tokens/${token}`)
  }

  async lockFunds(request: LockFundsRequest): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>('/v1/accounting/funds/lock', {
      user_address: normalizeAddress(request.user_address),
      service_address: normalizeAddress(request.service_address),
      token_id: normalizeHex(request.token_id),
      amount: String(request.amount),
      expiry: String(request.expiry),
      nonce: String(request.nonce),
      signature: normalizeHex(request.signature),
    })
  }

  async modifyLock(request: ModifyLockRequest): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>('/v1/accounting/funds/modify-lock', {
      user_address: normalizeAddress(request.user_address),
      lock_id: request.lock_id,
      amount: String(request.amount),
      new_expiry: String(request.new_expiry),
      nonce: String(request.nonce),
      signature: normalizeHex(request.signature),
    })
  }

  async unlockFunds(request: UnlockFundsRequest): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>('/v1/accounting/funds/unlock', {
      user_address: normalizeAddress(request.user_address),
      lock_id: request.lock_id,
    })
  }

  async unlockAllExpired(request: UnlockAllExpiredRequest): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>(
      '/v1/accounting/funds/unlock-all-expired',
      {
        user_address: normalizeAddress(request.user_address),
      }
    )
  }

  async getLockedFunds(serviceAddress?: Address | string): Promise<LockedFundsResponse> {
    const queryParams = serviceAddress ? `?service_address=${normalizeAddress(serviceAddress)}` : ''
    return this.http.get<LockedFundsResponse>(`/v1/accounting/funds/locked${queryParams}`)
  }

  async getTotalLockedBalance(tokenId: Bytes32 | string): Promise<TotalLockedBalanceResponse> {
    const token = normalizeHex(tokenId)
    return this.http.get<TotalLockedBalanceResponse>(`/v1/accounting/funds/locked/total/${token}`)
  }

  async getExpiredLocks(): Promise<ExpiredLocksResponse> {
    return this.http.get<ExpiredLocksResponse>('/v1/accounting/funds/expired')
  }

  async transferFunds(request: TransferFundsRequest): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>('/v1/accounting/funds/transfer', {
      user_address: normalizeAddress(request.user_address),
      to_address: normalizeAddress(request.to_address),
      token_id: normalizeHex(request.token_id),
      amount: String(request.amount),
      nonce: String(request.nonce),
      signature: normalizeHex(request.signature),
    })
  }

  async getTransferNonce(userAddress: Address | string): Promise<TransferNonceResponse> {
    const user = normalizeAddress(userAddress)
    return this.http.get<TransferNonceResponse>(`/v1/accounting/funds/transfer/nonce/${user}`)
  }

  async getLockNonce(userAddress: Address | string): Promise<LockNonceResponse> {
    const user = normalizeAddress(userAddress)
    return this.http.get<LockNonceResponse>(`/v1/accounting/funds/lock/nonce/${user}`)
  }

  async getModifyLockNonce(userAddress: Address | string): Promise<ModifyLockNonceResponse> {
    const user = normalizeAddress(userAddress)
    return this.http.get<ModifyLockNonceResponse>(`/v1/accounting/funds/modify-lock/nonce/${user}`)
  }

  async transferLockedFunds(
    request: TransferLockedFundsRequest
  ): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>('/v1/accounting/funds/transfer-locked', {
      user_address: normalizeAddress(request.user_address),
      lock_id: request.lock_id,
      to_address: normalizeAddress(request.to_address),
      amount: String(request.amount),
      service_address: normalizeAddress(request.service_address),
      nonce: String(request.nonce),
      signature: normalizeHex(request.signature),
    })
  }

  async withdrawFromLock(request: WithdrawFromLockRequest): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>(
      '/v1/accounting/funds/withdraw-from-lock',
      {
        to_address: normalizeAddress(request.to_address),
        lock_id: request.lock_id,
        amount: String(request.amount),
        nonce: String(request.nonce),
        signature: normalizeHex(request.signature),
      }
    )
  }

  async requestWithdrawal(request: WithdrawalRequest): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>('/v1/accounting/withdraw', {
      user_address: normalizeAddress(request.user_address),
      token_id: normalizeHex(request.token_id),
      amount: String(request.amount),
      nonce: String(request.nonce),
      signature: normalizeHex(request.signature),
    })
  }

  async getWithdrawalNonce(userAddress: Address | string): Promise<WithdrawalNonceResponse> {
    const user = normalizeAddress(userAddress)
    return this.http.get<WithdrawalNonceResponse>(`/v1/accounting/withdraw/nonce/${user}`)
  }

  async getTransferLockedNonce(
    serviceAddress: Address | string
  ): Promise<TransferLockedNonceResponse> {
    const service = normalizeAddress(serviceAddress)
    return this.http.get<TransferLockedNonceResponse>(
      `/v1/accounting/funds/transfer-locked/nonce/${service}`
    )
  }

  async getPendingWithdrawals(userAddress: Address | string): Promise<PendingWithdrawalsResponse> {
    const user = normalizeAddress(userAddress)
    return this.http.get<PendingWithdrawalsResponse>(`/v1/accounting/withdraw/pending/${user}`)
  }

  async getWithdrawalInfo(index: number): Promise<WithdrawalInfoResponse> {
    return this.http.get<WithdrawalInfoResponse>(`/v1/accounting/withdraw/${index}`)
  }

  async getSiweDomain(): Promise<SiweDomainResponse> {
    return this.http.get<SiweDomainResponse>('/v1/accounting/auth/domain')
  }

  async getSiweNonce(userAddress: Address | string): Promise<SiweNonceResponse> {
    const user = normalizeAddress(userAddress)
    return this.http.get<SiweNonceResponse>(`/v1/accounting/auth/nonce?address=${user}`)
  }

  async loginWithSiwe(request: SiweLoginRequest): Promise<SiweLoginResponse> {
    return this.http.post<SiweLoginResponse>('/v1/accounting/auth/login', {
      siwe_message: request.siwe_message,
      signature: normalizeHex(request.signature),
    })
  }

  getHostedAuthAuthorizeUrl(request: HostedAuthAuthorizeUrlRequest): string {
    const url = new URL(
      'v1/accounting/auth/authorize',
      `${this.http.getBaseUrl().replace(/\/$/, '')}/`
    )
    url.searchParams.set('client_id', request.client_id)
    url.searchParams.set('redirect_uri', request.redirect_uri)
    url.searchParams.set('code_challenge', request.code_challenge)
    url.searchParams.set('state', request.state)
    url.searchParams.set('chain_id', String(request.chain_id))
    url.searchParams.set('response_mode', request.response_mode ?? 'redirect')
    url.searchParams.set('code_challenge_method', request.code_challenge_method ?? 'S256')
    return url.toString()
  }

  async exchangeHostedAuthCode(
    request: HostedAuthTokenExchangeRequest
  ): Promise<HostedAuthTokenExchangeResponse> {
    return this.http.post<HostedAuthTokenExchangeResponse>('/v1/accounting/auth/token', {
      grant_type: request.grant_type ?? 'authorization_code',
      code: request.code,
      code_verifier: request.code_verifier,
      client_id: request.client_id,
      redirect_uri: request.redirect_uri,
    })
  }

  async refreshJwtSession(request: JwtRefreshRequest): Promise<JwtRefreshResponse> {
    return this.http.post<JwtRefreshResponse>('/v1/accounting/auth/jwt/refresh', {
      refresh_token: request.refresh_token,
    })
  }

  async logoutJwtSession(request: JwtLogoutRequest = {}): Promise<JwtLogoutResponse> {
    return this.http.post<JwtLogoutResponse>('/v1/accounting/auth/jwt/logout', {
      refresh_token: request.refresh_token,
      revoke_all: request.revoke_all ?? false,
    })
  }

  setPrivateReadToken(token: string): void {
    this.http.removeHeader('Authorization')
    this.http.setHeader(PRIVATE_READ_TOKEN_HEADER, token)
  }

  getPrivateReadToken(): string | undefined {
    return this.http.getHeader(PRIVATE_READ_TOKEN_HEADER)
  }

  clearPrivateReadToken(): void {
    this.http.removeHeader(PRIVATE_READ_TOKEN_HEADER)
  }

  setBearerToken(token: string): void {
    this.http.removeHeader(PRIVATE_READ_TOKEN_HEADER)
    this.http.setHeader('Authorization', `Bearer ${token}`)
  }

  clearBearerToken(): void {
    this.http.removeHeader('Authorization')
  }
}
