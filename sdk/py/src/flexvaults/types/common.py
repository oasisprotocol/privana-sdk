from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from ._config import CONFIG

Address = str
Bytes32 = str
HexString = str

Network = Literal["testnet", "mainnet"]


@dataclass(frozen=True)
class NetworkConfig:
    chain_id: int
    name: str
    accounting_contract: Address
    api_url: str


NETWORK_CONFIG: dict[Network, NetworkConfig] = {
    key: NetworkConfig(
        chain_id=net["chainId"],
        name=net["name"],
        accounting_contract=net["accountingContract"],
        api_url=net["apiUrl"],
    )
    for key, net in CONFIG["networks"].items()
}


def get_chain_id(network: Network) -> int:
    return NETWORK_CONFIG[network].chain_id


def get_accounting_contract(network: Network) -> Address:
    return NETWORK_CONFIG[network].accounting_contract


def get_api_url(network: Network) -> str:
    return NETWORK_CONFIG[network].api_url


def normalize_hex(value: str) -> HexString:
    normalized = value.strip().lower()
    if not normalized.startswith("0x"):
        normalized = f"0x{normalized}"
    return normalized


def normalize_address(value: str) -> Address:
    return normalize_hex(value)
