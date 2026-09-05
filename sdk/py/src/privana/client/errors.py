from __future__ import annotations


class AccountingApiError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int,
        detail: str | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail

    def __str__(self) -> str:
        base = super().__str__()
        if self.detail and self.detail not in base:
            return f"{base}: {self.detail}"
        return base


class NetworkError(Exception):
    def __init__(
        self,
        message: str,
        cause: Exception | None = None,
    ) -> None:
        super().__init__(message)
        self.__cause__ = cause


class ValidationError(Exception):
    def __init__(
        self,
        message: str,
        field: str | None = None,
    ) -> None:
        super().__init__(message)
        self.field = field
