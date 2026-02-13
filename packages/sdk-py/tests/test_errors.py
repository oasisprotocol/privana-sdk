from flexvaults.client.errors import AccountingApiError, NetworkError, ValidationError


class TestAccountingApiError:
    def test_basic(self):
        err = AccountingApiError("test error", 400)
        assert str(err) == "test error"
        assert err.status_code == 400
        assert err.detail is None

    def test_with_detail(self):
        err = AccountingApiError("test error", 404, "not found")
        assert err.status_code == 404
        assert err.detail == "not found"

    def test_is_exception(self):
        err = AccountingApiError("test", 500)
        assert isinstance(err, Exception)


class TestNetworkError:
    def test_basic(self):
        err = NetworkError("timeout")
        assert str(err) == "timeout"
        assert err.__cause__ is None

    def test_with_cause(self):
        cause = ConnectionError("refused")
        err = NetworkError("failed", cause)
        assert err.__cause__ is cause


class TestValidationError:
    def test_basic(self):
        err = ValidationError("invalid input")
        assert str(err) == "invalid input"
        assert err.field is None

    def test_with_field(self):
        err = ValidationError("required", "user_address")
        assert err.field == "user_address"
