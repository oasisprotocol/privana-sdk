from __future__ import annotations

from typing import Any

import httpx

from .errors import AccountingApiError, NetworkError


class HttpClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
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

    async def get(self, path: str) -> Any:
        return await self._request("GET", path)

    async def post(self, path: str, body: Any | None = None) -> Any:
        return await self._request("POST", path, body)

    async def _request(
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
                detail: str | None = None
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
