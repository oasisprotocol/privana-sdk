from __future__ import annotations

import asyncio
import secrets
import string
import weakref
from dataclasses import dataclass
from datetime import datetime, timezone
from time import monotonic_ns
from typing import Protocol

from eth_account.messages import encode_defunct
from eth_account.signers.local import LocalAccount

from ..types import Address, HexString, normalize_address, normalize_hex
from ..types.responses import SiweDomainResponse, SiweLoginResponse


class SiweSigner(Protocol):
    async def __call__(self, message: str) -> HexString: ...


class SiweAuthClient(Protocol):
    @property
    def base_url(self) -> str: ...

    def set_siwe_token(self, token: str) -> None: ...

    async def get_siwe_domain(self) -> SiweDomainResponse: ...

    async def siwe_login(self, *, siwe_message: str, signature: str) -> SiweLoginResponse: ...


def _random_nonce(length: int = 8) -> str:
    charset = string.ascii_letters + string.digits
    return "".join(secrets.choice(charset) for _ in range(length))


def build_siwe_message(
    *,
    domain: str,
    address: Address | str,
    chain_id: int,
    statement: str = "Sign in to Flexvaults",
    uri: str | None = None,
    nonce: str | None = None,
    issued_at: str | datetime | None = None,
) -> str:
    """
    Build a minimal SIWE message (EIP-4361) compatible with AccountingSiweAuth.

    Matches the TypeScript SDK format:
    - No expiration time (contract defaults to 24h)
    - No resources (informational only on-chain currently)
    """
    normalized_domain = domain.strip()
    normalized_address = normalize_address(str(address))
    normalized_chain_id = int(chain_id)
    normalized_uri = uri or f"https://{normalized_domain}"
    normalized_nonce = nonce or _random_nonce()
    if issued_at is None:
        normalized_issued_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    elif isinstance(issued_at, datetime):
        normalized_issued_at = issued_at.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
    else:
        normalized_issued_at = issued_at

    return "\n".join(
        [
            f"{normalized_domain} wants you to sign in with your Ethereum account:",
            f"{normalized_address}",
            "",
            statement,
            "",
            f"URI: {normalized_uri}",
            "Version: 1",
            f"Chain ID: {normalized_chain_id}",
            f"Nonce: {normalized_nonce}",
            f"Issued At: {normalized_issued_at}",
        ]
    )


def sign_siwe_message(account: LocalAccount, message: str) -> HexString:
    """
    Sign a SIWE message using EIP-191 personal_sign semantics.

    AccountingSiweAuth uses the EIP-191 prefix and ecrecover over the message bytes,
    so this must match `signMessage` / personal_sign.
    """
    signed = account.sign_message(encode_defunct(text=message))
    return f"0x{signed.signature.hex()}"


@dataclass(frozen=True)
class _CachedToken:
    token: HexString
    expires_at_ms: int


_TOKEN_TTL_MS = 23 * 60 * 60 * 1000
_TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000

_cache: dict[str, _CachedToken] = {}


@dataclass(frozen=True)
class _FailureState:
    until_ms: int
    attempts: int
    last_failure_ms: int


_FAILURE_COOLDOWN_BASE_MS = 60 * 1000
_FAILURE_COOLDOWN_MAX_MS = 5 * 60 * 1000
_FAILURE_COOLDOWN_RESET_WINDOW_MS = 10 * 60 * 1000

_failures: dict[str, _FailureState] = {}


