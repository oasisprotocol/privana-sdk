from __future__ import annotations

from dataclasses import dataclass

from eth_account.signers.local import LocalAccount

from ..types import Address, HexString, Network
from ._signer import hex_to_bytes, sign_typed_data
from .eip712_types import WITHDRAW_TYPES, WithdrawMessage, create_domain


@dataclass
class SignWithdrawParams:
    account: LocalAccount
    network: Network
    verifying_contract: Address
    message: WithdrawMessage


def sign_withdraw_message(params: SignWithdrawParams) -> HexString:
    domain = create_domain(params.network, params.verifying_contract)

    message_data = {
        "tokenId": hex_to_bytes(params.message.token_id),
        "amount": params.message.amount,
        "nonce": params.message.nonce,
    }

    return sign_typed_data(
        account=params.account,
        domain=domain,
        types=WITHDRAW_TYPES,
        primary_type="Withdraw",
        message=message_data,
    )
