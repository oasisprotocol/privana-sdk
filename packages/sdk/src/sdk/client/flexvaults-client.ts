import { HttpClient, type HttpClientConfig } from './http-client'
import type {
  Address,
  Bytes32,
  DepositQuoteRequest,
  DepositQuoteResponse,
  LockFundsRequest,
  UnlockFundsRequest,
  UnlockAllExpiredRequest,
  TransferFundsRequest,
  TransferLockedFundsRequest,
  WithdrawalRequest,
  BatchBalancesRequest,
  TransactionSubmissionResponse,
  BalanceResponse,
  BatchBalancesResponse,
  TokenInfoResponse,
  LockedFundsResponse,
  ExpiredLocksResponse,
  TotalLockedBalanceResponse,
  PendingWithdrawalsResponse,
  WithdrawalInfoResponse,
  TransferNonceResponse,
  SiweDomainResponse,
  SiweLoginResponse,
} from '../types'
import { MAX_BATCH_BALANCES_TOKEN_IDS, normalizeAddress, normalizeHex } from '../types'

export type FlexvaultsClientConfig = HttpClientConfig

const SIWE_TOKEN_HEADER = 'X-SIWE-Token'

export class FlexvaultsClient {
  private readonly http: HttpClient
  private siweToken: string | null = null

  constructor(config: FlexvaultsClientConfig) {
    this.http = new HttpClient(config)
  }

  setSiweToken(token: string): void {
    this.siweToken = token
    this.http.setHeader(SIWE_TOKEN_HEADER, token)
  }

  clearSiweToken(): void {
    this.siweToken = null
    this.http.removeHeader(SIWE_TOKEN_HEADER)
  }

  getSiweToken(): string | null {
    return this.siweToken
  }

  async getSiweDomain(): Promise<SiweDomainResponse> {
    return this.http.get<SiweDomainResponse>('/v1/accounting/auth/domain')
  }

  async siweLogin(request: {
    siwe_message: string
    signature: string
  }): Promise<SiweLoginResponse> {
    return this.http.post<SiweLoginResponse>('/v1/accounting/auth/login', request)
  }

  async getDepositQuote(request: DepositQuoteRequest): Promise<DepositQuoteResponse> {
    return this.http.post<DepositQuoteResponse>('/v1/accounting/quote/deposit', {
      user_address: normalizeAddress(request.user_address),
      token_id: normalizeHex(request.token_id),
      amount: request.amount,
    })
  }

  // NOTE: includeDeposit was removed - deposits are now processed automatically
  // by the accounting module's deposit listener. The SDK polls for balance changes
  // to detect when the deposit has been credited.
  // TODO: Add a dedicated deposit status endpoint for more reliable tracking.

  async getBalance(
    userAddress: Address | string,
    tokenId: Bytes32 | string
  ): Promise<BalanceResponse> {
    const user = normalizeAddress(userAddress)
    const token = normalizeHex(tokenId)
    return this.http.get<BalanceResponse>(`/v1/accounting/balances/${user}/${token}`)
  }

  async getBatchBalances(request: BatchBalancesRequest): Promise<BatchBalancesResponse> {
    if (request.token_ids.length > MAX_BATCH_BALANCES_TOKEN_IDS) {
      throw new Error(
        `token_ids length must be <= ${MAX_BATCH_BALANCES_TOKEN_IDS} (received ${request.token_ids.length}); paginate requests`
      )
    }
    return this.http.post<BatchBalancesResponse>('/v1/accounting/balances/batch', {
      user_address: normalizeAddress(request.user_address),
      token_ids: request.token_ids.map((id) => normalizeHex(id)),
    })
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
      amount: request.amount,
      expiry: request.expiry,
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

  async getLockedFunds(
    userAddress: Address | string,
    serviceAddress?: Address | string
  ): Promise<LockedFundsResponse> {
    const user = normalizeAddress(userAddress)
    const queryParams = serviceAddress ? `?service_address=${normalizeAddress(serviceAddress)}` : ''
    return this.http.get<LockedFundsResponse>(`/v1/accounting/funds/locked/${user}${queryParams}`)
  }

  async getTotalLockedBalance(
    userAddress: Address | string,
    tokenId: Bytes32 | string
  ): Promise<TotalLockedBalanceResponse> {
    const user = normalizeAddress(userAddress)
    const token = normalizeHex(tokenId)
    return this.http.get<TotalLockedBalanceResponse>(
      `/v1/accounting/funds/locked/total/${user}/${token}`
    )
  }

  async getExpiredLocks(userAddress: Address | string): Promise<ExpiredLocksResponse> {
    const user = normalizeAddress(userAddress)
    return this.http.get<ExpiredLocksResponse>(`/v1/accounting/funds/expired/${user}`)
  }

  async transferFunds(request: TransferFundsRequest): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>('/v1/accounting/funds/transfer', {
      user_address: normalizeAddress(request.user_address),
      to_address: normalizeAddress(request.to_address),
      token_id: normalizeHex(request.token_id),
      amount: request.amount,
      nonce: request.nonce,
      signature: normalizeHex(request.signature),
    })
  }

  async getTransferNonce(userAddress: Address | string): Promise<TransferNonceResponse> {
    const user = normalizeAddress(userAddress)
    return this.http.get<TransferNonceResponse>(`/v1/accounting/funds/transfer/nonce/${user}`)
  }

  async transferLockedFunds(
    request: TransferLockedFundsRequest
  ): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>('/v1/accounting/funds/transfer-locked', {
      user_address: normalizeAddress(request.user_address),
      lock_id: request.lock_id,
      to_address: normalizeAddress(request.to_address),
      amount: request.amount,
      signature: normalizeHex(request.signature),
    })
  }

  async requestWithdrawal(request: WithdrawalRequest): Promise<TransactionSubmissionResponse> {
    return this.http.post<TransactionSubmissionResponse>('/v1/accounting/withdraw', {
      user_address: normalizeAddress(request.user_address),
      token_id: normalizeHex(request.token_id),
      amount: request.amount,
      nonce: request.nonce,
      signature: normalizeHex(request.signature),
    })
  }

  async getPendingWithdrawals(userAddress: Address | string): Promise<PendingWithdrawalsResponse> {
    const user = normalizeAddress(userAddress)
    return this.http.get<PendingWithdrawalsResponse>(`/v1/accounting/withdraw/pending/${user}`)
  }

  async getWithdrawalInfo(index: number): Promise<WithdrawalInfoResponse> {
    return this.http.get<WithdrawalInfoResponse>(`/v1/accounting/withdraw/${index}`)
  }
}
