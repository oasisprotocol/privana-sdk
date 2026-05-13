from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from .common import Address, Bytes32, HexString


@dataclass
class DepositAddressResponse:
    deposit_address: Address
    chain_type: str
    version: int
    min_deposit: dict[str, dict[str, str]] = field(default_factory=dict)


@dataclass
class DepositCheckResponse:
    status: Literal["credited", "pending", "error"]
    deposit_id: str | None = None
    amount: str | None = None
    token_address: Address | None = None
    detail: str | None = None


@dataclass
class TransactionSubmissionResponse:
    submission_id: str
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


HistoryKind = Literal[
    "deposit",
    "withdraw",
    "createLock",
    "transferFromLock",
    "transferBalance",
    "unknown",
]


@dataclass
class HistoryEntry:
    kind: HistoryKind
    timestamp: int
    token_id: Bytes32 | None = None
    amount: str | None = None
    counterparty: Address | None = None
    deposit_id: Bytes32 | None = None
    chain_id: int | None = None


@dataclass
class HistoryResponse:
    history: list[HistoryEntry] = field(default_factory=list)
    total: int = 0


@dataclass
class TokenInfoResponse:
    token_id: Bytes32
    token_type: int
    token_type_name: str
    data: str
    chain_id: int | None = None
    chain_name: str | None = None
    token_address: Address | None = None
    symbol: str | None = None
    name: str | None = None
    decimals: int | None = None


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
    to_address: Address
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


@dataclass
class TokenListResponse:
    tokens: list[TokenInfoResponse] = field(default_factory=list)


@dataclass
class HostedAuthTokenExchangeResponse:
    access_token: str
    id_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    refresh_expires_in: int
    address: Address


@dataclass
class JwtRefreshResponse:
    token: str
    refresh_token: str
    expires_in: int
    refresh_expires_in: int


@dataclass
class JwtLogoutResponse:
    message: str
    revoked_tokens: int
