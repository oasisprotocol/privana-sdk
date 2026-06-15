import json

import httpx
import pytest
import respx

from privana.client import AccountingApiError, NetworkError, PrivanaClient
from privana.types.requests import (
    BatchBalancesRequest,
    DepositCheckRequest,
    HostedAuthAuthorizeUrlRequest,
    HostedAuthTokenExchangeRequest,
    JwtLogoutRequest,
    JwtRefreshRequest,
    LockFundsRequest,
    ModifyLockRequest,
    TransferFundsRequest,
    TransferLockedFundsRequest,
    UnlockAllExpiredRequest,
    UnlockFundsRequest,
    WithdrawalRequest,
    WithdrawFromLockRequest,
)

BASE_URL = "https://api.test.example.com"
HISTORY_TOKEN_ID = "0x1111111111111111111111111111111111111111111111111111111111111111"
HISTORY_DEPOSIT_ID = "0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
HISTORY_RECIPIENT = "0x0000000000000000000000000000000000000003"
HISTORY_SENDER = "0x0000000000000000000000000000000000000001"
HISTORY_SERVICE = "0x0000000000000000000000000000000000000002"


@pytest.fixture
def client():
    return PrivanaClient(base_url=BASE_URL)


class TestGetBalance:
    @respx.mock
    async def test_get_balance(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/balances/0xtoken456").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser123",
                    "token_id": "0xtoken456",
                    "balance": "1000000",
                    "token_symbol": "USDC",
                    "chain_id": "84532",
                },
            )
        )

        result = await client.get_balance("0xtoken456")
        assert result.balance == "1000000"
        assert result.token_symbol == "USDC"
        assert result.chain_id == "84532"

    @respx.mock
    async def test_get_balance_normalizes_inputs(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/balances/0xtoken456").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser123",
                    "token_id": "0xtoken456",
                    "balance": "0",
                    "token_symbol": "USDC",
                    "chain_id": "84532",
                },
            )
        )

        result = await client.get_balance("0xTOKEN456")
        assert result.balance == "0"


