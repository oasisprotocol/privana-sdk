# flexvaults-sdk

Python SDK for Flexvaults - manage deposits, withdrawals, locks, and transfers on the accounting module.

## Installation

```bash
pip install flexvaults-sdk
```

## Quick Start

```python
import asyncio
from eth_account import Account
from flexvaults import FlexvaultsClient, DepositQuoteRequest, ensure_siwe_token

async def main():
    async with FlexvaultsClient(base_url="https://api.example.com") as client:
        # SIWE authentication is required for private reads (balances and lock details).
        # For backend services you can sign with a local key. Alternatively, pass an async signer
        # callback that delegates signing to your wallet integration.
        account = Account.from_key("0xYourPrivateKey")
        await ensure_siwe_token(
            client=client,
            chain_id=23295,  # Sapphire Testnet
            address=account.address,
            signer=account,
            cache_scope="https://api.example.com",
        )

        # Get a deposit quote
        quote = await client.get_deposit_quote(
            DepositQuoteRequest(
                user_address="0xYourAddress",
                token_id="0xTokenId",
                amount=1000000,
            )
        )
        print(f"Deposit to: {quote.deposit_address}")

        # Check balance
        balance = await client.get_balance("0xYourAddress", "0xTokenId")
        print(f"Balance: {balance.balance}")

asyncio.run(main())
```

## EIP-712 Signing

```python
from eth_account import Account
from flexvaults import (
    sign_lock_message,
    SignLockParams,
    LockMessage,
    get_accounting_contract,
    create_lock_expiry,
)

account = Account.from_key("0xYourPrivateKey")

signature = sign_lock_message(
    SignLockParams(
        account=account,
        network="testnet",
        verifying_contract=get_accounting_contract("testnet"),
        message=LockMessage(
            user_address=account.address,
            service_address="0xServiceAddress",
            token_id="0xTokenId",
            amount=1000000,
            expiry=create_lock_expiry(60),
        ),
    )
)
```

## API Reference

### Client

- `FlexvaultsClient(base_url, timeout=30.0, headers=None)` - Main API client
  - `get_siwe_domain()` - Fetch SIWE domain for this deployment
  - `siwe_login(siwe_message, signature)` - Perform SIWE login and return token
  - `set_siwe_token(token)` / `clear_siwe_token()` - Manage SIWE token header for private reads
  - `get_deposit_quote(request)` - Get deposit quote
  - `include_deposit(request)` - Include deposit proof
  - `get_balance(user_address, token_id)` - Get token balance
  - `get_batch_balances(request)` - Get multiple token balances
  - `get_token_info(token_id)` - Get token information
  - `lock_funds(request)` - Lock funds for a service
  - `modify_lock(request)` - Modify an existing lock (add funds and/or extend expiry)
  - `unlock_funds(request)` - Unlock specific lock
  - `unlock_all_expired(request)` - Unlock all expired locks
  - `get_locked_funds(user_address, service_address=None)` - Get locked funds
  - `get_total_locked_balance(user_address, token_id)` - Get total locked balance
  - `get_expired_locks(user_address)` - Get expired locks
  - `transfer_funds(request)` - Transfer tokens (requires nonce)
  - `get_transfer_nonce(user_address)` - Get next transfer nonce
  - `transfer_locked_funds(request)` - Transfer locked tokens
  - `request_withdrawal(request)` - Request withdrawal
  - `get_pending_withdrawals(user_address)` - Get pending withdrawals
  - `get_withdrawal_info(index)` - Get withdrawal info

### Signing

- `sign_lock_message(params)` - Sign lock message
- `sign_modify_lock_message(params)` - Sign modify lock message
- `sign_transfer_message(params)` - Sign transfer message
- `sign_transfer_locked_message(params)` - Sign transfer locked message
- `sign_withdraw_message(params)` - Sign withdrawal message
- `create_lock_expiry(minutes_from_now=60)` - Create expiry timestamp

### Utilities

- `format_token_amount(amount, decimals=18)` - Format wei to human-readable
- `parse_token_amount(amount, decimals=18)` - Parse human-readable to wei
- `shorten_address(address, chars=4)` - Shorten Ethereum address
- `format_timestamp(timestamp)` - Format Unix timestamp to readable string
- `is_expired(expiry)` - Check if timestamp is expired
- `format_time_remaining(expiry_timestamp)` - Format time remaining
- `format_relative_time(timestamp)` - Format relative time (e.g., "5m ago")

## License

Apache-2.0
