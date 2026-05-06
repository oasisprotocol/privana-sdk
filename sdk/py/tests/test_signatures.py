from eth_account import Account

from flexvaults.signatures import (
    LOCK_TYPES,
    MODIFY_LOCK_TYPES,
    TRANSFER_LOCKED_TYPES,
    TRANSFER_TYPES,
    WITHDRAW_TYPES,
    LockMessage,
    ModifyLockMessage,
    SignLockParams,
    SignModifyLockParams,
    SignTransferLockedParams,
    SignTransferParams,
    SignWithdrawParams,
    TransferLockedMessage,
    TransferMessage,
    WithdrawMessage,
    create_domain,
    create_lock_expiry,
    sign_lock_message,
    sign_modify_lock_message,
    sign_transfer_locked_message,
    sign_transfer_message,
    sign_withdraw_message,
)

TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
TEST_ACCOUNT = Account.from_key(TEST_PRIVATE_KEY)
TEST_ADDRESS = TEST_ACCOUNT.address
CONTRACT_ADDRESS = "0xaF8e5de153A584528B57DD4B9B0195956BBDF571"
SERVICE_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
TOKEN_ID = "0xc719650e9f4b0f27d956638c54518932ef9d15e720a1a2b2850250bcd0816514"


class TestCreateDomain:
    def test_testnet(self):
        domain = create_domain("testnet", CONTRACT_ADDRESS)
        assert domain.name == "AccountingModule"
        assert domain.version == "1"
        assert domain.chain_id == 23295
        assert domain.verifying_contract == CONTRACT_ADDRESS

    def test_mainnet(self):
        domain = create_domain("mainnet", CONTRACT_ADDRESS)
        assert domain.chain_id == 23294


class TestCreateLockExpiry:
    def test_default_60_minutes(self):
        expiry = create_lock_expiry()
        import time

        expected = int(time.time()) + 3600
        assert abs(expiry - expected) < 2

    def test_custom_minutes(self):
        expiry = create_lock_expiry(120)
        import time

        expected = int(time.time()) + 7200
        assert abs(expiry - expected) < 2


class TestSignLockMessage:
    def test_produces_valid_signature(self):
        sig = sign_lock_message(
            SignLockParams(
                account=TEST_ACCOUNT,
                network="testnet",
                verifying_contract=CONTRACT_ADDRESS,
                message=LockMessage(
                    service_address=SERVICE_ADDRESS,
                    token_id=TOKEN_ID,
                    amount=1000000,
                    expiry=9999999999,
                    nonce=0,
                ),
            )
        )
        assert sig.startswith("0x")
        assert len(sig) == 132

    def test_deterministic(self):
        params = SignLockParams(
            account=TEST_ACCOUNT,
            network="testnet",
            verifying_contract=CONTRACT_ADDRESS,
            message=LockMessage(
                service_address=SERVICE_ADDRESS,
                token_id=TOKEN_ID,
                amount=1000000,
                expiry=9999999999,
                nonce=0,
            ),
        )
        sig1 = sign_lock_message(params)
        sig2 = sign_lock_message(params)
        assert sig1 == sig2


class TestSignModifyLockMessage:
    def test_produces_valid_signature(self):
        sig = sign_modify_lock_message(
            SignModifyLockParams(
                account=TEST_ACCOUNT,
                network="testnet",
                verifying_contract=CONTRACT_ADDRESS,
                message=ModifyLockMessage(
                    lock_id=1,
                    amount=500000,
                    new_expiry=9999999999,
                    nonce=0,
                ),
            )
        )
        assert sig.startswith("0x")
        assert len(sig) == 132


class TestSignTransferMessage:
    def test_produces_valid_signature(self):
        sig = sign_transfer_message(
            SignTransferParams(
                account=TEST_ACCOUNT,
                network="testnet",
                verifying_contract=CONTRACT_ADDRESS,
                message=TransferMessage(
                    to_address=SERVICE_ADDRESS,
                    token_id=TOKEN_ID,
                    amount=500000,
                    nonce=1,
                ),
            )
        )
        assert sig.startswith("0x")
        assert len(sig) == 132


class TestSignTransferLockedMessage:
    def test_produces_valid_signature(self):
        sig = sign_transfer_locked_message(
            SignTransferLockedParams(
                account=TEST_ACCOUNT,
                network="testnet",
                verifying_contract=CONTRACT_ADDRESS,
                message=TransferLockedMessage(
                    user_address=TEST_ADDRESS,
                    to_address=SERVICE_ADDRESS,
                    lock_id=0,
                    amount=250000,
                    nonce=0,
                    service_address=SERVICE_ADDRESS,
                ),
            )
        )
        assert sig.startswith("0x")
        assert len(sig) == 132


class TestSignWithdrawMessage:
    def test_produces_valid_signature(self):
        sig = sign_withdraw_message(
            SignWithdrawParams(
                account=TEST_ACCOUNT,
                network="testnet",
                verifying_contract=CONTRACT_ADDRESS,
                message=WithdrawMessage(
                    token_id=TOKEN_ID,
                    amount=100000,
                    nonce=0,
                ),
            )
        )
        assert sig.startswith("0x")
        assert len(sig) == 132

    def test_different_nonce_different_sig(self):
        base_params = dict(
            account=TEST_ACCOUNT,
            network="testnet",
            verifying_contract=CONTRACT_ADDRESS,
        )
        sig1 = sign_withdraw_message(
            SignWithdrawParams(
                **base_params,
                message=WithdrawMessage(
                    token_id=TOKEN_ID,
                    amount=100000,
                    nonce=0,
                ),
            )
        )
        sig2 = sign_withdraw_message(
            SignWithdrawParams(
                **base_params,
                message=WithdrawMessage(
                    token_id=TOKEN_ID,
                    amount=100000,
                    nonce=1,
                ),
            )
        )
        assert sig1 != sig2


class TestEIP712Types:
    def test_lock_types_structure(self):
        assert "Lock" in LOCK_TYPES
        assert [field["name"] for field in LOCK_TYPES["Lock"]] == [
            "serviceAddress",
            "tokenId",
            "amount",
            "expiry",
            "nonce",
        ]

    def test_modify_lock_types_structure(self):
        assert "ModifyLock" in MODIFY_LOCK_TYPES
        assert [field["name"] for field in MODIFY_LOCK_TYPES["ModifyLock"]] == [
            "lockId",
            "amount",
            "newExpiry",
            "nonce",
        ]

    def test_transfer_types_structure(self):
        assert "Transfer" in TRANSFER_TYPES
        assert [field["name"] for field in TRANSFER_TYPES["Transfer"]] == [
            "toAddress",
            "tokenId",
            "amount",
            "nonce",
        ]

    def test_transfer_locked_types_structure(self):
        assert "TransferLocked" in TRANSFER_LOCKED_TYPES
        assert [field["name"] for field in TRANSFER_LOCKED_TYPES["TransferLocked"]] == [
            "userAddress",
            "toAddress",
            "lockId",
            "amount",
            "nonce",
            "serviceAddress",
        ]

    def test_withdraw_types_structure(self):
        assert "Withdraw" in WITHDRAW_TYPES
        assert [field["name"] for field in WITHDRAW_TYPES["Withdraw"]] == [
            "tokenId",
            "amount",
            "nonce",
        ]