class TestGetHistory:
    @respx.mock
    async def test_get_history_defaults(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/history?offset=-1&limit=50").mock(
            return_value=httpx.Response(
                200,
                json={
                    "history": [
                        {
                            "kind": "deposit",
                            "timestamp": 1710000000,
                            "token_id": HISTORY_TOKEN_ID,
                            "amount": "1000",
                            "counterparty": None,
                            "deposit_id": HISTORY_DEPOSIT_ID,
                            "chain_id": 84532,
                        },
                        {
                            "kind": "transferBalanceOut",
                            "timestamp": 1710000001,
                            "token_id": HISTORY_TOKEN_ID,
                            "amount": "250",
                            "counterparty": HISTORY_RECIPIENT,
                            "deposit_id": None,
                            "chain_id": 84532,
                        },
                        {
                            "kind": "transferBalanceIn",
                            "timestamp": 1710000002,
                            "token_id": HISTORY_TOKEN_ID,
                            "amount": "250",
                            "counterparty": HISTORY_SENDER,
                            "deposit_id": None,
                            "chain_id": 84532,
                        },
                        {
                            "kind": "modifyLock",
                            "timestamp": 1710000003,
                            "token_id": HISTORY_TOKEN_ID,
                            "amount": "0",
                            "counterparty": HISTORY_SERVICE,
                            "deposit_id": None,
                            "chain_id": None,
                        },
                        {
                            "kind": "unlockLock",
                            "timestamp": 1710000004,
                            "token_id": HISTORY_TOKEN_ID,
                            "amount": "500",
                            "counterparty": HISTORY_SERVICE,
                            "deposit_id": None,
                            "chain_id": None,
                        },
                        {
                            "kind": "unknown",
                            "timestamp": 1710000005,
                            "token_id": None,
                            "amount": None,
                            "counterparty": None,
                            "deposit_id": None,
                            "chain_id": None,
                        },
                    ],
                    "total": 6,
                },
            )
        )

        result = await client.get_history()
        assert result.total == 6
        assert [entry.kind for entry in result.history] == [
            "deposit",
            "transferBalanceOut",
            "transferBalanceIn",
            "modifyLock",
            "unlockLock",
            "unknown",
        ]
        assert result.history[0].token_id == HISTORY_TOKEN_ID
        assert result.history[0].deposit_id == HISTORY_DEPOSIT_ID
        assert result.history[0].chain_id == 84532
        assert result.history[1].counterparty == HISTORY_RECIPIENT
        assert result.history[2].counterparty == HISTORY_SENDER
        assert result.history[3].counterparty == HISTORY_SERVICE
        assert result.history[5].token_id is None

    @respx.mock
    async def test_get_history_uses_page_parameters_only(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.params["offset"] == "2"
            assert request.url.params["limit"] == "0"
            assert "user_address" not in request.url.params
            return httpx.Response(200, json={"history": [], "total": 0})

        respx.get(f"{BASE_URL}/v1/accounting/history?offset=2&limit=0").mock(side_effect=handler)

        result = await client.get_history(offset=2, limit=0)
        assert result.history == []
        assert result.total == 0

    async def test_get_history_rejects_invalid_limit(self, client):
        with pytest.raises(ValueError, match="between 0 and 100"):
            await client.get_history(limit=101)

    async def test_get_history_rejects_non_integer_pagination(self, client):
        with pytest.raises(TypeError, match="offset"):
            await client.get_history(offset="2&user_address=0xabc")  # type: ignore[arg-type]

        with pytest.raises(TypeError, match="limit"):
            await client.get_history(limit=1.5)  # type: ignore[arg-type]


class TestGetDepositAddress:
    @respx.mock
    async def test_get_deposit_address(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/deposits/address").mock(
            return_value=httpx.Response(
                200,
                json={
                    "deposit_address": "0xdeposit",
                    "chain_type": "evm",
                    "version": 0,
                    "min_deposit": {"84532": {"native": "1000000000000000", "erc20": "1000000"}},
                },
            )
        )

        result = await client.get_deposit_address()
        assert result.deposit_address == "0xdeposit"
        assert result.chain_type == "evm"
        assert result.version == 0
        assert "84532" in result.min_deposit


DEPOSIT_ID_HEX = "0x" + "ab" * 32


class TestCheckDeposit:
    @respx.mock
    async def test_check_deposit(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {
                "chain_type": "evm",
                "chain_id": 84532,
                "tx_hash": "0xabc123",
                "amount": "1000000",
                "log_index": 0,
                "version": 0,
            }
            return httpx.Response(
                200,
                json={
                    "status": "credited",
                    "deposit_id": DEPOSIT_ID_HEX,
                    "amount": "1000000",
                    "token_address": "0xtoken",
                },
            )

        respx.post(f"{BASE_URL}/v1/accounting/deposits/check").mock(side_effect=handler)

        result = await client.check_deposit(
            DepositCheckRequest(
                chain_id=84532,
                tx_hash="0xabc123",
                amount=1000000,
            )
        )
        assert result.status == "credited"
        assert result.deposit_id == DEPOSIT_ID_HEX


class TestGetDepositStatus:
    @respx.mock
    async def test_get_deposit_status(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/deposits/status/{DEPOSIT_ID_HEX}").mock(
            return_value=httpx.Response(
                200,
                json={
                    "status": "credited",
                    "deposit_id": DEPOSIT_ID_HEX,
                    "amount": "1000000",
                    "token_address": "0xtoken",
                    "detail": "Deposit has been credited",
                },
            )
        )

        result = await client.get_deposit_status(DEPOSIT_ID_HEX)
        assert result.status == "credited"
        assert result.deposit_id == DEPOSIT_ID_HEX
        assert result.amount == "1000000"
        assert result.detail == "Deposit has been credited"


class TestLockFunds:
    @respx.mock
    async def test_lock_funds(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {
                "service_address": "0xservice",
                "token_id": "0xtoken",
                "amount": "1000",
                "expiry": "9999999999",
                "nonce": "0",
                "signature": "0xsig",
            }
            assert "user_address" not in body
            return httpx.Response(200, json={"submission_id": "sub-1", "status": "submitted"})

        respx.post(f"{BASE_URL}/v1/accounting/funds/lock").mock(side_effect=handler)

        result = await client.lock_funds(
            LockFundsRequest(
                service_address="0xservice",
                token_id="0xtoken",
                amount=1000,
                expiry=9999999999,
                nonce=0,
                signature="0xsig",
            )
        )
        assert result.status == "submitted"


class TestModifyLock:
    @respx.mock
    async def test_modify_lock(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {
                "lock_id": 1,
                "amount": "500",
                "new_expiry": "9999999999",
                "nonce": "1",
                "signature": "0xsig",
            }
            assert "user_address" not in body
            return httpx.Response(200, json={"submission_id": "sub-1", "status": "submitted"})

        respx.post(f"{BASE_URL}/v1/accounting/funds/modify-lock").mock(side_effect=handler)

        result = await client.modify_lock(
            ModifyLockRequest(
                lock_id=1,
                amount=500,
                new_expiry=9999999999,
                nonce=1,
                signature="0xsig",
            )
        )
        assert result.status == "submitted"


class TestUnlockFunds:
    @respx.mock
    async def test_unlock_funds(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/funds/unlock").mock(
            return_value=httpx.Response(
                200,
                json={
                    "submission_id": "sub-1",
                    "status": "submitted",
                },
            )
        )

        result = await client.unlock_funds(UnlockFundsRequest(user_address="0xuser", lock_id=0))
        assert result.status == "submitted"

    @respx.mock
    async def test_unlock_all_expired(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/funds/unlock-all-expired").mock(
            return_value=httpx.Response(
                200,
                json={
                    "submission_id": "sub-1",
                    "status": "submitted",
                },
            )
        )

        result = await client.unlock_all_expired(UnlockAllExpiredRequest(user_address="0xuser"))
        assert result.status == "submitted"


class TestLockedFunds:
    @respx.mock
    async def test_get_locked_funds(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/funds/locked").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "locks": [
                        {
                            "lock_id": 0,
                            "user_address": "0xuser",
                            "service_address": "0xservice",
                            "token_id": "0xtoken",
                            "amount": "500",
                            "expiry": 9999999999,
                            "is_expired": False,
                        }
                    ],
                    "total_locked": "500",
                },
            )
        )

        result = await client.get_locked_funds()
        assert len(result.locks) == 1
        assert result.locks[0].amount == "500"
        assert result.total_locked == "500"

    @respx.mock
    async def test_get_locked_funds_with_service(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/funds/locked?service_address=0xservice").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "service_address": "0xservice",
                    "locks": [],
                    "total_locked": 0,
                },
            )
        )

        result = await client.get_locked_funds("0xservice")
        assert result.service_address == "0xservice"


