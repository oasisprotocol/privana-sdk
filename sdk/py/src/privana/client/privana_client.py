from __future__ import annotations

from collections.abc import Sequence
from typing import Any
from urllib.parse import urlencode

from ..types import (
    normalize_address,
    normalize_hex,
)
from ..types.requests import (
    BatchBalancesRequest,
    DepositAddressRequest,
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
from ..types.responses import (
    BalanceResponse,
    BatchBalancesResponse,
    DepositAddressResponse,
    DepositCheckResponse,
    ExpiredLocksResponse,
    HistoryEntry,
    HistoryResponse,
    HostedAuthTokenExchangeResponse,
    JwtLogoutResponse,
    JwtRefreshResponse,
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
    TokenListResponse,
    TotalLockedBalanceResponse,
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
MAX_HISTORY_PAGE_SIZE = 100


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


def _parse_history_entry(data: dict[str, Any]) -> HistoryEntry:
    return HistoryEntry(
        kind=data["kind"],
        timestamp=data["timestamp"],
        token_id=data.get("token_id"),
        amount=data.get("amount"),
        counterparty=data.get("counterparty"),
        deposit_id=data.get("deposit_id"),
        chain_id=data.get("chain_id"),
    )


def _parse_token_info(data: dict[str, Any]) -> TokenInfoResponse:
    return TokenInfoResponse(
        token_id=data["token_id"],
        token_type=data["token_type"],
        token_type_name=data["token_type_name"],
        data=data["data"],
        chain_id=data.get("chain_id"),
        chain_name=data.get("chain_name"),
        token_address=data.get("token_address"),
        symbol=data.get("symbol"),
        name=data.get("name"),
        decimals=data.get("decimals"),
    )


def _parse_pending_withdrawal(data: dict[str, Any]) -> PendingWithdrawal:
    return PendingWithdrawal(
        index=data["index"],
        user_address=data["user_address"],
        to_address=data["to_address"],
        token_id=data["token_id"],
        amount=data["amount"],
        block_number=data["block_number"],
        resolved=data["resolved"],
        tx_identifier=data["tx_identifier"],
    )


class PrivanaClient:
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

    async def get_deposit_address(
        self, request: DepositAddressRequest | None = None
    ) -> DepositAddressResponse:
        req = request or DepositAddressRequest()
        data = await self._http.post(
            "/v1/accounting/deposits/address",
            {
                "chain_type": req.chain_type,
                "version": req.version,
            },
        )
        return DepositAddressResponse(
            deposit_address=data["deposit_address"],
            chain_type=data["chain_type"],
            version=data["version"],
            min_deposit=data.get("min_deposit", {}),
        )

    async def check_deposit(self, request: DepositCheckRequest) -> DepositCheckResponse:
        data = await self._http.post(
            "/v1/accounting/deposits/check",
            {
                "chain_type": request.chain_type,
                "chain_id": request.chain_id,
                "tx_hash": normalize_hex(request.tx_hash),
                "amount": str(request.amount),
                "log_index": request.log_index,
                "version": request.version,
            },
        )
        return DepositCheckResponse(
            status=data["status"],
            deposit_id=data.get("deposit_id"),
            amount=data.get("amount"),
            token_address=data.get("token_address"),
            detail=data.get("detail"),
        )

    async def get_deposit_status(self, deposit_id: str) -> DepositCheckResponse:
        data = await self._http.get(f"/v1/accounting/deposits/status/{deposit_id}")
        return DepositCheckResponse(
            status=data["status"],
            deposit_id=data.get("deposit_id"),
            amount=data.get("amount"),
            token_address=data.get("token_address"),
            detail=data.get("detail"),
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

    async def get_history(self, offset: int = -1, limit: int = 50) -> HistoryResponse:
        if not isinstance(offset, int) or isinstance(offset, bool):
            raise TypeError("History offset must be an integer")
        if not isinstance(limit, int) or isinstance(limit, bool):
            raise TypeError("History limit must be an integer")
        if limit < 0 or limit > MAX_HISTORY_PAGE_SIZE:
            raise ValueError(
                f"History requests support between 0 and {MAX_HISTORY_PAGE_SIZE} entries"
            )

        params = urlencode({"offset": offset, "limit": limit})
        data = await self._http.get(f"/v1/accounting/history?{params}")
        return HistoryResponse(
            history=[_parse_history_entry(entry) for entry in data.get("history", [])],
            total=data["total"],
        )

    async def get_token_info(self, token_id: str) -> TokenInfoResponse:
        self._check_token(token_id)
        token = normalize_hex(token_id)
        data = await self._http.get(f"/v1/accounting/tokens/{token}")
        return _parse_token_info(data)

    async def list_tokens(self) -> TokenListResponse:
        data = await self._http.get("/v1/accounting/tokens")
        return TokenListResponse(
            tokens=[_parse_token_info(t) for t in data["tokens"]],
        )

    async def lock_funds(self, request: LockFundsRequest) -> TransactionSubmissionResponse:
        self._check_token(request.token_id)
        data = await self._http.post(
            "/v1/accounting/funds/lock",
            {
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

    async def withdraw_from_lock(
        self, request: WithdrawFromLockRequest
    ) -> TransactionSubmissionResponse:
        data = await self._http.post(
            "/v1/accounting/funds/withdraw-from-lock",
            {
                "to_address": normalize_address(request.to_address),
                "lock_id": request.lock_id,
                "amount": str(request.amount),
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
        return PendingWithdrawalsResponse(
            user_address=data["user_address"],
            pending_withdrawals=[_parse_pending_withdrawal(w) for w in data["pending_withdrawals"]],
        )

    async def get_withdrawal_info(self, index: int) -> WithdrawalInfoResponse:
        data = await self._http.get(f"/v1/accounting/withdraw/{index}")
        return WithdrawalInfoResponse(
            index=data["index"],
            user_address=data["user_address"],
            to_address=data["to_address"],
            token_id=data["token_id"],
            amount=data["amount"],
            block_number=data["block_number"],
            resolved=data["resolved"],
            tx_identifier=data["tx_identifier"],
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

    def get_hosted_auth_authorize_url(self, request: HostedAuthAuthorizeUrlRequest) -> str:
        params = urlencode(
            {
                "client_id": request.client_id,
                "redirect_uri": request.redirect_uri,
                "code_challenge": request.code_challenge,
                "state": request.state,
                "chain_id": str(request.chain_id),
                "response_mode": request.response_mode,
                "code_challenge_method": request.code_challenge_method,
            }
        )
        base = self._http.get_base_url().rstrip("/")
        return f"{base}/v1/accounting/auth/authorize?{params}"

    async def exchange_hosted_auth_code(
        self, request: HostedAuthTokenExchangeRequest
    ) -> HostedAuthTokenExchangeResponse:
        data = await self._http.post(
            "/v1/accounting/auth/token",
            {
                "grant_type": request.grant_type,
                "code": request.code,
                "code_verifier": request.code_verifier,
                "client_id": request.client_id,
                "redirect_uri": request.redirect_uri,
            },
        )
        return HostedAuthTokenExchangeResponse(
            access_token=data["access_token"],
            id_token=data["id_token"],
            refresh_token=data["refresh_token"],
            token_type=data["token_type"],
            expires_in=data["expires_in"],
            refresh_expires_in=data["refresh_expires_in"],
            address=data["address"],
        )

    async def refresh_jwt_session(self, request: JwtRefreshRequest) -> JwtRefreshResponse:
        data = await self._http.post(
            "/v1/accounting/auth/jwt/refresh",
            {"refresh_token": request.refresh_token},
        )
        return JwtRefreshResponse(
            token=data["token"],
            refresh_token=data["refresh_token"],
            expires_in=data["expires_in"],
            refresh_expires_in=data["refresh_expires_in"],
        )

    async def logout_jwt_session(
        self, request: JwtLogoutRequest | None = None
    ) -> JwtLogoutResponse:
        payload: dict[str, Any] = {}
        if request is not None:
            if request.refresh_token is not None:
                payload["refresh_token"] = request.refresh_token
            if request.revoke_all:
                payload["revoke_all"] = True
        data = await self._http.post("/v1/accounting/auth/jwt/logout", payload)
        return JwtLogoutResponse(
            message=data["message"],
            revoked_tokens=data["revoked_tokens"],
        )

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

    async def __aenter__(self) -> PrivanaClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()
