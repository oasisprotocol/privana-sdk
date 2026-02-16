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
        {"name": "userAddress", "type": "address"},
        {"name": "serviceAddress", "type": "address"},
        {"name": "tokenId", "type": "bytes32"},
        {"name": "amount", "type": "uint256"},
        {"name": "expiry", "type": "uint256"},
    ],
}

TRANSFER_TYPES = {
    "Transfer": [
        {"name": "userAddress", "type": "address"},
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
    ],
}

WITHDRAW_TYPES = {
    "Withdraw": [
        {"name": "userAddress", "type": "address"},
        {"name": "tokenId", "type": "bytes32"},
        {"name": "amount", "type": "uint256"},
        {"name": "nonce", "type": "uint256"},
    ],
}


@dataclass
class LockMessage:
    user_address: Address
    service_address: Address
    token_id: Bytes32
    amount: int
    expiry: int


@dataclass
class TransferMessage:
    user_address: Address
    to_address: Address
    token_id: Bytes32
    amount: int
    nonce: int


@dataclass
class TransferLockedMessage:
    user_address: Address
    to_address: Address
    lock_id: int
    amount: int


@dataclass
class WithdrawMessage:
    user_address: Address
    token_id: Bytes32
    amount: int
    nonce: int