class TestTransfer:
    @respx.mock
    async def test_transfer_funds(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {
                "to_address": "0xto",
                "token_id": "0xtoken",
                "amount": "100",
                "nonce": "1",
                "signature": "0xsig",
            }
            assert "user_address" not in body
            return httpx.Response(200, json={"submission_id": "sub-1", "status": "submitted"})

        respx.post(f"{BASE_URL}/v1/accounting/funds/transfer").mock(side_effect=handler)

        result = await client.transfer_funds(
            TransferFundsRequest(
                to_address="0xto",
                token_id="0xtoken",
                amount=100,
                nonce=1,
                signature="0xsig",
            )
        )
        assert result.status == "submitted"

    @respx.mock
    async def test_transfer_locked_funds(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/funds/transfer-locked").mock(
            return_value=httpx.Response(
                200,
                json={
                    "submission_id": "sub-1",
                    "status": "submitted",
                },
            )
        )

        result = await client.transfer_locked_funds(
            TransferLockedFundsRequest(
                user_address="0xfrom",
                lock_id=0,
                to_address="0xto",
                amount=50,
                service_address="0xservice",
                nonce=2,
                signature="0xsig",
            )
        )
        assert result.status == "submitted"


class TestWithdrawal:
    @respx.mock
    async def test_request_withdrawal(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {
                "token_id": "0xtoken",
                "amount": "100",
                "nonce": "0",
                "signature": "0xsig",
            }
            assert "user_address" not in body
            return httpx.Response(200, json={"submission_id": "sub-1", "status": "submitted"})

        respx.post(f"{BASE_URL}/v1/accounting/withdraw").mock(side_effect=handler)

        result = await client.request_withdrawal(
            WithdrawalRequest(
                token_id="0xtoken",
                amount=100,
                nonce=0,
                signature="0xsig",
            )
        )
        assert result.status == "submitted"

    @respx.mock
    async def test_get_pending_withdrawals(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/withdraw/pending/0xuser").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "pending_withdrawals": [
                        {
                            "index": 0,
                            "user_address": "0xuser",
                            "to_address": "0xrecipient",
                            "token_id": "0xtoken",
                            "amount": "100",
                            "block_number": 123,
                            "resolved": False,
                            "tx_identifier": "0x01",
                        }
                    ],
                },
            )
        )

        result = await client.get_pending_withdrawals("0xuser")
        assert len(result.pending_withdrawals) == 1
        assert result.pending_withdrawals[0].amount == "100"
        assert result.pending_withdrawals[0].resolved is False

    @respx.mock
    async def test_get_withdrawal_info(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/withdraw/0").mock(
            return_value=httpx.Response(
                200,
                json={
                    "index": 0,
                    "user_address": "0xuser",
                    "to_address": "0xrecipient",
                    "token_id": "0xtoken",
                    "amount": "100",
                    "block_number": 123,
                    "resolved": True,
                    "tx_identifier": "0xhash",
                },
            )
        )

        result = await client.get_withdrawal_info(0)
        assert result.resolved is True
        assert result.tx_identifier == "0xhash"


