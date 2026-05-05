from __future__ import annotations

from dataclasses import dataclass

from eth_account.signers.local import LocalAccount

from ..types import Address, HexString, Network
from ._signer import sign_typed_data
from .eip712_types import (
    WITHDRAW_FROM_LOCK_TYPES,
    WithdrawFromLockMessage,
    create_domain,
)


@dataclass
class SignWithdrawFromLockParams:
    account: LocalAccount
    network: Network
    verifying_contract: Address
    message: WithdrawFromLockMessage


def sign_withdraw_from_lock_message(params: SignWithdrawFromLockParams) -> HexString:
    domain = create_domain(params.network, params.verifying_contract)

    message_data = {
        "userAddress": params.message.user_address,
        "toAddress": params.message.to_address,
        "lockId": params.message.lock_id,
        "amount": params.message.amount,
        "nonce": params.message.nonce,
    }

    return sign_typed_data(
        account=params.account,
        domain=domain,
        types=WITHDRAW_FROM_LOCK_TYPES,
        primary_type="WithdrawFromLock",
        message=message_data,
    )
