from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from .common import Address, Bytes32


@dataclass(frozen=True)
class TokenConfig:
    id: Bytes32
    symbol: str
    decimals: int
    contract: Address
    name: str


SupportedToken = Literal["USDC"]

SUPPORTED_TOKENS: dict[SupportedToken, TokenConfig] = {
    "USDC": TokenConfig(
        id="0xc719650e9f4b0f27d956638c54518932ef9d15e720a1a2b2850250bcd0816514",
        symbol="USDC",
        decimals=6,
        contract="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        name="USD Coin",
    ),
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
