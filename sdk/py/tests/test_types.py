from privana.types import (
    NETWORK_CONFIG,
    SUPPORTED_CHAINS,
    SUPPORTED_TOKENS,
    get_accounting_contract,
    get_all_tokens,
    get_api_url,
    get_chain_by_id,
    get_chain_id,
    get_explorer_address_url,
    get_token_by_id,
    get_token_config,
    is_valid_token,
    normalize_address,
    normalize_hex,
)


class TestNetworkConfig:
    def test_testnet_config(self):
        config = NETWORK_CONFIG["testnet"]
        assert config.chain_id == 23295
        assert config.name == "Sapphire Testnet"
        assert config.accounting_contract == "0xaF8e5de153A584528B57DD4B9B0195956BBDF571"
        assert config.api_url.startswith("https://")

    def test_mainnet_config(self):
        config = NETWORK_CONFIG["mainnet"]
        assert config.chain_id == 23294
        assert config.name == "Sapphire Mainnet"

    def test_get_chain_id(self):
        assert get_chain_id("testnet") == 23295
        assert get_chain_id("mainnet") == 23294

    def test_get_accounting_contract(self):
        contract = get_accounting_contract("testnet")
        assert contract.startswith("0x")
        assert len(contract) == 42

    def test_get_api_url(self):
        url = get_api_url("testnet")
        assert url.startswith("https://")


class TestNormalization:
    def test_normalize_hex_with_prefix(self):
        assert normalize_hex("0xABCD") == "0xabcd"

    def test_normalize_hex_without_prefix(self):
        assert normalize_hex("ABCD") == "0xabcd"

    def test_normalize_hex_with_whitespace(self):
        assert normalize_hex("  0xABCD  ") == "0xabcd"

    def test_normalize_address(self):
        addr = normalize_address("0xaF8e5de153A584528B57DD4B9B0195956BBDF571")
        assert addr == "0xaf8e5de153a584528b57dd4b9b0195956bbdf571"

    def test_normalize_address_without_prefix(self):
        addr = normalize_address("aF8e5de153A584528B57DD4B9B0195956BBDF571")
        assert addr == "0xaf8e5de153a584528b57dd4b9b0195956bbdf571"


USDC_TOKEN_ID = "0xc719650e9f4b0f27d956638c54518932ef9d15e720a1a2b2850250bcd0816514"


class TestTokens:
    def test_supported_tokens(self):
        assert USDC_TOKEN_ID in SUPPORTED_TOKENS
        usdc = SUPPORTED_TOKENS[USDC_TOKEN_ID]
        assert usdc.symbol == "USDC"
        assert usdc.decimals == 6
        assert usdc.name == "USD Coin"

    def test_get_token_config(self):
        config = get_token_config(USDC_TOKEN_ID)
        assert config.symbol == "USDC"

    def test_get_token_by_id(self):
        token = get_token_by_id(USDC_TOKEN_ID)
        assert token is not None
        assert token.symbol == "USDC"

    def test_get_token_by_id_case_insensitive(self):
        token = get_token_by_id(USDC_TOKEN_ID.upper())
        assert token is not None

    def test_get_token_by_id_not_found(self):
        zero_id = "0x" + "0" * 64
        token = get_token_by_id(zero_id)
        assert token is None

    def test_is_valid_token(self):
        assert is_valid_token(USDC_TOKEN_ID) is True
        assert is_valid_token("INVALID") is False


class TestChains:
    def test_supported_chains(self):
        assert len(SUPPORTED_CHAINS) >= 1
        base_sepolia = SUPPORTED_CHAINS[0]
        assert base_sepolia.id == 84532
        assert base_sepolia.name == "Base Sepolia"

    def test_get_chain_by_id(self):
        chain = get_chain_by_id(84532)
        assert chain is not None
        assert chain.name == "Base Sepolia"

    def test_get_chain_by_id_not_found(self):
        assert get_chain_by_id(99999) is None

    def test_get_explorer_address_url(self):
        url = get_explorer_address_url(84532, "0xabc")
        assert url is not None
        assert "sepolia.basescan.org" in url
        assert "0xabc" in url

    def test_get_explorer_address_url_not_found(self):
        assert get_explorer_address_url(99999, "0xabc") is None

    def test_get_all_tokens(self):
        tokens = get_all_tokens()
        assert len(tokens) >= 1
        assert any(t.symbol == "USDC" for t in tokens)
