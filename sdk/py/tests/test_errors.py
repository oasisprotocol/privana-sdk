from privana.client.errors import AccountingApiError, NetworkError, ValidationError


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

    def test_str_includes_detail(self):
        err = AccountingApiError("API request failed: 400 Bad Request", 400, "Insufficient balance")
        assert str(err) == "API request failed: 400 Bad Request: Insufficient balance"

    def test_str_does_not_duplicate_detail(self):
        err = AccountingApiError("failed: not found", 404, "not found")
        assert str(err) == "failed: not found"

    def test_str_without_detail(self):
        err = AccountingApiError("test error", 400)
        assert str(err) == "test error"

    def test_str_with_list_detail(self):
        """FastAPI's own 422 sends detail as a list of validation objects."""
        err = AccountingApiError(
            "API request failed: 422 Unprocessable Entity",
            422,
            [{"loc": ["body", "amount"], "msg": "field required"}],
        )

        rendered = str(err)

        assert rendered.startswith("API request failed: 422 Unprocessable Entity: ")
        assert "field required" in rendered

    def test_str_with_dict_detail(self):
        err = AccountingApiError("failed", 400, {"reason": "pool paused"})

        assert "pool paused" in str(err)

    def test_str_with_falsy_detail(self):
        assert str(AccountingApiError("failed", 400, [])) == "failed"
        assert str(AccountingApiError("failed", 400, "")) == "failed"

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
