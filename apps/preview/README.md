# Privana SDK Preview

Next.js app that showcases the Privana SDK features.

## Environment

Create `apps/preview/.env.local`:

```bash
NEXT_PUBLIC_PRIVANA_API_URL=https://api.testnet.privana.finance

# Optional when using WalletConnect. An injected wallet such as MetaMask works without it.
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=...

# Needed only for the MoonPay regression tab.
NEXT_PUBLIC_MOONPAY_API_KEY=pk_test_...
```

The component preview preserves the legacy MoonPay card flow when no explicit
on-ramp provider is set. To exercise the provider-neutral product modal with
Transak, also set:

```env
NEXT_PUBLIC_ONRAMP_PROVIDER=transak
NEXT_PUBLIC_ONRAMP_TOKEN_ID=0x...
NEXT_PUBLIC_ONRAMP_ASSET_CODE=usdc
```

If any explicit value is invalid or the token is not enabled, the card flow is
shown as unavailable and does not fall back to MoonPay.

Never place a Transak API key, API secret, Partner Access Token, widget URL, or Privana
auth token in this file. Transak session creation is backend-only.

## Transak staging preview

From the repository root:

```bash
bun install --frozen-lockfile
bun run dev
```

Open `http://localhost:3000/on-ramp`. The Transak tab is selected by default and uses
the registered Base Sepolia TRNSK token. Connect a wallet and approve SIWE when the
first authenticated staging request prompts for it.

Localhost can validate the SDK UI and launch boundary only. End-to-end checkout
requires the deployed Testnet backend, the same-origin Cloudflare attestation route,
and an exact HTTPS origin approved by Transak. Do not start a purchase until all of
these deployment gates are confirmed:

1. Staging selects `ONRAMP_PROVIDER=transak`.
2. The Cloudflare zone rate-limit rule is verified to run before the Worker.
3. The same-origin `/__onramp-ip-attest` Worker and backend attested mode share the
   provisioned secret.
4. The backend's stable egress IPs are verified and allowlisted by Transak.
5. The preview is served from `https://app.testnet.privana.finance` or another exact
   staging origin approved by Transak.
6. The ROFL deployment has one active worker/token refresher and enough Base Sepolia
   gas.

Transak requires the configured `referrerDomain` to match the approved website and the
browser to preserve `Referer`. Widget URLs are single-use and expire after five
minutes. See the official [Create Widget URL](https://docs.transak.com/api/public/create-widget-url)
and [Partner FAQ](https://docs.transak.com/guides/partner-faqs).

For the no-payment expiry check, enable **Defer iframe mount**, launch a session,
wait beyond its expiry, then choose **Mount deferred checkout**.

### Product modal acceptance

Review the shipped flow from `/`: open **Deposit Modal**, select **Credit Card** and
**Buy with card**, enter the target amount, then choose **Continue**. Confirm the next
screen shows the target receipt before the checkout action and, when a policy is present,
labels that action **Sign policy and open checkout**. Localhost can verify this path up to
the launch boundary; complete the purchase after deploying the same preview to the exact
Transak-approved staging origin.

### Controlled staging purchase

Run one purchase with **Lock after credit** off:

1. Record the initial Privana balance, deposit address, and time.
2. Enter at least the displayed minimum target, launch Transak, confirm “You receive” meets it,
   then complete one staging USDC purchase that delivers Base Sepolia TRNSK.
3. Confirm the UI progresses through delivery and verification to `credited`.
4. Confirm the balance increase equals the matching ERC-20 `Transfer` log amount.
5. Save the diagnostic JSON, intent ID, provider order ID, source transaction hash,
   deposit ID, and timestamps. Do not save session URLs, auth tokens, or signatures.

The broader recovery and optional lock test matrix is tracked in
[issue #113](https://github.com/oasisprotocol/privana-sdk/issues/113).
