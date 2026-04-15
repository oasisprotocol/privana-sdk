from __future__ import annotations

from dataclasses import dataclass

from .common import Address, Bytes32, HexString


@dataclass
class DepositQuoteRequest:
    user_address: Address
    token_id: Bytes32
    amount: int | str


@dataclass
class IncludeDepositRequest:
    user_address: Address
    token_id: Bytes32
    evm_transaction_data: HexString
    rlp_block_header: HexString | None = None
    transaction_index_rlp: HexString | None = None
    transaction_proof_stack: HexString | None = None


@dataclass
class LockFundsRequest:
    user_address: Address
    service_address: Address
    token_id: Bytes32
    amount: int | str
    expiry: int | str
    nonce: int | str
    signature: HexString


@dataclass
class ModifyLockRequest:
    user_address: Address
    lock_id: int
    amount: int | str
    new_expiry: int | str
    nonce: int | str
    signature: HexString


@dataclass
class UnlockFundsRequest:
    user_address: Address
    lock_id: int


@dataclass
class UnlockAllExpiredRequest:
    user_address: Address


@dataclass
class TransferFundsRequest:
    user_address: Address
    to_address: Address
    token_id: Bytes32
    amount: int | str
    nonce: int | str
    signature: HexString


@dataclass
class TransferLockedFundsRequest:
    user_address: Address
    lock_id: int
    to_address: Address
    amount: int | str
    service_address: Address
    nonce: int | str
    signature: HexString


@dataclass
class WithdrawalRequest:
    user_address: Address
    token_id: Bytes32
    amount: int | str
    nonce: int | str
    signature: HexString


@dataclass
class BatchBalancesRequest:
    token_ids: list[Bytes32]
