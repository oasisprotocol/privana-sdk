from __future__ import annotations

from typing import Any

from ..types import (
    normalize_address,
    normalize_hex,
)
from ..types.requests import (
    BatchBalancesRequest,
    DepositQuoteRequest,
    IncludeDepositRequest,
    LockFundsRequest,
    TransferFundsRequest,
    TransferLockedFundsRequest,
    UnlockAllExpiredRequest,
    UnlockFundsRequest,
    WithdrawalRequest,
)
from ..types.responses import (
    BalanceResponse,
    BatchBalancesResponse,
    DepositQuoteResponse,
    ExpiredLocksResponse,
    IncludeDepositResponse,
    LockedFundsResponse,
    LockInfo,
    PendingWithdrawal,
    PendingWithdrawalsResponse,
    TokenBalance,
    TokenInfoResponse,
    TotalLockedBalanceResponse,
    TransactionData,
    TransactionSubmissionResponse,
    WithdrawalInfoResponse,
)
from .http_client import HttpClient


def _parse_transaction_data(data: dict[str, Any]) -> TransactionData:
    return TransactionData(
        to=data["to"],
        value=data["value"],
        data=data["data"],
        chain_id=data["chain_id"],
    )


def _parse_deposit_quote(data: dict[str, Any]) -> DepositQuoteResponse:
    return DepositQuoteResponse(
        user_address=data["user_address"],
        token_id=data["token_id"],
        amount=data["amount"],
        deposit_address=data["deposit_address"],
        transaction=_parse_transaction_data(data["transaction"]),
        instructions=data["instructions"],
    )


def _parse_lock_info(data: dict[str, Any]) -> LockInfo:
    return LockInfo(
        lock_id=data["lock_id"],
        user_address=data["user_address"],
        service_address=data["service_address"],
        token_id=data["token_id"],
        amount=data["amount"],
        expiry=data["expiry"],
        is_expired=data["is_expired"],
    )


def _parse_token_balance(data: dict[str, Any]) -> TokenBalance:
    return TokenBalance(
        token_id=data["token_id"],
        balance=data["balance"],
        token_symbol=data["token_symbol"],
        chain_id=data["chain_id"],
    )


def _parse_pending_withdrawal(data: dict[str, Any]) -> PendingWithdrawal:
    return PendingWithdrawal(
        index=data["index"],
        user_address=data["user_address"],
        token_id=data["token_id"],
        amount=data["amount"],
        status=data["status"],
        created_at=data["created_at"],
    )


class FlexvaultsClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
    ) -> None:
        self._http = HttpClient(
            base_url=base_url,
            timeout=timeout,
            headers=headers,
        )

    async def get_deposit_quote(self, request: DepositQuoteRequest) -> DepositQuoteResponse:
        data = await self._http.post(
            "/v1/accounting/quote/deposit",
            {
                "user_address": normalize_address(request.user_address),
                "token_id": normalize_hex(request.token_id),
                "amount": request.amount,
            },
        )
        return _parse_deposit_quote(data)

    async def include_deposit(self, request: IncludeDepositRequest) -> IncludeDepositResponse:
        body: dict[str, Any] = {
            "user_address": normalize_address(request.user_address),
            "token_id": normalize_hex(request.token_id),
            "evm_transaction_data": normalize_hex(request.evm_transaction_data),
        }
        if request.rlp_block_header is not None:
            body["rlp_block_header"] = normalize_hex(request.rlp_block_header)
        if request.transaction_index_rlp is not None:
            body["transaction_index_rlp"] = normalize_hex(request.transaction_index_rlp)
        if request.transaction_proof_stack is not None:
            body["transaction_proof_stack"] = normalize_hex(request.transaction_proof_stack)

        data = await self._http.post("/v1/accounting/deposits", body)
        return IncludeDepositResponse(
            submission_id=data["submission_id"],
            status=data["status"],
        )

    async def get_balance(
        self,
        user_address: str,
        token_id: str,
    ) -> BalanceResponse:
        user = normalize_address(user_address)
        token = normalize_hex(token_id)
        data = await self._http.get(f"/v1/accounting/balances/{user}/{token}")
        return BalanceResponse(
            user_address=data["user_address"],
            token_id=data["token_id"],
            balance=data["balance"],
            token_symbol=data["token_symbol"],
            chain_id=data["chain_id"],
        )

    async def get_batch_balances(
        self, request: BatchBalancesRequest
    ) -> BatchBalancesResponse:
        data = await self._http.post(
            "/v1/accounting/balances/batch",
            {
                "user_address": normalize_address(request.user_address),
                "token_ids": [normalize_hex(tid) for tid in request.token_ids],
            },
        )
        return BatchBalancesResponse(
            user_address=data["user_address"],
            balances=[_parse_token_balance(b) for b in data.get("balances", [])],
        )

    async def get_token_info(self, token_id: str) -> TokenInfoResponse:
        token = normalize_hex(token_id)
        data = await self._http.get(f"/v1/accounting/tokens/{token}")
        return TokenInfoResponse(
            token_id=data["token_id"],
            symbol=data["symbol"],
            decimals=data["decimals"],
            chain_id=data["chain_id"],
            contract_address=data.get("contract_address"),
        )

    async def lock_funds(
        self, request: LockFundsRequest
    ) -> TransactionSubmissionResponse:
        data = await self._http.post(
            "/v1/accounting/funds/lock",
            {
                "user_address": normalize_address(request.user_address),
                "service_address": normalize_address(request.service_address),
                "token_id": normalize_hex(request.token_id),
                "amount": request.amount,
                "expiry": request.expiry,
                "signature": normalize_hex(request.signature),
            },
        )
        return TransactionSubmissionResponse(
            submission_id=data["submission_id"],
            status=data["status"],
            detail=data.get("detail"),
        )

    async def unlock_funds(
        self, request: UnlockFundsRequest
    ) -> TransactionSubmissionResponse:
        data = await self._http.post(
            "/v1/accounting/funds/unlock",
            {
                "user_address": normalize_address(request.user_address),
                "lock_id": request.lock_id,
            },
        )
        return TransactionSubmissionResponse(
            submission_id=data["submission_id"],
            status=data["status"],
            detail=data.get("detail"),
        )

    async def unlock_all_expired(
        self, request: UnlockAllExpiredRequest
    ) -> TransactionSubmissionResponse:
        data = await self._http.post(
            "/v1/accounting/funds/unlock-all-expired",
            {
                "user_address": normalize_address(request.user_address),
            },
        )
        return TransactionSubmissionResponse(
            submission_id=data["submission_id"],
            status=data["status"],
            detail=data.get("detail"),
        )

    async def get_locked_funds(
        self,
        user_address: str,
        service_address: str | None = None,
    ) -> LockedFundsResponse:
        user = normalize_address(user_address)
        query_params = ""
        if service_address:
            query_params = f"?service_address={normalize_address(service_address)}"
        data = await self._http.get(f"/v1/accounting/funds/locked/{user}{query_params}")
        return LockedFundsResponse(
            user_address=data["user_address"],
            service_address=data.get("service_address"),
            locks=[_parse_lock_info(lock) for lock in data.get("locks", [])],
            total_locked=data.get("total_locked", 0),
        )

    async def get_total_locked_balance(
        self,
        user_address: str,
        token_id: str,
    ) -> TotalLockedBalanceResponse:
        user = normalize_address(user_address)
        token = normalize_hex(token_id)
        data = await self._http.get(
            f"/v1/accounting/funds/locked/total/{user}/{token}"
        )
        return TotalLockedBalanceResponse(
            user_address=data["user_address"],
            token_id=data["token_id"],
            total_locked=data["total_locked"],
        )

    async def get_expired_locks(self, user_address: str) -> ExpiredLocksResponse:
        user = normalize_address(user_address)
        data = await self._http.get(f"/v1/accounting/funds/expired/{user}")
        return ExpiredLocksResponse(
            user_address=data["user_address"],
            expired_locks=[_parse_lock_info(lock) for lock in data.get("expired_locks", [])],
        )

    async def transfer_funds(
        self, request: TransferFundsRequest
    ) -> TransactionSubmissionResponse:
        data = await self._http.post(
            "/v1/accounting/funds/transfer",
            {
                "user_address": normalize_address(request.user_address),
                "to_address": normalize_address(request.to_address),
                "token_id": normalize_hex(request.token_id),
                "amount": request.amount,
                "signature": normalize_hex(request.signature),
            },
        )
        return TransactionSubmissionResponse(
            submission_id=data["submission_id"],
            status=data["status"],
            detail=data.get("detail"),
        )

    async def transfer_locked_funds(
        self, request: TransferLockedFundsRequest
    ) -> TransactionSubmissionResponse:
        data = await self._http.post(
            "/v1/accounting/funds/transfer-locked",
            {
                "user_address": normalize_address(request.user_address),
                "lock_id": request.lock_id,
                "to_address": normalize_address(request.to_address),
                "amount": request.amount,
                "signature": normalize_hex(request.signature),
            },
        )
        return TransactionSubmissionResponse(
            submission_id=data["submission_id"],
            status=data["status"],
            detail=data.get("detail"),
        )

    async def request_withdrawal(
        self, request: WithdrawalRequest
    ) -> TransactionSubmissionResponse:
        data = await self._http.post(
            "/v1/accounting/withdraw",
            {
                "user_address": normalize_address(request.user_address),
                "token_id": normalize_hex(request.token_id),
                "amount": request.amount,
                "nonce": request.nonce,
                "signature": normalize_hex(request.signature),
            },
        )
        return TransactionSubmissionResponse(
            submission_id=data["submission_id"],
            status=data["status"],
            detail=data.get("detail"),
        )

    async def get_pending_withdrawals(
        self, user_address: str
    ) -> PendingWithdrawalsResponse:
        user = normalize_address(user_address)
        data = await self._http.get(f"/v1/accounting/withdraw/pending/{user}")
        return PendingWithdrawalsResponse(
            user_address=data["user_address"],
            withdrawals=[
                _parse_pending_withdrawal(w) for w in data.get("withdrawals", [])
            ],
        )

    async def get_withdrawal_info(self, index: int) -> WithdrawalInfoResponse:
        data = await self._http.get(f"/v1/accounting/withdraw/{index}")
        return WithdrawalInfoResponse(
            index=data["index"],
            user_address=data["user_address"],
            token_id=data["token_id"],
            amount=data["amount"],
            status=data["status"],
            created_at=data["created_at"],
            completed_at=data.get("completed_at"),
            transaction_hash=data.get("transaction_hash"),
        )

    async def close(self) -> None:
        await self._http.close()

    async def __aenter__(self) -> FlexvaultsClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
