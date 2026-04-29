from __future__ import annotations

from dataclasses import dataclass

from eth_account.signers.local import LocalAccount

from ..types import Address, HexString, Network
from ._signer import sign_typed_data
from .eip712_types import TRANSFER_LOCKED_TYPES, TransferLockedMessage, create_domain


@dataclass
class SignTransferLockedParams:
    account: LocalAccount
    network: Network
    verifying_contract: Address
    message: TransferLockedMessage


def sign_transfer_locked_message(params: SignTransferLockedParams) -> HexString:
    domain = create_domain(params.network, params.verifying_contract)

    message_data = {
        "userAddress": params.message.user_address,
        "toAddress": params.message.to_address,
        "lockId": params.message.lock_id,
        "amount": params.message.amount,
        "nonce": params.message.nonce,
        "serviceAddress": params.message.service_address,
    }

    return sign_typed_data(
        account=params.account,
        domain=domain,
        types=TRANSFER_LOCKED_TYPES,
        primary_type="TransferLocked",
        message=message_data,
    )
