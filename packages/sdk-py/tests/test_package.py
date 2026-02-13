import flexvaults


class TestPackageExports:
    def test_version(self):
        assert flexvaults.__version__ == "0.1.5"

    def test_client_exports(self):
        assert hasattr(flexvaults, "FlexvaultsClient")
        assert hasattr(flexvaults, "HttpClient")
        assert hasattr(flexvaults, "AccountingApiError")
        assert hasattr(flexvaults, "NetworkError")
        assert hasattr(flexvaults, "ValidationError")

    def test_type_exports(self):
        assert hasattr(flexvaults, "NETWORK_CONFIG")
        assert hasattr(flexvaults, "SUPPORTED_TOKENS")
        assert hasattr(flexvaults, "SUPPORTED_CHAINS")
        assert hasattr(flexvaults, "normalize_hex")
        assert hasattr(flexvaults, "normalize_address")

    def test_signature_exports(self):
        assert hasattr(flexvaults, "sign_lock_message")
        assert hasattr(flexvaults, "sign_transfer_message")
        assert hasattr(flexvaults, "sign_transfer_locked_message")
        assert hasattr(flexvaults, "sign_withdraw_message")
        assert hasattr(flexvaults, "create_lock_expiry")
        assert hasattr(flexvaults, "create_domain")

    def test_util_exports(self):
        assert hasattr(flexvaults, "format_token_amount")
        assert hasattr(flexvaults, "parse_token_amount")
        assert hasattr(flexvaults, "shorten_address")
        assert hasattr(flexvaults, "format_timestamp")
        assert hasattr(flexvaults, "is_expired")
        assert hasattr(flexvaults, "format_time_remaining")
        assert hasattr(flexvaults, "format_relative_time")

    def test_request_types(self):
        assert hasattr(flexvaults, "DepositQuoteRequest")
        assert hasattr(flexvaults, "IncludeDepositRequest")
        assert hasattr(flexvaults, "LockFundsRequest")
        assert hasattr(flexvaults, "UnlockFundsRequest")
        assert hasattr(flexvaults, "TransferFundsRequest")
        assert hasattr(flexvaults, "WithdrawalRequest")
        assert hasattr(flexvaults, "BatchBalancesRequest")

    def test_response_types(self):
        assert hasattr(flexvaults, "DepositQuoteResponse")
        assert hasattr(flexvaults, "IncludeDepositResponse")
        assert hasattr(flexvaults, "TransactionSubmissionResponse")
        assert hasattr(flexvaults, "BalanceResponse")
        assert hasattr(flexvaults, "BatchBalancesResponse")
        assert hasattr(flexvaults, "TokenInfoResponse")
        assert hasattr(flexvaults, "LockedFundsResponse")
        assert hasattr(flexvaults, "ExpiredLocksResponse")
        assert hasattr(flexvaults, "PendingWithdrawalsResponse")
        assert hasattr(flexvaults, "WithdrawalInfoResponse")
