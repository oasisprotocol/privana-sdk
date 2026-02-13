from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

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
    "testnet": NetworkConfig(
        chain_id=23295,
        name="Sapphire Testnet",
        accounting_contract="0xaF8e5de153A584528B57DD4B9B0195956BBDF571",
        api_url="https://p8000.m1356.opf-testnet-rofl-25.rofl.app",
    ),
    "mainnet": NetworkConfig(
        chain_id=23294,
        name="Sapphire Mainnet",
        accounting_contract="0x0000000000000000000000000000000000000000",
        api_url="",
    ),
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
