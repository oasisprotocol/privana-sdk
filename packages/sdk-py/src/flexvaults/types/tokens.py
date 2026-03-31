from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ._config import CONFIG
from .common import Address, Bytes32


@dataclass(frozen=True)
class TokenConfig:
    id: Bytes32
    symbol: str
    decimals: int
    contract: Address
    name: str


SupportedToken = Literal[
    "0xc719650e9f4b0f27d956638c54518932ef9d15e720a1a2b2850250bcd0816514",
    "0x330ba47d00c7ce3018deee017b319fd7cc6473a2ddc9e6eba6ebb4207be15279",
    "0x335b5cccd1e63b2fe79863a0db73fce430e4e66902e2b78424f8662621e29fb7",
]

SUPPORTED_TOKENS: dict[str, TokenConfig] = {
    token["id"]: TokenConfig(**token) for token in CONFIG["tokens"].values()
}


def get_token_config(token_id: str) -> TokenConfig:
    normalized = token_id.lower()
    for tid, config in SUPPORTED_TOKENS.items():
        if tid.lower() == normalized:
            return config
    raise KeyError(f"Unknown token ID: {token_id}")


def get_token_by_id(token_id: Bytes32) -> TokenConfig | None:
    normalized = token_id.lower()
    for tid, config in SUPPORTED_TOKENS.items():
        if tid.lower() == normalized:
            return config
    return None


def is_valid_token(token_id: str) -> bool:
    normalized = token_id.lower()
    return any(tid.lower() == normalized for tid in SUPPORTED_TOKENS)
