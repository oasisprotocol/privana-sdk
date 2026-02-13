from __future__ import annotations

from dataclasses import dataclass, field

from .tokens import TokenConfig


@dataclass(frozen=True)
class ChainConfig:
    id: int
    name: str
    explorer_url: str
    tokens: tuple[TokenConfig, ...] = field(default_factory=tuple)


SUPPORTED_CHAINS: list[ChainConfig] = [
    ChainConfig(
        id=84532,
        name="Base Sepolia",
        explorer_url="https://sepolia.basescan.org",
        tokens=(
            TokenConfig(
                id="0xc719650e9f4b0f27d956638c54518932ef9d15e720a1a2b2850250bcd0816514",
                symbol="USDC",
                decimals=6,
                contract="0x036CbD53842c5426634e7929541eC2318f3dCF7e",
                name="USD Coin",
            ),
        ),
    ),
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
