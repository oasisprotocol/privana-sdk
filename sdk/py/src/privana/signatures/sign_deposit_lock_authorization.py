from __future__ import annotations

import math
import secrets
import time
from dataclasses import dataclass

from eth_account.signers.local import LocalAccount

from ..types import Address, Bytes32, HexString, Network
from ._signer import hex_to_bytes, sign_typed_data
from .eip712_types import (
    DEPOSIT_LOCK_AUTHORIZATION_TYPES,
    DepositLockAuthorizationMessage,
    create_domain,
)


@dataclass
class SignDepositLockAuthorizationParams:
    account: LocalAccount
    network: Network
    verifying_contract: Address
    message: DepositLockAuthorizationMessage


def sign_deposit_lock_authorization_message(
    params: SignDepositLockAuthorizationParams,
) -> HexString:
    domain = create_domain(params.network, params.verifying_contract)

    message_data = {
        "userAddress": params.message.user_address,
        "serviceAddress": params.message.service_address,
        "tokenId": hex_to_bytes(params.message.token_id),
        "maxAmount": params.message.max_amount,
        "minAmount": params.message.min_amount,
        "lockDuration": params.message.lock_duration,
        "authorizationDeadline": params.message.authorization_deadline,
        "intentId": hex_to_bytes(params.message.intent_id),
    }

    return sign_typed_data(
        account=params.account,
        domain=domain,
        types=DEPOSIT_LOCK_AUTHORIZATION_TYPES,
        primary_type="DepositLockAuthorization",
        message=message_data,
    )


def create_deposit_lock_authorization_deadline(minutes_from_now: int = 60) -> int:
    return math.floor(time.time()) + minutes_from_now * 60


def create_deposit_lock_duration(minutes: int = 60) -> int:
    return minutes * 60


def create_deposit_lock_intent_id() -> Bytes32:
    return f"0x{secrets.token_hex(32)}"
