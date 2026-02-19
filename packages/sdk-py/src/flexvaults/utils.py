from __future__ import annotations

import math
import time
from datetime import datetime, timezone


def format_token_amount(amount: str | int, decimals: int = 18) -> str:
    value = int(amount) if isinstance(amount, str) else amount
    divisor = 10**decimals
    integer_part = value // divisor
    fractional_part = value % divisor

    fractional_str = str(fractional_part).zfill(decimals)
    two_decimals = fractional_str[:2].ljust(2, "0")

    integer_with_commas = f"{integer_part:,}"
    return f"{integer_with_commas}.{two_decimals}"


def parse_token_amount(amount: str, decimals: int = 18) -> int:
    parts = amount.split(".")
    integer_part = parts[0]
    fractional_part = parts[1] if len(parts) > 1 else ""
    padded_fractional = fractional_part.ljust(decimals, "0")[:decimals]
    return int(integer_part + padded_fractional)


def shorten_address(address: str, chars: int = 4) -> str:
    if not address or len(address) < chars * 2 + 2:
        return address
    return f"{address[: chars + 2]}...{address[-chars:]}"


def format_timestamp(timestamp: int) -> str:
    dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)
    return dt.strftime("%Y-%m-%d %H:%M:%S %Z")


def is_expired(expiry: int) -> bool:
    return math.floor(time.time()) > expiry


def format_time_remaining(expiry_timestamp: int) -> str:
    now = math.floor(time.time())
    diff = expiry_timestamp - now

    if diff <= 0:
        return "Expired"

    days = diff // 86400
    hours = (diff % 86400) // 3600
    minutes = (diff % 3600) // 60

    if days > 0:
        return f"{days}d {hours}h left" if hours > 0 else f"{days}d left"
    if hours > 0:
        return f"{hours}h {minutes}m left" if minutes > 0 else f"{hours}h left"
    return f"{minutes}m left"


def format_relative_time(timestamp: str | int) -> str:
    if isinstance(timestamp, str):
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    else:
        dt = datetime.fromtimestamp(timestamp, tz=timezone.utc)

    now = datetime.now(tz=timezone.utc)
    diff = int((now - dt).total_seconds())

    if diff < 60:
        return "Just now"
    if diff < 3600:
        return f"{diff // 60}m ago"
    if diff < 86400:
        return f"{diff // 3600}h ago"
    if diff < 604800:
        return f"{diff // 86400}d ago"
    return dt.strftime("%Y-%m-%d")
