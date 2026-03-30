import httpx
import pytest
import respx

from flexvaults.client import AccountingApiError, FlexvaultsClient, NetworkError
from flexvaults.types.requests import (
    BatchBalancesRequest,
    DepositQuoteRequest,
    IncludeDepositRequest,
    LockFundsRequest,
    ModifyLockRequest,
    TransferFundsRequest,
    TransferLockedFundsRequest,
    UnlockAllExpiredRequest,
    UnlockFundsRequest,
    WithdrawalRequest,
)

BASE_URL = "https://api.test.example.com"


@pytest.fixture
def client():
    return FlexvaultsClient(base_url=BASE_URL)


class TestGetBalance:
    @respx.mock
    async def test_get_balance(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/balances/0xuser123/0xtoken456").mock(
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

        result = await client.get_balance("0xuser123", "0xtoken456")
        assert result.balance == "1000000"
        assert result.token_symbol == "USDC"
        assert result.chain_id == "84532"

    @respx.mock
    async def test_get_balance_normalizes_inputs(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/balances/0xuser123/0xtoken456").mock(
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

        result = await client.get_balance("0xUSER123", "0xTOKEN456")
        assert result.balance == "0"


class TestGetDepositQuote:
    @respx.mock
    async def test_get_deposit_quote(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/quote/deposit").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "token_id": "0xtoken",
                    "amount": "100",
                    "deposit_address": "0xdeposit",
                    "transaction": {
                        "to": "0xto",
                        "value": "100",
                        "data": "0xdata",
                        "chain_id": 84532,
                    },
                    "instructions": "Send tokens",
                },
            )
        )

        result = await client.get_deposit_quote(
            DepositQuoteRequest(
                user_address="0xuser",
                token_id="0xtoken",
                amount=100,
            )
        )
        assert result.amount == "100"
        assert result.deposit_address == "0xdeposit"
        assert result.transaction.chain_id == 84532


class TestIncludeDeposit:
    @respx.mock
    async def test_include_deposit(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/deposits").mock(
            return_value=httpx.Response(
                200,
                json={
                    "status": "pending",
                },
            )
        )

        result = await client.include_deposit(
            IncludeDepositRequest(
                user_address="0xuser",
                token_id="0xtoken",
                evm_transaction_data="0xdata",
            )
        )
        assert result.status == "pending"


class TestLockFunds:
    @respx.mock
    async def test_lock_funds(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/funds/lock").mock(
            return_value=httpx.Response(
                200,
                json={
                    "status": "submitted",
                },
            )
        )

        result = await client.lock_funds(
            LockFundsRequest(
                user_address="0xuser",
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
        respx.post(f"{BASE_URL}/v1/accounting/funds/modify-lock").mock(
            return_value=httpx.Response(
                200,
                json={
                    "status": "submitted",
                },
            )
        )

        result = await client.modify_lock(
            ModifyLockRequest(
                user_address="0xuser",
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
                    "status": "submitted",
                },
            )
        )

        result = await client.unlock_all_expired(UnlockAllExpiredRequest(user_address="0xuser"))
        assert result.status == "submitted"


class TestLockedFunds:
    @respx.mock
    async def test_get_locked_funds(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/funds/locked/0xuser").mock(
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

        result = await client.get_locked_funds("0xuser")
        assert len(result.locks) == 1
        assert result.locks[0].amount == "500"
        assert result.total_locked == "500"

    @respx.mock
    async def test_get_locked_funds_with_service(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/funds/locked/0xuser?service_address=0xservice").mock(
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

        result = await client.get_locked_funds("0xuser", "0xservice")
        assert result.service_address == "0xservice"


class TestTransfer:
    @respx.mock
    async def test_transfer_funds(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/funds/transfer").mock(
            return_value=httpx.Response(
                200,
                json={
                    "status": "submitted",
                },
            )
        )

        result = await client.transfer_funds(
            TransferFundsRequest(
                user_address="0xfrom",
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
        respx.post(f"{BASE_URL}/v1/accounting/withdraw").mock(
            return_value=httpx.Response(
                200,
                json={
                    "status": "submitted",
                },
            )
        )

        result = await client.request_withdrawal(
            WithdrawalRequest(
                user_address="0xuser",
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
        respx.post(f"{BASE_URL}/v1/accounting/balances/batch").mock(
            return_value=httpx.Response(
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
        )

        result = await client.get_batch_balances(
            BatchBalancesRequest(
                user_address="0xuser",
                token_ids=["0xtoken1"],
            )
        )
        assert len(result.balances) == 1
        assert result.balances[0].token_symbol == "USDC"

    async def test_get_batch_balances_enforces_max(self, client):
        with pytest.raises(ValueError, match="at most 100 token IDs"):
            await client.get_batch_balances(
                BatchBalancesRequest(
                    user_address="0xuser",
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


class TestExpiredLocks:
    @respx.mock
    async def test_get_expired_locks(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/funds/expired/0xuser").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "expired_locks": [],
                },
            )
        )

        result = await client.get_expired_locks("0xuser")
        assert result.expired_locks == []


class TestTotalLockedBalance:
    @respx.mock
    async def test_get_total_locked_balance(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/funds/locked/total/0xuser/0xtoken").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "token_id": "0xtoken",
                    "total_locked": "500",
                },
            )
        )

        result = await client.get_total_locked_balance("0xuser", "0xtoken")
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
        respx.get(f"{BASE_URL}/v1/accounting/balances/0xuser/0xtoken").mock(
            return_value=httpx.Response(
                404,
                json={"detail": "Not found"},
            )
        )

        with pytest.raises(AccountingApiError) as exc_info:
            await client.get_balance("0xuser", "0xtoken")
        assert exc_info.value.status_code == 404
        assert exc_info.value.detail == "Not found"

    @respx.mock
    async def test_network_timeout(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/balances/0xuser/0xtoken").mock(
            side_effect=httpx.ReadTimeout("timeout")
        )

        with pytest.raises(NetworkError):
            await client.get_balance("0xuser", "0xtoken")


class TestAuthHelpers:
    @respx.mock
    async def test_get_siwe_domain(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/auth/domain").mock(
            return_value=httpx.Response(200, json={"domain": "flexvaults.example.com"})
        )

        result = await client.get_siwe_domain()
        assert result.domain == "flexvaults.example.com"

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
