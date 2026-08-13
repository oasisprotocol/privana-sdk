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

Localhost is suitable for checking the harness, authentication, token/deposit data,
and backend errors. Do not start a purchase until all of these deployment gates are
confirmed:

1. Staging selects `ONRAMP_PROVIDER=transak`.
2. The backend receives a trusted proxy-owned client-IP header and its stable egress IP
   is allowlisted by Transak.
3. The preview is served from `https://app.testnet.privana.finance` or another exact
   staging origin approved by Transak.
4. The ROFL deployment has one active worker/token refresher and enough Base Sepolia
   gas.

Transak requires the configured `referrerDomain` to match the approved website and the
browser to preserve `Referer`. Widget URLs are single-use and expire after five
minutes. See the official [Create Widget URL](https://docs.transak.com/api/public/create-widget-url)
and [Partner FAQ](https://docs.transak.com/guides/partner-faqs).

### Manual test order

Run the basic purchase first with **Lock after credit** off:

1. Record the initial Privana balance, deposit address, and time.
2. Launch Transak and complete one staging USDC/Base purchase.
3. Confirm the UI progresses through delivery and verification to `credited`.
4. Confirm the balance increase equals the matching ERC-20 `Transfer` log amount.
5. Save the diagnostic JSON, intent ID, provider order ID, source transaction hash,
   deposit ID, and timestamps. Do not save session URLs, auth tokens, or signatures.

Then exercise recovery with fresh purchases:

- close the widget before a provider event, refresh the page, and finish from the
  pending list;
- let a session expire, then use **Reopen checkout** and confirm a fresh URL is used;
- retry a row while source-chain finality is still insufficient;
- complete two purchases and verify that each intent credits exactly once.

Finally, run the optional lock pass. Enable **Lock after credit** and enter the target
crypto amount. After Transak opens, adjust the editable fiat payment until the estimated
crypto receipt is at least that target. Sign the buffered lock before launch, and confirm
the deposit credits before the lock is submitted to the configured Honoroll testnet service.
If lock submission fails, confirm the credited funds remain available and record the
same-signature recovery state.
