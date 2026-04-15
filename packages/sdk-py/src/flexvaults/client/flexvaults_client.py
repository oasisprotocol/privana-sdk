from __future__ import annotations

from collections.abc import Sequence
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
    ModifyLockRequest,
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
    LockNonceResponse,
    ModifyLockNonceResponse,
    PendingWithdrawal,
    PendingWithdrawalsResponse,
    SiweDomainResponse,
    SiweLoginResponse,
    SiweNonceResponse,
    TokenBalance,
    TokenInfoResponse,
    TotalLockedBalanceResponse,
    TransactionData,
    TransactionSubmissionResponse,
    TransferLockedNonceResponse,
    TransferNonceResponse,
    WithdrawalInfoResponse,
    WithdrawalNonceResponse,
)
from ..types.tokens import (
    SUPPORTED_TOKENS,
    TokenConfig,
    get_token_by_id,
)
from .http_client import HttpClient

PRIVATE_READ_TOKEN_HEADER = "X-SIWE-Token"
MAX_BATCH_BALANCE_TOKEN_IDS = 100


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
        block_number=data.get("block_number", 0),
        resolved=data.get("resolved", False),
        tx_identifier=data.get("tx_identifier", ""),
    )


class FlexvaultsClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = 30.0,
        headers: dict[str, str] | None = None,
        tokens: Sequence[str] | None = None,
    ) -> None:
        self._http = HttpClient(
            base_url=base_url,
            timeout=timeout,
            headers=headers,
        )
        if tokens:
            self._enabled_tokens = [
                t for token_id in tokens if (t := get_token_by_id(token_id)) is not None
            ]
            self._enabled_token_ids: set[str] | None = {t.id.lower() for t in self._enabled_tokens}
        else:
            self._enabled_tokens = list(SUPPORTED_TOKENS.values())
            self._enabled_token_ids = None

    @property
    def enabled_tokens(self) -> list[TokenConfig]:
        return list(self._enabled_tokens)

    def _check_token(self, token_id: str) -> None:
        if self._enabled_token_ids is None:
            return
        from .errors import ValidationError

        if normalize_hex(token_id).lower() not in self._enabled_token_ids:
            raise ValidationError(f"Token {token_id} is not enabled on this client")

    async def get_deposit_quote(self, request: DepositQuoteRequest) -> DepositQuoteResponse:
        self._check_token(request.token_id)
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
        self._check_token(request.token_id)
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
            status=data["status"],
        )

    async def get_balance(self, token_id: str) -> BalanceResponse:
        self._check_token(token_id)
        token = normalize_hex(token_id)
        data = await self._http.get(f"/v1/accounting/balances/{token}")
        return BalanceResponse(
            user_address=data["user_address"],
            token_id=data["token_id"],
            balance=data["balance"],
            token_symbol=data["token_symbol"],
            chain_id=data["chain_id"],
        )

    async def get_batch_balances(self, request: BatchBalancesRequest) -> BatchBalancesResponse:
        if len(request.token_ids) > MAX_BATCH_BALANCE_TOKEN_IDS:
            raise ValueError(
                f"Batch balance requests support at most {MAX_BATCH_BALANCE_TOKEN_IDS} token IDs"
            )

        for tid in request.token_ids:
            self._check_token(tid)
        data = await self._http.post(
            "/v1/accounting/balances/batch",
            {
                "token_ids": [normalize_hex(tid) for tid in request.token_ids],
            },
        )
        return BatchBalancesResponse(
            user_address=data["user_address"],
            balances=[_parse_token_balance(b) for b in data.get("balances", [])],
        )

    async def get_token_info(self, token_id: str) -> TokenInfoResponse:
        self._check_token(token_id)
        token = normalize_hex(token_id)
        data = await self._http.get(f"/v1/accounting/tokens/{token}")
        return TokenInfoResponse(
            token_id=data["token_id"],
            token_type=data["token_type"],
            token_type_name=data["token_type_name"],
            data=data["data"],
            chain_id=data.get("chain_id"),
            chain_name=data.get("chain_name"),
            token_address=data.get("token_address"),
        )

    async def lock_funds(self, request: LockFundsRequest) -> TransactionSubmissionResponse:
        self._check_token(request.token_id)
        data = await self._http.post(
            "/v1/accounting/funds/lock",
            {
                "user_address": normalize_address(request.user_address),
                "service_address": normalize_address(request.service_address),
                "token_id": normalize_hex(request.token_id),
                "amount": str(request.amount),
                "expiry": str(request.expiry),
                "nonce": str(request.nonce),
                "signature": normalize_hex(request.signature),
            },
        )
        return TransactionSubmissionResponse(
            status=data["status"],
            detail=data.get("detail"),
        )

    async def modify_lock(self, request: ModifyLockRequest) -> TransactionSubmissionResponse:
        data = await self._http.post(
            "/v1/accounting/funds/modify-lock",
            {
                "user_address": normalize_address(request.user_address),
                "lock_id": request.lock_id,
                "amount": str(request.amount),
                "new_expiry": str(request.new_expiry),
                "nonce": str(request.nonce),
                "signature": normalize_hex(request.signature),
            },
        )
        return TransactionSubmissionResponse(
            status=data["status"],
            detail=data.get("detail"),
        )

    async def unlock_funds(self, request: UnlockFundsRequest) -> TransactionSubmissionResponse:
        data = await self._http.post(
            "/v1/accounting/funds/unlock",
            {
                "user_address": normalize_address(request.user_address),
                "lock_id": request.lock_id,
            },
        )
        return TransactionSubmissionResponse(
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
            status=data["status"],
            detail=data.get("detail"),
        )

    async def get_locked_funds(self, service_address: str | None = None) -> LockedFundsResponse:
        query_params = ""
        if service_address:
            query_params = f"?service_address={normalize_address(service_address)}"
        data = await self._http.get(f"/v1/accounting/funds/locked{query_params}")
        return LockedFundsResponse(
            user_address=data["user_address"],
            service_address=data.get("service_address"),
            locks=[_parse_lock_info(lock) for lock in data.get("locks", [])],
            total_locked=data.get("total_locked", "0"),
        )

    async def get_total_locked_balance(self, token_id: str) -> TotalLockedBalanceResponse:
        self._check_token(token_id)
        token = normalize_hex(token_id)
        data = await self._http.get(f"/v1/accounting/funds/locked/total/{token}")
        return TotalLockedBalanceResponse(
            user_address=data["user_address"],
            token_id=data["token_id"],
            total_locked=data["total_locked"],
        )

    async def get_expired_locks(self) -> ExpiredLocksResponse:
        data = await self._http.get("/v1/accounting/funds/expired")
        return ExpiredLocksResponse(
            user_address=data["user_address"],
            expired_locks=[_parse_lock_info(lock) for lock in data.get("expired_locks", [])],
        )

    async def transfer_funds(self, request: TransferFundsRequest) -> TransactionSubmissionResponse:
        self._check_token(request.token_id)
        data = await self._http.post(
            "/v1/accounting/funds/transfer",
            {
                "user_address": normalize_address(request.user_address),
                "to_address": normalize_address(request.to_address),
                "token_id": normalize_hex(request.token_id),
                "amount": str(request.amount),
                "nonce": str(request.nonce),
                "signature": normalize_hex(request.signature),
            },
        )
        return TransactionSubmissionResponse(
            status=data["status"],
            detail=data.get("detail"),
        )

    async def get_transfer_nonce(self, user_address: str) -> TransferNonceResponse:
        user = normalize_address(user_address)
        data = await self._http.get(f"/v1/accounting/funds/transfer/nonce/{user}")
        return TransferNonceResponse(
            user_address=data["user_address"],
            nonce=data["nonce"],
        )

    async def get_lock_nonce(self, user_address: str) -> LockNonceResponse:
        user = normalize_address(user_address)
        data = await self._http.get(f"/v1/accounting/funds/lock/nonce/{user}")
        return LockNonceResponse(
            user_address=data["user_address"],
            nonce=data["nonce"],
        )

    async def get_modify_lock_nonce(self, user_address: str) -> ModifyLockNonceResponse:
        user = normalize_address(user_address)
        data = await self._http.get(f"/v1/accounting/funds/modify-lock/nonce/{user}")
        return ModifyLockNonceResponse(
            user_address=data["user_address"],
            nonce=data["nonce"],
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
                "amount": str(request.amount),
                "service_address": normalize_address(request.service_address),
                "nonce": str(request.nonce),
                "signature": normalize_hex(request.signature),
            },
        )
        return TransactionSubmissionResponse(
            status=data["status"],
            detail=data.get("detail"),
        )

    async def request_withdrawal(self, request: WithdrawalRequest) -> TransactionSubmissionResponse:
        self._check_token(request.token_id)
        data = await self._http.post(
            "/v1/accounting/withdraw",
            {
                "user_address": normalize_address(request.user_address),
                "token_id": normalize_hex(request.token_id),
                "amount": str(request.amount),
                "nonce": str(request.nonce),
                "signature": normalize_hex(request.signature),
            },
        )
        return TransactionSubmissionResponse(
            status=data["status"],
            detail=data.get("detail"),
        )

    async def get_withdrawal_nonce(self, user_address: str) -> WithdrawalNonceResponse:
        user = normalize_address(user_address)
        data = await self._http.get(f"/v1/accounting/withdraw/nonce/{user}")
        return WithdrawalNonceResponse(
            user_address=data["user_address"],
            nonce=data["nonce"],
        )

    async def get_transfer_locked_nonce(self, service_address: str) -> TransferLockedNonceResponse:
        service = normalize_address(service_address)
        data = await self._http.get(f"/v1/accounting/funds/transfer-locked/nonce/{service}")
        return TransferLockedNonceResponse(
            service_address=data["service_address"],
            nonce=data["nonce"],
        )

    async def get_pending_withdrawals(self, user_address: str) -> PendingWithdrawalsResponse:
        user = normalize_address(user_address)
        data = await self._http.get(f"/v1/accounting/withdraw/pending/{user}")
        withdrawals = data.get("pending_withdrawals", data.get("withdrawals", []))
        return PendingWithdrawalsResponse(
            user_address=data["user_address"],
            pending_withdrawals=[_parse_pending_withdrawal(w) for w in withdrawals],
        )

    async def get_withdrawal_info(self, index: int) -> WithdrawalInfoResponse:
        data = await self._http.get(f"/v1/accounting/withdraw/{index}")
        return WithdrawalInfoResponse(
            index=data["index"],
            user_address=data["user_address"],
            token_id=data["token_id"],
            amount=data["amount"],
            block_number=data.get("block_number", 0),
            resolved=data.get("resolved", False),
            tx_identifier=data.get("tx_identifier", ""),
        )

    async def get_siwe_domain(self) -> SiweDomainResponse:
        data = await self._http.get("/v1/accounting/auth/domain")
        return SiweDomainResponse(domain=data["domain"])

    async def get_siwe_nonce(self, user_address: str) -> SiweNonceResponse:
        user = normalize_address(user_address)
        data = await self._http.get(f"/v1/accounting/auth/nonce?address={user}")
        return SiweNonceResponse(
            address=data["address"],
            nonce=data["nonce"],
            expires_in=data["expires_in"],
        )

    async def login_with_siwe(self, siwe_message: str, signature: str) -> SiweLoginResponse:
        data = await self._http.post(
            "/v1/accounting/auth/login",
            {
                "siwe_message": siwe_message,
                "signature": normalize_hex(signature),
            },
        )
        return SiweLoginResponse(
            siwe_token=data["siwe_token"],
            jwt_access_token=data["jwt_access_token"],
            jwt_refresh_token=data["jwt_refresh_token"],
            address=data["address"],
            jwt_expires_in=data["jwt_expires_in"],
            jwt_refresh_expires_in=data["jwt_refresh_expires_in"],
        )

    async def authenticate_private_reads(
        self, siwe_message: str, signature: str
    ) -> SiweLoginResponse:
        login = await self.login_with_siwe(siwe_message, signature)
        self.set_private_read_token(login.siwe_token)
        return login

    def set_private_read_token(self, token: str) -> None:
        self._http.remove_header("Authorization")
        self._http.set_header(PRIVATE_READ_TOKEN_HEADER, token)

    def get_private_read_token(self) -> str | None:
        return self._http.get_header(PRIVATE_READ_TOKEN_HEADER)

    def clear_private_read_token(self) -> None:
        self._http.remove_header(PRIVATE_READ_TOKEN_HEADER)

    def set_bearer_token(self, token: str) -> None:
        self._http.remove_header(PRIVATE_READ_TOKEN_HEADER)
        self._http.set_header("Authorization", f"Bearer {token}")

    def clear_bearer_token(self) -> None:
        self._http.remove_header("Authorization")

    async def close(self) -> None:
        await self._http.close()

    async def __aenter__(self) -> FlexvaultsClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
