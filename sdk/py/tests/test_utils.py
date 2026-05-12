import math
import time

from privana.utils import (
    format_relative_time,
    format_time_remaining,
    format_token_amount,
    is_expired,
    parse_token_amount,
    shorten_address,
)


class TestFormatTokenAmount:
    def test_basic_18_decimals(self):
        result = format_token_amount("1000000000000000000", 18)
        assert result == "1.00"

    def test_zero(self):
        result = format_token_amount("0", 18)
        assert result == "0.00"

    def test_with_fractional_18_decimals(self):
        result = format_token_amount("1500000000000000000", 18)
        assert result == "1.50"

    def test_6_decimals(self):
        result = format_token_amount("1000000", 6)
        assert result == "1.00"

    def test_large_amount_with_commas(self):
        result = format_token_amount("1000000000000", 6)
        assert result == "1,000,000.00"

    def test_int_input(self):
        result = format_token_amount(1000000, 6)
        assert result == "1.00"

    def test_fractional_part(self):
        result = format_token_amount("1230000", 6)
        assert result == "1.23"


class TestParseTokenAmount:
    def test_basic(self):
        result = parse_token_amount("1.0", 18)
        assert result == 1000000000000000000

    def test_no_decimals(self):
        result = parse_token_amount("100", 6)
        assert result == 100000000

    def test_with_decimals(self):
        result = parse_token_amount("1.23", 6)
        assert result == 1230000

    def test_round_trip(self):
        original = "1234567"
        parsed = parse_token_amount("1.234567", 6)
        assert parsed == int(original)


class TestShortenAddress:
    def test_basic(self):
        addr = "0xaF8e5de153A584528B57DD4B9B0195956BBDF571"
        result = shorten_address(addr)
        assert result == "0xaF8e...F571"

    def test_custom_chars(self):
        addr = "0xaF8e5de153A584528B57DD4B9B0195956BBDF571"
        result = shorten_address(addr, 6)
        assert result == "0xaF8e5d...BDF571"

    def test_short_address(self):
        result = shorten_address("0xab")
        assert result == "0xab"

    def test_empty(self):
        result = shorten_address("")
        assert result == ""


class TestIsExpired:
    def test_past_is_expired(self):
        assert is_expired(0) is True

    def test_future_not_expired(self):
        future = math.floor(time.time()) + 3600
        assert is_expired(future) is False


class TestFormatTimeRemaining:
    def test_expired(self):
        assert format_time_remaining(0) == "Expired"

    def test_minutes(self):
        future = math.floor(time.time()) + 300
        result = format_time_remaining(future)
        assert "m left" in result

    def test_hours(self):
        future = math.floor(time.time()) + 7200
        result = format_time_remaining(future)
        assert "h" in result

    def test_days(self):
        future = math.floor(time.time()) + 172800
        result = format_time_remaining(future)
        assert "d" in result


class TestFormatRelativeTime:
    def test_just_now(self):
        now_ts = math.floor(time.time())
        result = format_relative_time(now_ts)
        assert result == "Just now"

    def test_minutes_ago(self):
        past = math.floor(time.time()) - 300
        result = format_relative_time(past)
        assert "m ago" in result

    def test_hours_ago(self):
        past = math.floor(time.time()) - 7200
        result = format_relative_time(past)
        assert "h ago" in result

    def test_days_ago(self):
        past = math.floor(time.time()) - 172800
        result = format_relative_time(past)
        assert "d ago" in result
