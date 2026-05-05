from __future__ import annotations

from typing import Any

from eth_account.signers.local import LocalAccount

from ..types import HexString
from .eip712_types import EIP712Domain


def hex_to_bytes(value: str) -> bytes:
    stripped = value[2:] if value.startswith("0x") else value
    return bytes.fromhex(stripped)


def sign_typed_data(
    account: LocalAccount,
    domain: EIP712Domain,
    types: dict[str, list[dict[str, str]]],
    primary_type: str,
    message: dict[str, Any],
) -> HexString:
    from eth_account.messages import encode_typed_data

    domain_data = {
        "name": domain.name,
        "version": domain.version,
        "chainId": domain.chain_id,
        "verifyingContract": domain.verifying_contract,
    }

    full_message = {
        "types": {
            "EIP712Domain": [
                {"name": "name", "type": "string"},
                {"name": "version", "type": "string"},
                {"name": "chainId", "type": "uint256"},
                {"name": "verifyingContract", "type": "address"},
            ],
            **types,
        },
        "primaryType": primary_type,
        "domain": domain_data,
        "message": message,
    }

    encoded = encode_typed_data(full_message=full_message)
    signed = account.sign_message(encoded)
    return f"0x{signed.signature.hex()}"