class TestBatchBalances:
    @respx.mock
    async def test_get_batch_balances(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {"token_ids": ["0xtoken1"]}
            assert "user_address" not in body
            return httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "balances": [
                        {
                            "token_id": "0xtoken1",
                            "balance": "100",
                            "token_symbol": "USDC",
                            "chain_id": "84532",
                        },
                    ],
                },
            )

        respx.post(f"{BASE_URL}/v1/accounting/balances/batch").mock(side_effect=handler)

        result = await client.get_batch_balances(BatchBalancesRequest(token_ids=["0xtoken1"]))
        assert len(result.balances) == 1
        assert result.balances[0].token_symbol == "USDC"

    async def test_get_batch_balances_enforces_max(self, client):
        with pytest.raises(ValueError, match="at most 100 token IDs"):
            await client.get_batch_balances(
                BatchBalancesRequest(
                    token_ids=["0xtoken"] * 101,
                )
            )


class TestTokenInfo:
    @respx.mock
    async def test_get_token_info(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/tokens/0xtoken").mock(
            return_value=httpx.Response(
                200,
                json={
                    "token_id": "0xtoken",
                    "token_type": 0,
                    "token_type_name": "erc20",
                    "data": "USDC",
                    "chain_id": 84532,
                    "chain_name": "base-sepolia",
                    "token_address": "0xtokenaddress",
                },
            )
        )

        result = await client.get_token_info("0xtoken")
        assert result.token_type == 0
        assert result.token_type_name == "erc20"
        assert result.data == "USDC"
        assert result.chain_name == "base-sepolia"
        assert result.token_address == "0xtokenaddress"


class TestListTokens:
    @respx.mock
    async def test_list_tokens(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/tokens").mock(
            return_value=httpx.Response(
                200,
                json={
                    "tokens": [
                        {
                            "token_id": "0xtoken1",
                            "token_type": 1,
                            "token_type_name": "erc20",
                            "data": "USDC",
                            "chain_id": 84532,
                            "chain_name": "base-sepolia",
                            "token_address": "0xaddr",
                            "symbol": "USDC",
                            "name": "USD Coin",
                            "decimals": 6,
                        }
                    ]
                },
            )
        )

        result = await client.list_tokens()
        assert len(result.tokens) == 1
        assert result.tokens[0].symbol == "USDC"


