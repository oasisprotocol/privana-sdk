from __future__ import annotations

from dataclasses import dataclass, field

from .common import Address, Bytes32


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
    amount: int
    deposit_address: Address
    transaction: TransactionData
    instructions: str


@dataclass
class IncludeDepositResponse:
    submission_id: str
    status: str


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


@dataclass
class TokenInfoResponse:
    token_id: Bytes32
    symbol: str
    decimals: int
    chain_id: int
    contract_address: Address | None = None


@dataclass
class LockInfo:
    lock_id: int
    user_address: Address
    service_address: Address
    token_id: Bytes32
    amount: int
    expiry: int
    is_expired: bool


@dataclass
class LockedFundsResponse:
    user_address: Address
    locks: list[LockInfo] = field(default_factory=list)
    total_locked: int = 0
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
class PendingWithdrawal:
    index: int
    user_address: Address
    token_id: Bytes32
    amount: str
    status: str
    created_at: str


@dataclass
class PendingWithdrawalsResponse:
    user_address: Address
    withdrawals: list[PendingWithdrawal] = field(default_factory=list)


@dataclass
class WithdrawalInfoResponse:
    index: int
    user_address: Address
    token_id: Bytes32
    amount: str
    status: str
    created_at: str
    completed_at: str | None = None
    transaction_hash: str | None = None


@dataclass
class TransferNonceResponse:
    user_address: Address
    nonce: int
