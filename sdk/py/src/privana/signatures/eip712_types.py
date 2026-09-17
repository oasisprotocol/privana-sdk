from __future__ import annotations

from dataclasses import dataclass

from ..types import NETWORK_CONFIG, Address, Bytes32, Network


@dataclass(frozen=True)
class EIP712Domain:
    name: str
    version: str
    verifying_contract: Address
    # bytes32 of the chain id: the chain binding rides in the standard `salt`
    # field, which wallets do not validate against the connected network —
    # unlike `chainId`, which they refuse to sign on a mismatch. Must match
    # the Accounting contract's salted domain (fields bitmap 0x1b).
    salt: bytes


def create_domain(network: Network, verifying_contract: Address) -> EIP712Domain:
    return EIP712Domain(
        name="AccountingModule",
        version="1",
        verifying_contract=verifying_contract,
        salt=NETWORK_CONFIG[network].chain_id.to_bytes(32, "big"),
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