class TestExpiredLocks:
    @respx.mock
    async def test_get_expired_locks(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/funds/expired").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "expired_locks": [],
                },
            )
        )

        result = await client.get_expired_locks()
        assert result.expired_locks == []


class TestTotalLockedBalance:
    @respx.mock
    async def test_get_total_locked_balance(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/funds/locked/total/0xtoken").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "token_id": "0xtoken",
                    "total_locked": "500",
                },
            )
        )

        result = await client.get_total_locked_balance("0xtoken")
        assert result.total_locked == "500"


class TestNonces:
    @respx.mock
    async def test_get_modify_lock_nonce(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/funds/modify-lock/nonce/0xuser").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "nonce": 7,
                },
            )
        )

        result = await client.get_modify_lock_nonce("0xuser")
        assert result.user_address == "0xuser"
        assert result.nonce == 7


class TestErrorHandling:
    @respx.mock
    async def test_api_error(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/balances/0xtoken").mock(
            return_value=httpx.Response(
                404,
                json={"detail": "Not found"},
            )
        )

        with pytest.raises(AccountingApiError) as exc_info:
            await client.get_balance("0xtoken")
        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Not found"

    @respx.mock
    async def test_network_timeout(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/balances/0xtoken").mock(
            side_effect=httpx.ReadTimeout("timeout")
        )

        with pytest.raises(NetworkError):
            await client.get_balance("0xtoken")


class TestAuthHelpers:
    @respx.mock
    async def test_get_siwe_domain(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/auth/domain").mock(
            return_value=httpx.Response(200, json={"domain": "privana.example.com"}),
        )

        result = await client.get_siwe_domain()
        assert result.domain == "privana.example.com"

    @respx.mock
    async def test_get_siwe_nonce(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/auth/nonce?address=0xuser").mock(
            return_value=httpx.Response(
                200,
                json={
                    "address": "0xuser",
                    "nonce": "nonce-123",
                    "expires_in": 300,
                },
            )
        )

        result = await client.get_siwe_nonce("0xuser")
        assert result.nonce == "nonce-123"
        assert result.expires_in == 300

    @respx.mock
    async def test_authenticate_private_reads_sets_header(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/auth/login").mock(
            return_value=httpx.Response(
                200,
                json={
                    "siwe_token": "0xabc123",
                    "jwt_access_token": "jwt-access",
                    "jwt_refresh_token": "jwt-refresh",
                    "address": "0xuser",
                    "jwt_expires_in": 900,
                    "jwt_refresh_expires_in": 86400,
                },
            )
        )

        result = await client.authenticate_private_reads("message", "0xsig")
        assert result.siwe_token == "0xabc123"
        assert client.get_private_read_token() == "0xabc123"

    async def test_setting_private_read_token_clears_bearer_auth(self, client):
        client.set_bearer_token("jwt-token")
        client.set_private_read_token("0xsiwe")

        assert client.get_private_read_token() == "0xsiwe"
        assert client._http.get_header("Authorization") is None

    async def test_setting_bearer_token_clears_private_read_auth(self, client):
        client.set_private_read_token("0xsiwe")
        client.set_bearer_token("jwt-token")

        assert client.get_private_read_token() is None
        assert client._http.get_header("Authorization") == "Bearer jwt-token"


