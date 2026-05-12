from __future__ import annotations

from dataclasses import dataclass

from eth_account.signers.local import LocalAccount

from ..types import Address, HexString, Network
from ._signer import sign_typed_data
from .eip712_types import MODIFY_LOCK_TYPES, ModifyLockMessage, create_domain


@dataclass
class SignModifyLockParams:
    account: LocalAccount
    network: Network
    verifying_contract: Address
    message: ModifyLockMessage


def sign_modify_lock_message(params: SignModifyLockParams) -> HexString:
    domain = create_domain(params.network, params.verifying_contract)

    message_data = {
        "lockId": params.message.lock_id,
        "amount": params.message.amount,
        "newExpiry": params.message.new_expiry,
        "nonce": params.message.nonce,
    }

    return sign_typed_data(
        account=params.account,
        domain=domain,
        types=MODIFY_LOCK_TYPES,
        primary_type="ModifyLock",
        message=message_data,
    )
