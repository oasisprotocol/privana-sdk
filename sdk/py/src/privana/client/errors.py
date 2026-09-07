from __future__ import annotations

from typing import Any


class AccountingApiError(Exception):
    def __init__(
        self,
        message: str,
        status_code: int,
        # Whatever the server put in the body's "detail" field. Usually a
        # string, but FastAPI's own 422 sends a list of validation objects,
        # so this cannot be narrowed to str.
        detail: Any = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.detail = detail

    def __str__(self) -> str:
        base = super().__str__()
        if not self.detail:
            return base
        detail = self.detail if isinstance(self.detail, str) else repr(self.detail)
        if detail in base:
            return base
        return f"{base}: {detail}"


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
