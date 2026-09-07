from __future__ import annotations

import asyncio
import time
from collections.abc import Awaitable, Callable
from typing import Any

import httpx

from .errors import AccountingApiError, NetworkError

# Re-authenticate this long before the token's stated lifetime runs out. The
# server's clock decides when it really dies, so the margin absorbs skew.
# Capped to a fifth of the lifetime so a short-lived token does not turn into
# one login per request.
REFRESH_MARGIN_SEC = 300

TokenProvider = Callable[[], Awaitable[tuple[str, int]]]


class HttpClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
        token_provider: TokenProvider | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._headers = {
            "Content-Type": "application/json",
            **(headers or {}),
        }
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            headers=self._headers,
            timeout=httpx.Timeout(self._timeout),
        )
        # Auth state is per instance, so two clients (say a pool admin and a
        # liquidity provider) hold separate tokens and refresh independently.
        self._token_provider = token_provider
        self._token_deadline = 0.0
        self._token_lock: asyncio.Lock | None = None

    def _token_is_fresh(self) -> bool:
        # monotonic, not wall clock: a backwards clock step must never stretch
        # a token's perceived lifetime past what the server granted.
        return (
            self.get_header("Authorization") is not None
            and time.monotonic() < self._token_deadline
        )

    def invalidate_token(self) -> None:
        """Forget the cached token so the next request authenticates again."""
        self._token_deadline = 0.0

    async def _ensure_token(self) -> None:
        """Authenticate when there is no live token, doing it once for a burst
        of concurrent callers rather than once per caller.
        """
        if self._token_provider is None or self._token_is_fresh():
            return
        if self._token_lock is None:
            self._token_lock = asyncio.Lock()
        async with self._token_lock:
            if self._token_is_fresh():
                return
            token, expires_in = await self._token_provider()
            lifetime = max(expires_in, 1)
            margin = min(REFRESH_MARGIN_SEC, lifetime // 5)
            self.set_header("Authorization", f"Bearer {token}")
            self._token_deadline = time.monotonic() + max(lifetime - margin, 1)

    def get_base_url(self) -> str:
        return self._base_url

    async def get(self, path: str) -> Any:
        return await self._request("GET", path)

    async def post(self, path: str, body: Any | None = None) -> Any:
        return await self._request("POST", path, body)

    def set_header(self, name: str, value: str) -> None:
        self._headers[name] = value
        self._client.headers[name] = value

    def remove_header(self, name: str) -> None:
        self._headers.pop(name, None)
        self._client.headers.pop(name, None)

    def get_header(self, name: str) -> str | None:
        return self._headers.get(name)

    async def _request(
        self,
        method: str,
        path: str,
        body: Any | None = None,
    ) -> Any:
        await self._ensure_token()
        try:
            return await self._send(method, path, body)
        except AccountingApiError as exc:
            if self._token_provider is None or exc.status_code not in (401, 403):
                raise
            # The token was rejected before its deadline: revoked, or the
            # service restarted under us. Authenticate again and replay once.
            # A request refused for auth never reached the handler, so this
            # cannot duplicate an effect.
            self.invalidate_token()
            await self._ensure_token()
            return await self._send(method, path, body)

    async def _send(
        self,
        method: str,
        path: str,
        body: Any | None = None,
    ) -> Any:
        try:
            response = await self._client.request(
                method=method,
                url=path,
                json=body,
            )

            if not response.is_success:
                detail: Any = None
                try:
                    error_body = response.json()
                    detail = error_body.get("detail") or error_body.get("message")
                except Exception:
                    try:
                        detail = response.text
                    except Exception:
                        pass

                raise AccountingApiError(
                    f"API request failed: {response.status_code} {response.reason_phrase}",
                    response.status_code,
                    detail,
                )

            return response.json()

        except AccountingApiError:
            raise
        except httpx.TimeoutException:
            raise NetworkError(f"Request timeout after {self._timeout}s")
        except httpx.HTTPError as e:
            raise NetworkError(f"Network request failed: {str(e)}", e)
        except Exception as e:
            if isinstance(e, (AccountingApiError, NetworkError)):
                raise
            cause = e if isinstance(e, Exception) else None
            raise NetworkError(f"Unknown network error occurred: {str(e)}", cause)

    async def close(self) -> None:
        await self._client.aclose()

    async def __aenter__(self) -> HttpClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
