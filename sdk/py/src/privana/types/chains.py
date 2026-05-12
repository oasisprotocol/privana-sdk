from __future__ import annotations

from dataclasses import dataclass, field

from ._config import CONFIG
from .tokens import SUPPORTED_TOKENS, TokenConfig


@dataclass(frozen=True)
class ChainConfig:
    id: int
    name: str
    explorer_url: str
    tokens: tuple[TokenConfig, ...] = field(default_factory=tuple)


SUPPORTED_CHAINS: list[ChainConfig] = [
    ChainConfig(
        id=chain["id"],
        name=chain["name"],
        explorer_url=chain["explorerUrl"],
        tokens=tuple(SUPPORTED_TOKENS[key] for key in chain["tokens"]),
    )
    for chain in CONFIG["chains"]
]


def get_chain_by_id(chain_id: int) -> ChainConfig | None:
    for chain in SUPPORTED_CHAINS:
        if chain.id == chain_id:
            return chain
    return None


def get_explorer_address_url(chain_id: int, address: str) -> str | None:
    chain = get_chain_by_id(chain_id)
    if not chain:
        return None
    return f"{chain.explorer_url}/address/{address}#tokentxns"


def get_all_tokens() -> list[TokenConfig]:
    tokens: list[TokenConfig] = []
    for chain in SUPPORTED_CHAINS:
        tokens.extend(chain.tokens)
    return tokens
