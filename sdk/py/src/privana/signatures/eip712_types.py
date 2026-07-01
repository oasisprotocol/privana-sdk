from __future__ import annotations

from dataclasses import dataclass

from ..types import NETWORK_CONFIG, Address, Bytes32, Network


@dataclass(frozen=True)
class EIP712Domain:
    name: str
    version: str
    chain_id: int
    verifying_contract: Address


def create_domain(network: Network, verifying_contract: Address) -> EIP712Domain:
    return EIP712Domain(
        name="AccountingModule",
        version="1",
        chain_id=NETWORK_CONFIG[network].chain_id,
        verifying_contract=verifying_contract,
    )


LOCK_TYPES = {
    "Lock": [
        {"name": "serviceAddress", "type": "address"},
        {"name": "tokenId", "type": "bytes32"},
        {"name": "amount", "type": "uint256"},
        {"name": "expiry", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
    ],
}

DEPOSIT_LOCK_AUTHORIZATION_TYPES = {
    "DepositLockAuthorization": [
        {"name": "userAddress", "type": "address"},
        {"name": "serviceAddress", "type": "address"},
        {"name": "tokenId", "type": "bytes32"},
        {"name": "maxAmount", "type": "uint256"},
        {"name": "minAmount", "type": "uint256"},
        {"name": "lockDuration", "type": "uint256"},
        {"name": "authorizationDeadline", "type": "uint256"},
        {"name": "intentId", "type": "bytes32"},
    ],
}

TRANSFER_TYPES = {
    "Transfer": [
        {"name": "toAddress", "type": "address"},
        {"name": "tokenId", "type": "bytes32"},
        {"name": "amount", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
    ],
}

TRANSFER_LOCKED_TYPES = {
    "TransferLocked": [
        {"name": "userAddress", "type": "address"},
        {"name": "toAddress", "type": "address"},
        {"name": "lockId", "type": "uint256"},
        {"name": "amount", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
        {"name": "serviceAddress", "type": "address"},
    ],
}

MODIFY_LOCK_TYPES = {
    "ModifyLock": [
        {"name": "lockId", "type": "uint256"},
        {"name": "amount", "type": "uint256"},
        {"name": "newExpiry", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
    ],
}

WITHDRAW_TYPES = {
    "Withdraw": [
        {"name": "tokenId", "type": "bytes32"},
        {"name": "amount", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
    ],
}

WITHDRAW_FROM_LOCK_TYPES = {
    "WithdrawFromLock": [
        {"name": "userAddress", "type": "address"},
        {"name": "toAddress", "type": "address"},
        {"name": "lockId", "type": "uint256"},
        {"name": "amount", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
    ],
}


@dataclass
class LockMessage:
    service_address: Address
    token_id: Bytes32
    amount: int
    expiry: int
    nonce: int


@dataclass
class DepositLockAuthorizationMessage:
    user_address: Address
    service_address: Address
    token_id: Bytes32
    max_amount: int
    min_amount: int
    lock_duration: int
    authorization_deadline: int
    intent_id: Bytes32


@dataclass
class TransferMessage:
    to_address: Address
    token_id: Bytes32
    amount: int
    nonce: int


@dataclass
class ModifyLockMessage:
    lock_id: int
    amount: int
    new_expiry: int
    nonce: int


@dataclass
class TransferLockedMessage:
    user_address: Address
    to_address: Address
    lock_id: int
    amount: int
    nonce: int
    service_address: Address


@dataclass
class WithdrawMessage:
    token_id: Bytes32
    amount: int
    nonce: int


@dataclass
class WithdrawFromLockMessage:
    user_address: Address
    to_address: Address
    lock_id: int
    amount: int
    nonce: int
