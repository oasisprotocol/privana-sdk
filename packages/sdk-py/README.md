# flexvaults-sdk

Python SDK for Flexvaults - manage deposits, withdrawals, locks, and transfers on the accounting module.

## Installation

```bash
pip install flexvaults-sdk
```

## Quick Start

```python
import asyncio
from flexvaults import FlexvaultsClient, DepositCheckRequest

async def main():
    async with FlexvaultsClient(base_url="https://api.example.com") as client:
        # Get per-user deposit address
        addr = await client.get_deposit_address()
        print(f"Deposit to: {addr.deposit_address}")

        # After sending tokens to the deposit address, verify the deposit
        result = await client.check_deposit(
            DepositCheckRequest(
                chain_id=84532,
                tx_hash="0xYourTxHash",
                amount=1000000,
            )
        )
        print(f"Deposit status: {result.status}")

asyncio.run(main())
```

## Direct SIWE Private Reads

Private read endpoints such as balances, history, and locked funds use the backend's direct SIWE flow.
The Python SDK exposes the raw helpers and token setters rather than a hosted auth-code wrapper.
`get_history(offset=-1, limit=50)` returns one page; non-negative offsets count pages from the
oldest entries, negative offsets count from the end, each page is oldest-to-newest, and `limit`
must be between 0 and 100.

```python
import asyncio
from flexvaults import FlexvaultsClient

async def main():
    async with FlexvaultsClient(base_url="https://api.example.com") as client:
        domain = await client.get_siwe_domain()
        nonce = await client.get_siwe_nonce("0xYourAddress")

        # Build and sign the SIWE message in your app, then submit it here.
        login = await client.authenticate_private_reads(
            siwe_message="your signed-in message",
            signature="0xYourSignature",
        )

        balance = await client.get_balance("0xTokenId")
        history = await client.get_history()
        print(domain.domain, nonce.nonce, login.address, balance.balance, history.total)

asyncio.run(main())
```

## EIP-712 Signing

```python
from eth_account import Account
from flexvaults import (
    sign_lock_message,
    LockNonceResponse,
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
            nonce=0,
        ),
    )
)
```

## API Reference

### Client

- `FlexvaultsClient(base_url, timeout=30.0, headers=None)` - Main API client
  - `get_deposit_address(request=None)` - Get per-user deposit address
  - `check_deposit(request)` - Verify a deposit and trigger credit
  - `get_balance(token_id)` - Get token balance for the authenticated user
  - `get_batch_balances(request)` - Get multiple token balances
  - `get_history(offset=-1, limit=50)` - Get one authenticated history page
  - `get_token_info(token_id)` - Get token information
  - `lock_funds(request)` - Lock funds for a service
  - `get_lock_nonce(user_address)` - Get next create-lock nonce
  - `get_modify_lock_nonce(user_address)` - Get next modify-lock nonce
  - `modify_lock(request)` - Modify an existing lock (add funds and/or extend expiry)
  - `unlock_funds(request)` - Unlock specific lock
  - `unlock_all_expired(request)` - Unlock all expired locks
  - `get_locked_funds(service_address=None)` - Get locked funds for the authenticated user
  - `get_total_locked_balance(token_id)` - Get total locked balance for the authenticated user
  - `get_expired_locks()` - Get expired locks for the authenticated user
  - `transfer_funds(request)` - Transfer tokens (requires nonce)
  - `get_transfer_nonce(user_address)` - Get next transfer nonce
  - `transfer_locked_funds(request)` - Transfer locked tokens
  - `get_transfer_locked_nonce(service_address)` - Get next transfer-from-lock nonce
  - `request_withdrawal(request)` - Request withdrawal
  - `get_withdrawal_nonce(user_address)` - Get next withdrawal nonce
  - `get_pending_withdrawals(user_address)` - Get pending withdrawals
  - `get_withdrawal_info(index)` - Get withdrawal info
  - `get_siwe_domain()` - Get the direct SIWE auth domain
  - `get_siwe_nonce(user_address)` - Get a SIWE login nonce
  - `login_with_siwe(siwe_message, signature)` - Exchange a signed SIWE message for tokens
  - `authenticate_private_reads(siwe_message, signature)` - Login and store `X-SIWE-Token`
  - `set_private_read_token(token)` / `clear_private_read_token()` - Manage `X-SIWE-Token`
  - `set_bearer_token(token)` / `clear_bearer_token()` - Manage bearer auth headers

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
