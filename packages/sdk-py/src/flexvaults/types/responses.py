from __future__ import annotations

from dataclasses import dataclass, field

from .common import Address, Bytes32, HexString


@dataclass
class TransactionData:
    to: Address
    value: str
    data: str
    chain_id: int


@dataclass
class DepositQuoteResponse:
    user_address: Address
    token_id: Bytes32
    amount: str
    deposit_address: Address
    transaction: TransactionData
    instructions: str


@dataclass
class IncludeDepositResponse:
    status: str


@dataclass
class TransactionSubmissionResponse:
    status: str
    detail: str | None = None


@dataclass
class BalanceResponse:
    user_address: Address
    token_id: Bytes32
    balance: str
    token_symbol: str
    chain_id: str


@dataclass
class TokenBalance:
    token_id: Bytes32
    balance: str
    token_symbol: str
    chain_id: str


@dataclass
class BatchBalancesResponse:
    user_address: Address
    balances: list[TokenBalance] = field(default_factory=list)


@dataclass
class TokenInfoResponse:
    token_id: Bytes32
    token_type: int
    token_type_name: str
    data: str
    chain_id: int | None = None
    chain_name: str | None = None
    token_address: Address | None = None


@dataclass
class LockInfo:
    lock_id: int
    user_address: Address
    service_address: Address
    token_id: Bytes32
    amount: str
    expiry: int
    is_expired: bool


@dataclass
class LockedFundsResponse:
    user_address: Address
    locks: list[LockInfo] = field(default_factory=list)
    total_locked: str = "0"
    service_address: Address | None = None


@dataclass
class ExpiredLocksResponse:
    user_address: Address
    expired_locks: list[LockInfo] = field(default_factory=list)


@dataclass
class TotalLockedBalanceResponse:
    user_address: Address
    token_id: Bytes32
    total_locked: str


@dataclass
class WithdrawalInfoResponse:
    index: int
    user_address: Address
    token_id: Bytes32
    amount: str
    block_number: int
    resolved: bool
    tx_identifier: str


@dataclass
class PendingWithdrawalsResponse:
    user_address: Address
    pending_withdrawals: list[WithdrawalInfoResponse] = field(default_factory=list)


PendingWithdrawal = WithdrawalInfoResponse


@dataclass
class TransferNonceResponse:
    user_address: Address
    nonce: int


@dataclass
class WithdrawalNonceResponse:
    user_address: Address
    nonce: int


@dataclass
class LockNonceResponse:
    user_address: Address
    nonce: int


@dataclass
class ModifyLockNonceResponse:
    user_address: Address
    nonce: int


@dataclass
class TransferLockedNonceResponse:
    service_address: Address
    nonce: int


@dataclass
class SiweDomainResponse:
    domain: str


@dataclass
class SiweNonceResponse:
    address: Address
    nonce: str
    expires_in: int


@dataclass
class SiweLoginResponse:
    siwe_token: HexString
    jwt_access_token: str
    jwt_refresh_token: str
    address: Address
    jwt_expires_in: int
    jwt_refresh_expires_in: int
