import privana


class TestPackageExports:
    def test_version(self):
        assert privana.__version__ == "0.2.0"

    def test_client_exports(self):
        assert hasattr(privana, "PrivanaClient")
        assert hasattr(privana, "HttpClient")
        assert hasattr(privana, "AccountingApiError")
        assert hasattr(privana, "NetworkError")
        assert hasattr(privana, "ValidationError")

    def test_type_exports(self):
        assert hasattr(privana, "NETWORK_CONFIG")
        assert hasattr(privana, "SUPPORTED_TOKENS")
        assert hasattr(privana, "SUPPORTED_CHAINS")
        assert hasattr(privana, "normalize_hex")
        assert hasattr(privana, "normalize_address")

    def test_signature_exports(self):
        assert hasattr(privana, "sign_lock_message")
        assert hasattr(privana, "sign_deposit_lock_authorization_message")
        assert hasattr(privana, "sign_transfer_message")
        assert hasattr(privana, "sign_transfer_locked_message")
        assert hasattr(privana, "sign_withdraw_message")
        assert hasattr(privana, "create_lock_expiry")
        assert hasattr(privana, "create_deposit_lock_authorization_deadline")
        assert hasattr(privana, "create_deposit_lock_duration")
        assert hasattr(privana, "create_deposit_lock_intent_id")
        assert hasattr(privana, "create_domain")

    def test_util_exports(self):
        assert hasattr(privana, "format_token_amount")
        assert hasattr(privana, "parse_token_amount")
        assert hasattr(privana, "shorten_address")
        assert hasattr(privana, "format_timestamp")
        assert hasattr(privana, "is_expired")
        assert hasattr(privana, "format_time_remaining")
        assert hasattr(privana, "format_relative_time")

    def test_request_types(self):
        assert hasattr(privana, "DepositAddressRequest")
        assert hasattr(privana, "DepositLockAuthorization")
        assert hasattr(privana, "DepositCheckRequest")
        assert hasattr(privana, "LockFundsRequest")
        assert hasattr(privana, "UnlockFundsRequest")
        assert hasattr(privana, "TransferFundsRequest")
        assert hasattr(privana, "WithdrawalRequest")
        assert hasattr(privana, "BatchBalancesRequest")

    def test_response_types(self):
        assert hasattr(privana, "DepositAddressResponse")
        assert hasattr(privana, "DepositCheckResponse")
        assert hasattr(privana, "TransactionSubmissionResponse")
        assert hasattr(privana, "BalanceResponse")
        assert hasattr(privana, "BatchBalancesResponse")
        assert hasattr(privana, "HistoryKind")
        assert hasattr(privana, "HistoryEntry")
        assert hasattr(privana, "HistoryResponse")
        assert hasattr(privana, "TokenInfoResponse")
        assert hasattr(privana, "LockedFundsResponse")
        assert hasattr(privana, "ExpiredLocksResponse")
        assert hasattr(privana, "PendingWithdrawalsResponse")
        assert hasattr(privana, "WithdrawalInfoResponse")
