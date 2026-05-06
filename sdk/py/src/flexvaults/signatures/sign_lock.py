from __future__ import annotations

import math
import time
from dataclasses import dataclass

from eth_account.signers.local import LocalAccount

from ..types import Address, HexString, Network
from ._signer import hex_to_bytes, sign_typed_data
from .eip712_types import LOCK_TYPES, LockMessage, create_domain


@dataclass
class SignLockParams:
    account: LocalAccount
    network: Network
    verifying_contract: Address
    message: LockMessage


def sign_lock_message(params: SignLockParams) -> HexString:
    domain = create_domain(params.network, params.verifying_contract)

    message_data = {
        "serviceAddress": params.message.service_address,
        "tokenId": hex_to_bytes(params.message.token_id),
        "amount": params.message.amount,
        "expiry": params.message.expiry,
        "nonce": params.message.nonce,
    }

    return sign_typed_data(
        account=params.account,
        domain=domain,
        types=LOCK_TYPES,
        primary_type="Lock",
        message=message_data,
    )


def create_lock_expiry(minutes_from_now: int = 60) -> int:
    return math.floor(time.time()) + minutes_from_now * 60
