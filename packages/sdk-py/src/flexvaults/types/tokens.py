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


SupportedToken = Literal["USDC"]

SUPPORTED_TOKENS: dict[str, TokenConfig] = {
    key: TokenConfig(**token) for key, token in CONFIG["tokens"].items()
}


def get_token_config(token: SupportedToken) -> TokenConfig:
    return SUPPORTED_TOKENS[token]


def get_token_by_id(token_id: Bytes32) -> TokenConfig | None:
    for t in SUPPORTED_TOKENS.values():
        if t.id.lower() == token_id.lower():
            return t
    return None


def is_valid_token(token: str) -> bool:
    return token in SUPPORTED_TOKENS
