import asyncio

import httpx
import pytest
import respx
from eth_account import Account

from flexvaults import FlexvaultsClient, build_siwe_message, ensure_siwe_token
from flexvaults.auth.siwe import SiweAuthCooldownError

BASE_URL = "https://api.test.example.com"


def test_build_siwe_message_is_stable_shape():
    msg = build_siwe_message(
        domain="example.com",
        address="0x0000000000000000000000000000000000000001",
        chain_id=23295,
        statement="Sign in to Flexvaults",
        uri="https://example.com",
        nonce="abc12345",
        issued_at="2020-01-01T00:00:00Z",
    )
    assert "example.com wants you to sign in with your Ethereum account:" in msg
    assert "URI: https://example.com" in msg
    assert "Chain ID: 23295" in msg
    assert "Nonce: abc12345" in msg
    assert "Issued At: 2020-01-01T00:00:00Z" in msg


@pytest.mark.asyncio
@respx.mock
async def test_ensure_siwe_token_dedupes_inflight():
    account = Account.create()
    client = FlexvaultsClient(base_url=BASE_URL)

    respx.get(f"{BASE_URL}/v1/accounting/auth/domain").mock(
        return_value=httpx.Response(200, json={"domain": "example.com"})
    )
    login_route = respx.post(f"{BASE_URL}/v1/accounting/auth/login").mock(
        return_value=httpx.Response(200, json={"token": "0xabc"})
    )

    async def run():
        return await ensure_siwe_token(
            client=client,
            chain_id=23295,
            address=account.address,
            signer=account,
            cache_scope=BASE_URL,
            statement="Sign in to Flexvaults",
            token_ttl_ms=10_000,
        )

    t1, t2 = await asyncio.gather(run(), run())
    assert t1 == "0xabc"
    assert t2 == "0xabc"
    assert login_route.call_count == 1

    await client.close()


@pytest.mark.asyncio
@respx.mock
async def test_ensure_siwe_token_applies_cooldown_after_failure():
    account = Account.create()
    client = FlexvaultsClient(base_url=BASE_URL)

    domain_route = respx.get(f"{BASE_URL}/v1/accounting/auth/domain").mock(
        return_value=httpx.Response(200, json={"domain": "example.com"})
    )

    signer_calls = 0

    async def rejecting_signer(message: str) -> str:
        nonlocal signer_calls
        signer_calls += 1
        raise RuntimeError("user rejected signature")

    with pytest.raises(RuntimeError, match="user rejected signature"):
        await ensure_siwe_token(
            client=client,
            chain_id=23295,
            address=account.address,
            signer=rejecting_signer,
            cache_scope=BASE_URL,
            statement="Sign in to Flexvaults",
            token_ttl_ms=10_000,
        )

    assert signer_calls == 1
    assert domain_route.call_count == 1

    with pytest.raises(SiweAuthCooldownError):
        await ensure_siwe_token(
            client=client,
            chain_id=23295,
            address=account.address,
            signer=rejecting_signer,
            cache_scope=BASE_URL,
            statement="Sign in to Flexvaults",
            token_ttl_ms=10_000,
        )

    assert signer_calls == 1
    assert domain_route.call_count == 1

    await client.close()