class TestWithdrawFromLock:
    @respx.mock
    async def test_withdraw_from_lock(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {
                "to_address": "0xrecipient",
                "lock_id": 1,
                "amount": "250",
                "nonce": "3",
                "signature": "0xsig",
            }
            assert "user_address" not in body
            return httpx.Response(
                200,
                json={
                    "submission_id": "sub-1",
                    "status": "submitted",
                    "detail": "chain_id=1; token_address=0xtoken",
                },
            )

        respx.post(f"{BASE_URL}/v1/accounting/funds/withdraw-from-lock").mock(side_effect=handler)

        result = await client.withdraw_from_lock(
            WithdrawFromLockRequest(
                to_address="0xrecipient",
                lock_id=1,
                amount=250,
                nonce=3,
                signature="0xsig",
            )
        )
        assert result.status == "submitted"


class TestHostedAuth:
    def test_get_hosted_auth_authorize_url(self, client):
        url = client.get_hosted_auth_authorize_url(
            HostedAuthAuthorizeUrlRequest(
                client_id="app-1",
                redirect_uri="https://app.example.com/cb",
                code_challenge="challenge-abc",
                state="state-xyz",
                chain_id=23295,
            )
        )
        assert url.startswith(f"{BASE_URL}/v1/accounting/auth/authorize?")
        assert "client_id=app-1" in url
        assert "redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb" in url
        assert "code_challenge=challenge-abc" in url
        assert "state=state-xyz" in url
        assert "chain_id=23295" in url
        assert "response_mode=redirect" in url
        assert "code_challenge_method=S256" in url

    @respx.mock
    async def test_exchange_hosted_auth_code(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {
                "grant_type": "authorization_code",
                "code": "auth-code",
                "code_verifier": "verifier-123",
                "client_id": "app-1",
                "redirect_uri": "https://app.example.com/cb",
            }
            return httpx.Response(
                200,
                json={
                    "access_token": "access-jwt",
                    "id_token": "id-jwt",
                    "refresh_token": "refresh-jwt",
                    "token_type": "Bearer",
                    "expires_in": 900,
                    "refresh_expires_in": 86400,
                    "address": "0xuser",
                },
            )

        respx.post(f"{BASE_URL}/v1/accounting/auth/token").mock(side_effect=handler)

        result = await client.exchange_hosted_auth_code(
            HostedAuthTokenExchangeRequest(
                code="auth-code",
                code_verifier="verifier-123",
                client_id="app-1",
                redirect_uri="https://app.example.com/cb",
            )
        )
        assert result.access_token == "access-jwt"
        assert result.refresh_token == "refresh-jwt"
        assert result.address == "0xuser"


class TestJwtSession:
    @respx.mock
    async def test_refresh_jwt_session(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/auth/jwt/refresh").mock(
            return_value=httpx.Response(
                200,
                json={
                    "token": "new-access",
                    "refresh_token": "new-refresh",
                    "expires_in": 900,
                    "refresh_expires_in": 86400,
                },
            )
        )

        result = await client.refresh_jwt_session(JwtRefreshRequest(refresh_token="old-refresh"))
        assert result.token == "new-access"
        assert result.refresh_token == "new-refresh"

    @respx.mock
    async def test_logout_jwt_session_revoke_all(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {"revoke_all": True}
            return httpx.Response(200, json={"message": "Logged out", "revoked_tokens": 3})

        respx.post(f"{BASE_URL}/v1/accounting/auth/jwt/logout").mock(side_effect=handler)

        result = await client.logout_jwt_session(JwtLogoutRequest(revoke_all=True))
        assert result.revoked_tokens == 3

    @respx.mock
    async def test_logout_jwt_session_default(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {}
            return httpx.Response(200, json={"message": "Logged out", "revoked_tokens": 0})

        respx.post(f"{BASE_URL}/v1/accounting/auth/jwt/logout").mock(side_effect=handler)

        result = await client.logout_jwt_session()
        assert result.revoked_tokens == 0

    @respx.mock
    async def test_logout_jwt_session_single_token(self, client):
        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content.decode())
            assert body == {"refresh_token": "refresh-abc"}
            return httpx.Response(200, json={"message": "Logged out", "revoked_tokens": 1})

        respx.post(f"{BASE_URL}/v1/accounting/auth/jwt/logout").mock(side_effect=handler)

        result = await client.logout_jwt_session(JwtLogoutRequest(refresh_token="refresh-abc"))
        assert result.revoked_tokens == 1
