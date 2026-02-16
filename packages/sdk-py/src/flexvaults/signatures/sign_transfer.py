from __future__ import annotations

from dataclasses import dataclass

from eth_account.signers.local import LocalAccount

from ..types import Address, HexString, Network
from ._signer import hex_to_bytes, sign_typed_data
from .eip712_types import TRANSFER_TYPES, TransferMessage, create_domain


@dataclass
class SignTransferParams:
    account: LocalAccount
    network: Network
    verifying_contract: Address
    message: TransferMessage


def sign_transfer_message(params: SignTransferParams) -> HexString:
    domain = create_domain(params.network, params.verifying_contract)

    message_data = {
        "userAddress": params.message.user_address,
        "toAddress": params.message.to_address,
        "tokenId": hex_to_bytes(params.message.token_id),
        "amount": params.message.amount,
        "nonce": params.message.nonce,
    }

    return sign_typed_data(
        account=params.account,
        domain=domain,
        types=TRANSFER_TYPES,
        primary_type="Transfer",
        message=message_data,
    )