class SiweAuthCooldownError(Exception):
    def __init__(self, *, until_ms: int, retry_after_ms: int) -> None:
        retry_after_s = max(1, (int(retry_after_ms) + 999) // 1000)
        super().__init__(
            "SIWE authentication is temporarily disabled after a recent failure. "
            f"Retry in ~{retry_after_s}s."
        )
        self.until_ms = int(until_ms)
        self.retry_after_ms = int(retry_after_ms)


def _cooldown_ms(attempts: int) -> int:
    clamped = max(1, min(int(attempts), 16))
    ms = _FAILURE_COOLDOWN_BASE_MS * (2 ** (clamped - 1))
    return int(min(ms, _FAILURE_COOLDOWN_MAX_MS))


def _record_failure(key: str, now_ms: int) -> _FailureState:
    previous = _failures.get(key)
    if previous and now_ms - previous.last_failure_ms <= _FAILURE_COOLDOWN_RESET_WINDOW_MS:
        attempts = previous.attempts + 1
    else:
        attempts = 1

    state = _FailureState(
        until_ms=now_ms + _cooldown_ms(attempts),
        attempts=attempts,
        last_failure_ms=now_ms,
    )
    _failures[key] = state
    return state


def _clear_failure(key: str) -> None:
    _failures.pop(key, None)


@dataclass
class _LoopState:
    lock: asyncio.Lock
    inflight: dict[str, asyncio.Task[HexString]]


_loop_states: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, _LoopState] = (
    weakref.WeakKeyDictionary()
)


def _get_loop_state() -> _LoopState:
    loop = asyncio.get_running_loop()
    state = _loop_states.get(loop)
    if state is None:
        state = _LoopState(lock=asyncio.Lock(), inflight={})
        _loop_states[loop] = state
    return state


def _is_expired(expires_at_ms: int, now_ms: int) -> bool:
    return expires_at_ms - now_ms <= _TOKEN_REFRESH_SKEW_MS


def _cache_key(*, cache_scope: str, chain_id: int, address: Address) -> str:
    return f"{cache_scope.rstrip('/')}:{chain_id}:{address.lower()}"


async def ensure_siwe_token(
    *,
    client: SiweAuthClient,
    chain_id: int,
    address: Address | str,
    signer: SiweSigner | LocalAccount,
    cache_scope: str | None = None,
    statement: str | None = None,
    token_ttl_ms: int = _TOKEN_TTL_MS,
) -> HexString:
    """
    Ensure the FlexvaultsClient has a valid SIWE token set for private reads.

    - Caches token in-memory keyed by {cache_scope, chain_id, address}
    - De-dupes concurrent ensure calls to avoid multiple sign flows
    """
    user = normalize_address(str(address))
    scope = (cache_scope or getattr(client, "base_url", None) or "").strip() or "flexvaults"
    key = _cache_key(cache_scope=scope, chain_id=int(chain_id), address=user)

    state = _get_loop_state()

    task: asyncio.Task[HexString]
    async with state.lock:
        now_ms = monotonic_ns() // 1_000_000
        cached = _cache.get(key)
        if cached and not _is_expired(cached.expires_at_ms, now_ms):
            client.set_siwe_token(cached.token)
            _clear_failure(key)
            return cached.token

        existing = state.inflight.get(key)
        if existing is not None:
            task = existing
        else:
            failure = _failures.get(key)
            if failure and now_ms < failure.until_ms:
                raise SiweAuthCooldownError(
                    until_ms=failure.until_ms,
                    retry_after_ms=failure.until_ms - now_ms,
                )

            async def _do() -> HexString:
                try:
                    domain_resp: SiweDomainResponse = await client.get_siwe_domain()
                    message = build_siwe_message(
                        domain=domain_resp.domain,
                        address=user,
                        chain_id=int(chain_id),
                        statement=statement or "Sign in to Flexvaults",
                    )

                    if isinstance(signer, LocalAccount):
                        signature = sign_siwe_message(signer, message)
                    else:
                        signature = normalize_hex(await signer(message))

                    login_resp: SiweLoginResponse = await client.siwe_login(
                        siwe_message=message,
                        signature=signature,
                    )
                    token = normalize_hex(login_resp.token)
                    client.set_siwe_token(token)

                    now_ms2 = monotonic_ns() // 1_000_000
                    async with state.lock:
                        _cache[key] = _CachedToken(
                            token=token, expires_at_ms=now_ms2 + int(token_ttl_ms)
                        )
                        _clear_failure(key)
                    return token
                except Exception:
                    now_ms2 = monotonic_ns() // 1_000_000
                    async with state.lock:
                        _record_failure(key, now_ms2)
                    raise

            task = asyncio.create_task(_do())
            state.inflight[key] = task

    try:
        return await task
    finally:
        async with state.lock:
            if state.inflight.get(key) is task:
                state.inflight.pop(key, None)
