from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .common import Address, Bytes32, HexString

HostedAuthResponseMode = Literal["web_message", "redirect"]


@dataclass
class DepositAddressRequest:
    chain_type: str = "evm"
    version: int = 0


@dataclass
class DepositLockAuthorization:
    service_address: Address
    token_id: Bytes32
    max_amount: int | str
    lock_duration: int | str
    authorization_deadline: int | str
    intent_id: Bytes32
    signature: HexString
    min_amount: int | str = 0


@dataclass
class DepositCheckRequest:
    chain_id: int
    tx_hash: HexString
    amount: int | str
    chain_type: str = "evm"
    log_index: int = 0
    version: int = 0
    lock_authorization: DepositLockAuthorization | None = None


@dataclass
class LockFundsRequest:
    service_address: Address
    token_id: Bytes32
    amount: int | str
    expiry: int | str
    nonce: int | str
    signature: HexString


@dataclass
class ModifyLockRequest:
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
    token_id: Bytes32
    amount: int | str
    nonce: int | str
    signature: HexString


@dataclass
class WithdrawFromLockRequest:
    to_address: Address
    lock_id: int
    amount: int | str
    nonce: int | str
    signature: HexString


@dataclass
class BatchBalancesRequest:
    token_ids: list[Bytes32]


@dataclass
class HostedAuthAuthorizeUrlRequest:
    client_id: str
    redirect_uri: str
    code_challenge: str
    state: str
    chain_id: int
    response_mode: HostedAuthResponseMode = "redirect"
    code_challenge_method: Literal["S256"] = "S256"


@dataclass
class HostedAuthTokenExchangeRequest:
    code: str
    code_verifier: str
    client_id: str
    redirect_uri: str
    grant_type: Literal["authorization_code"] = "authorization_code"


@dataclass
class JwtRefreshRequest:
    refresh_token: str


@dataclass
class JwtLogoutRequest:
    refresh_token: str | None = None
    revoke_all: bool = False
