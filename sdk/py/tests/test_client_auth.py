import asyncio

import httpx
import pytest
import respx

from privana.client import AccountingApiError, PrivanaClient

BASE_URL = "https://api.test.example.com"
TOKEN_ID = "0xtoken456"
BALANCE_URL = f"{BASE_URL}/v1/accounting/balances/{TOKEN_ID}"

BALANCE_BODY = {
    "user_address": "0xuser123",
    "token_id": TOKEN_ID,
    "balance": "1000",
    "token_symbol": "USDC",
    "chain_id": "8453",
}


def _provider(tokens, expires_in=3600, calls=None):
    """Async token provider handing out `tokens` in order."""
    seq = iter(tokens)

    async def provide():
        if calls is not None:
            calls.append(1)
        return next(seq), expires_in

    return provide


class TestClientManagedAuth:
    @respx.mock
    async def test_authenticates_before_the_first_request(self):
        calls = []
        client = PrivanaClient(
            base_url=BASE_URL, token_provider=_provider(["jwt-one"], calls=calls)
        )
        route = respx.get(BALANCE_URL).mock(return_value=httpx.Response(200, json=BALANCE_BODY))

        await client.get_balance(TOKEN_ID)

        assert len(calls) == 1
        assert route.calls[0].request.headers["Authorization"] == "Bearer jwt-one"

    @respx.mock
    async def test_reuses_a_live_token(self):
        calls = []
        client = PrivanaClient(
            base_url=BASE_URL, token_provider=_provider(["jwt-one"], calls=calls)
        )
        respx.get(BALANCE_URL).mock(return_value=httpx.Response(200, json=BALANCE_BODY))

        await client.get_balance(TOKEN_ID)
        await client.get_balance(TOKEN_ID)

        assert len(calls) == 1

    @respx.mock
    async def test_reauthenticates_once_the_token_expires(self):
        calls = []
        client = PrivanaClient(
            base_url=BASE_URL,
            # A 1 second lifetime is already past its refresh margin, so the
            # second call has to authenticate again.
            token_provider=_provider(["jwt-one", "jwt-two"], expires_in=1, calls=calls),
        )
        route = respx.get(BALANCE_URL).mock(return_value=httpx.Response(200, json=BALANCE_BODY))

        await client.get_balance(TOKEN_ID)
        await asyncio.sleep(1.1)
        await client.get_balance(TOKEN_ID)

        assert len(calls) == 2
        assert route.calls[-1].request.headers["Authorization"] == "Bearer jwt-two"

    @respx.mock
    async def test_retries_once_when_a_token_is_rejected_early(self):
        calls = []
        client = PrivanaClient(
            base_url=BASE_URL,
            token_provider=_provider(["stale", "fresh"], calls=calls),
        )
        responses = [
            httpx.Response(401, json={"detail": "token revoked"}),
            httpx.Response(200, json=BALANCE_BODY),
        ]
        route = respx.get(BALANCE_URL).mock(side_effect=responses)

        result = await client.get_balance(TOKEN_ID)

        assert result.balance == "1000"
        assert len(calls) == 2
        assert route.calls[0].request.headers["Authorization"] == "Bearer stale"
        assert route.calls[1].request.headers["Authorization"] == "Bearer fresh"

    @respx.mock
    async def test_gives_up_after_one_retry(self):
        client = PrivanaClient(base_url=BASE_URL, token_provider=_provider(["one", "two"]))
        route = respx.get(BALANCE_URL).mock(
            return_value=httpx.Response(401, json={"detail": "nope"})
        )

        with pytest.raises(AccountingApiError):
            await client.get_balance(TOKEN_ID)

        assert len(route.calls) == 2

    @respx.mock
    async def test_does_not_retry_a_non_auth_error(self):
        calls = []
        client = PrivanaClient(base_url=BASE_URL, token_provider=_provider(["one"], calls=calls))
        route = respx.get(BALANCE_URL).mock(
            return_value=httpx.Response(400, json={"detail": "pool paused"})
        )

        with pytest.raises(AccountingApiError):
            await client.get_balance(TOKEN_ID)

        assert len(route.calls) == 1
        assert len(calls) == 1

    @respx.mock
    async def test_concurrent_callers_authenticate_once(self):
        calls = []

        async def slow_provider():
            calls.append(1)
            await asyncio.sleep(0.01)
            return "jwt-one", 3600

        client = PrivanaClient(base_url=BASE_URL, token_provider=slow_provider)
        respx.get(BALANCE_URL).mock(return_value=httpx.Response(200, json=BALANCE_BODY))

        await asyncio.gather(*[client.get_balance(TOKEN_ID) for _ in range(5)])

        assert len(calls) == 1

    @respx.mock
    async def test_instances_hold_separate_tokens(self):
        admin = PrivanaClient(base_url=BASE_URL, token_provider=_provider(["admin"]))
        lp = PrivanaClient(base_url=BASE_URL, token_provider=_provider(["lp"]))
        route = respx.get(BALANCE_URL).mock(return_value=httpx.Response(200, json=BALANCE_BODY))

        await admin.get_balance(TOKEN_ID)
        await lp.get_balance(TOKEN_ID)

        assert route.calls[0].request.headers["Authorization"] == "Bearer admin"
        assert route.calls[1].request.headers["Authorization"] == "Bearer lp"

    @respx.mock
    async def test_without_a_provider_nothing_changes(self):
        client = PrivanaClient(base_url=BASE_URL)
        route = respx.get(BALANCE_URL).mock(return_value=httpx.Response(200, json=BALANCE_BODY))

        await client.get_balance(TOKEN_ID)

        assert "Authorization" not in route.calls[0].request.headers
