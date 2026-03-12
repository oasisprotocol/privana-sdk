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
                amount="100",
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
                    "submission_id": "sub-123",
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
        assert result.submission_id == "sub-123"
        assert result.status == "pending"


class TestLockFunds:
    @respx.mock
    async def test_lock_funds(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/funds/lock").mock(
            return_value=httpx.Response(
                200,
                json={
                    "submission_id": "sub-lock",
                    "status": "submitted",
                },
            )
        )

        result = await client.lock_funds(
            LockFundsRequest(
                user_address="0xuser",
                service_address="0xservice",
                token_id="0xtoken",
                amount="1000",
                expiry=9999999999,
                signature="0xsig",
            )
        )
        assert result.submission_id == "sub-lock"


class TestModifyLock:
    @respx.mock
    async def test_modify_lock(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/funds/modify-lock").mock(
            return_value=httpx.Response(
                200,
                json={
                    "submission_id": "sub-modify",
                    "status": "submitted",
                },
            )
        )

        result = await client.modify_lock(
            ModifyLockRequest(
                user_address="0xuser",
                lock_id=1,
                amount="500",
                new_expiry=9999999999,
                signature="0xsig",
            )
        )
        assert result.submission_id == "sub-modify"
        assert result.status == "submitted"


class TestUnlockFunds:
    @respx.mock
    async def test_unlock_funds(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/funds/unlock").mock(
            return_value=httpx.Response(
                200,
                json={
                    "submission_id": "sub-unlock",
                    "status": "submitted",
                },
            )
        )

        result = await client.unlock_funds(UnlockFundsRequest(user_address="0xuser", lock_id=0))
        assert result.submission_id == "sub-unlock"

    @respx.mock
    async def test_unlock_all_expired(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/funds/unlock-all-expired").mock(
            return_value=httpx.Response(
                200,
                json={
                    "submission_id": "sub-all",
                    "status": "submitted",
                },
            )
        )

        result = await client.unlock_all_expired(UnlockAllExpiredRequest(user_address="0xuser"))
        assert result.submission_id == "sub-all"


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
                    "total_locked": "0",
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
                    "submission_id": "sub-transfer",
                    "status": "submitted",
                },
            )
        )

        result = await client.transfer_funds(
            TransferFundsRequest(
                user_address="0xfrom",
                to_address="0xto",
                token_id="0xtoken",
                amount="100",
                nonce=1,
                signature="0xsig",
            )
        )
        assert result.submission_id == "sub-transfer"

    @respx.mock
    async def test_transfer_locked_funds(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/funds/transfer-locked").mock(
            return_value=httpx.Response(
                200,
                json={
                    "submission_id": "sub-tl",
                    "status": "submitted",
                },
            )
        )

        result = await client.transfer_locked_funds(
            TransferLockedFundsRequest(
                user_address="0xfrom",
                lock_id=0,
                to_address="0xto",
                amount="50",
                signature="0xsig",
            )
        )
        assert result.submission_id == "sub-tl"


class TestWithdrawal:
    @respx.mock
    async def test_request_withdrawal(self, client):
        respx.post(f"{BASE_URL}/v1/accounting/withdraw").mock(
            return_value=httpx.Response(
                200,
                json={
                    "submission_id": "sub-withdraw",
                    "status": "submitted",
                },
            )
        )

        result = await client.request_withdrawal(
            WithdrawalRequest(
                user_address="0xuser",
                token_id="0xtoken",
                amount="100",
                nonce=0,
                signature="0xsig",
            )
        )
        assert result.submission_id == "sub-withdraw"

    @respx.mock
    async def test_get_pending_withdrawals(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/withdraw/pending/0xuser").mock(
            return_value=httpx.Response(
                200,
                json={
                    "user_address": "0xuser",
                    "withdrawals": [
                        {
                            "index": 0,
                            "user_address": "0xuser",
                            "token_id": "0xtoken",
                            "amount": "100",
                            "status": "pending",
                            "created_at": "2024-01-01T00:00:00Z",
                        }
                    ],
                },
            )
        )

        result = await client.get_pending_withdrawals("0xuser")
        assert len(result.withdrawals) == 1
        assert result.withdrawals[0].amount == "100"

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
                    "status": "completed",
                    "created_at": "2024-01-01T00:00:00Z",
                    "completed_at": "2024-01-01T01:00:00Z",
                    "transaction_hash": "0xhash",
                },
            )
        )

        result = await client.get_withdrawal_info(0)
        assert result.status == "completed"
        assert result.transaction_hash == "0xhash"


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


class TestTokenInfo:
    @respx.mock
    async def test_get_token_info(self, client):
        respx.get(f"{BASE_URL}/v1/accounting/tokens/0xtoken").mock(
            return_value=httpx.Response(
                200,
                json={
                    "token_id": "0xtoken",
                    "symbol": "USDC",
                    "decimals": 6,
                    "chain_id": 84532,
                },
            )
        )

        result = await client.get_token_info("0xtoken")
        assert result.symbol == "USDC"
        assert result.decimals == 6


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
