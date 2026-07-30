# @oasisprotocol/privana-sdk

React SDK for Privana - manage deposits, withdrawals, locks, and transfers with ease.

## Installation

```bash
npm install @oasisprotocol/privana-sdk
# or
bun add @oasisprotocol/privana-sdk
```

## Peer Dependencies

This SDK requires the following peer dependencies:

```bash
npm install react react-dom wagmi viem @tanstack/react-query
```

## Quick Start

### 1. Wrap your app with the PrivanaProvider

```tsx
import { PrivanaProvider } from '@oasisprotocol/privana-sdk'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider } from '@tanstack/react-query'

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <PrivanaProvider
          networkConfig={{
            name: 'Sapphire Testnet',
            chainId: 23295,
            apiUrl: 'https://api.testnet.privana.finance',
            accountingContract: '0xYourContractAddress',
          }}
          hostedAuth={{
            clientId: 'honoroll-web',
            redirectUri: 'https://honoroll.example.com/auth/callback',
          }}
        >
          <YourApp />
        </PrivanaProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

`accountingContract` must be the deployed Privana accounting contract address for the same
environment as `apiUrl`.

### 2. Or build custom UI with hooks

```tsx
import {
  useBalance,
  useDeposit,
  useTotalLockedBalance,
  useWithdraw,
} from '@oasisprotocol/privana-sdk'

function CustomWallet() {
  const { balanceFormatted } = useBalance()
  const { totalLocked } = useTotalLockedBalance()
  const { deposit } = useDeposit()
  const { withdraw } = useWithdraw()

  return (
    <div>
      <p>Available: {balanceFormatted}</p>
      <p>Total locked: {totalLocked}</p>
      <button onClick={() => deposit({ amount: 1000000n, tokenId: '0xYourTokenId' })}>
        Deposit
      </button>
    </div>
  )
}
```

## Private Reads

`useBalance`, `useBatchBalances`, `useHistory`, `useLockedFunds`, `useExpiredLocks`, and
`useTotalLockedBalance` support two auth modes:

`useHistory({ offset: -1, limit: 50 })` fetches one authenticated history page. Non-negative
offsets count pages from the oldest entries, negative offsets count from the end, and each page is
returned oldest-to-newest. `limit` must be between 0 and 100.
History entries include lock-lifecycle kinds (`modifyLock`, `unlockLock`) and directional transfer
kinds (`transferFromLockOut`/`transferFromLockIn`, `transferBalanceOut`/`transferBalanceIn`). On the
outbound (`Out`) kinds `counterparty` is the recipient, and on the inbound (`In`) kinds it is the
sender.

### Direct SIWE private reads

Default mode for same-origin Privana browser integrations:

- `GET /v1/accounting/auth/domain`
- `GET /v1/accounting/auth/nonce?address=0x...`
- `POST /v1/accounting/auth/login`

The hooks cache the returned `X-SIWE-Token`, dedupe concurrent auth so a group of mounted
private-read hooks only triggers one sign prompt, and retry once on `401` by re-authenticating
through the same shared in-flight auth request.

### Direct in-app SIWE auth (`siweAuth`)

For same-origin apps that want an explicit authenticated session (and JWT-authenticated writes),
enable `siweAuth` on `PrivanaProvider`. The connected wallet signs an EIP-4361 message in-app and
`useSiweAuth()` exposes `login`, `logout`, `session`, and the raw `tokens`:

```tsx
import { PrivanaProvider, useSiweAuth } from '@oasisprotocol/privana-sdk'
;<PrivanaProvider siweAuth={{ autoLogin: true }}>
  <AuthGate />
</PrivanaProvider>
```

`siweAuth` accepts `true`, or an object with `autoLogin` (default `true`) and `persistJwt`
(default `false`). It is mutually exclusive with `hostedAuth`.

#### Persistent JWT sessions (`persistJwt`)

Set `persistJwt: true` to mirror the session in `localStorage` (key scoped by API URL and chain ID)
so a page reload restores an active session without another signature prompt:

```tsx
;<PrivanaProvider siweAuth={{ autoLogin: true, persistJwt: true }}>
  <App />
</PrivanaProvider>
```

Logout captures the refresh token, clears local and cross-tab state immediately, suppresses
automatic re-login, and attempts server-side revocation.

> **Security note:** storing long-lived refresh credentials in `localStorage` makes them reachable
> from any JavaScript running on the page. An XSS vulnerability could exfiltrate them and forge a
> session, so only enable `persistJwt` on origins you fully control.

### Hosted redirect auth for cross-domain apps

For widget or cross-domain frontends, configure `hostedAuth` on `PrivanaProvider` and use
`useHostedRedirectAuth()` to start the hosted sign-in and complete it on your callback route:

```tsx
import { PrivanaProvider, useBalance, useHostedRedirectAuth } from '@oasisprotocol/privana-sdk'

function HostedAuthButton() {
  const { login, logout, refresh, isAuthenticated, isLoading, error, session } =
    useHostedRedirectAuth()
  const { balanceFormatted } = useBalance()

  return (
    <div>
      <button onClick={() => void login()} disabled={isLoading || isAuthenticated}>
        Sign in with Privana
      </button>
      {isAuthenticated ? <button onClick={() => void refresh()}>Refresh Session</button> : null}
      {isAuthenticated ? <button onClick={() => void logout()}>Logout</button> : null}
      {session ? <p>Signed in as {session.address}</p> : null}
      {error ? <p>{error.message}</p> : null}
      <p>Balance: {balanceFormatted}</p>
    </div>
  )
}
```

```tsx
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useHostedRedirectAuth } from '@oasisprotocol/privana-sdk'

function HostedAuthCallbackPage() {
  const router = useRouter()
  const { completeLogin } = useHostedRedirectAuth()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void completeLogin()
      .then((session) => {
        if (!session) {
          setError('No hosted authentication response was found.')
          return
        }
        router.replace('/')
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Hosted authentication failed.')
      })
  }, [completeLogin, router])

  if (error) return <p>Error: {error}</p>
  return <p>Completing sign-in…</p>
}
```

In hosted-auth mode:

- the SDK stores PKCE and `state` in `sessionStorage`, then redirects the browser to the hosted `/auth/authorize` page on the Privana auth origin
- the hosted auth page signs on the current wallet chain if it is supported, otherwise it switches to the provider `networkConfig.chainId`
- the hosted auth page redirects back to your registered callback URL with `code` / `state` or `error`
- your callback route calls `completeLogin()` to exchange the code at `/auth/token`
- private-read hooks use `Authorization: Bearer <access_token>` and refresh once through
  `/auth/jwt/refresh` on `401`

Notes:

- low-level `PrivanaClient.getHostedAuthAuthorizeUrl()` still mirrors backend authorize URL support and can build either response mode explicitly.
- consumer apps must implement a callback route at the exact registered `redirect_uri`.
- `client_id` and exact `redirect_uri` values must be registered in backend `AUTH_CLIENTS`.
- staging end-to-end verification requires that registration on the staging deployment.
- the standalone localhost popup page used during Firefox debugging was diagnostic only; it is not part of the supported SDK integration path.

## Hooks

| Hook                     | Description                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `useHostedRedirectAuth`  | Hosted redirect auth for widget apps                                                                               |
| `useBalance`             | Get token balance (available + locked)                                                                             |
| `useBatchBalances`       | Get multiple token balances                                                                                        |
| `useDeposit`             | Deposit tokens                                                                                                     |
| `useDepositVerification` | Run checkDeposit + status polling against an existing on-chain transfer (used by `useDeposit` and `useFiatOnRamp`) |
| `useFiatOnRamp`          | MoonPay on-ramp with provider-neutral recovery, verification, credit, and locking (from `/on-ramp` sub-export)     |
| `useWithdraw`            | Withdraw tokens                                                                                                    |
| `useLockFunds`           | Lock funds for a recipient                                                                                         |
| `useUnlockFunds`         | Unlock expired locks                                                                                               |
| `useTransfer`            | Transfer tokens                                                                                                    |
| `useLockedFunds`         | Get list of locked funds                                                                                           |
| `useTotalLockedBalance`  | Get total locked balance for one token                                                                             |
| `useHistory`             | Get authenticated account activity                                                                                 |
| `usePendingWithdrawals`  | Get pending withdrawal requests                                                                                    |
| `useExpiredLocks`        | Get expired locks that can be claimed                                                                              |
| `useTokenList`           | List all registered tokens                                                                                         |
| `useTokenInfo`           | Get info for a single token                                                                                        |

## Fiat On-Ramp

The fiat on-ramp lets users buy tokens with a card and have them credited to
their Privana balance in one flow. An internal provider-neutral core owns
recovery, receipt verification, `/deposits/check`, credit, and optional
post-credit locking. MoonPay launch and widget behavior live in a thin adapter.

**The provider delivers the purchased token directly to the server-derived
Privana deposit address. Provider orders, amounts, events, and webhooks are
correlation hints only; the matching on-chain transfer remains authoritative.**

Exported from a separate entry point so consumers who don't use the on-ramp
don't pay the bundle cost of `@moonpay/moonpay-react`:

```tsx
import { FiatOnRampForm, useFiatOnRamp } from '@oasisprotocol/privana-sdk/on-ramp'
```

### Setup

The SDK ships `@moonpay/moonpay-react` as a regular dependency, so it lands in
your `node_modules` automatically. If you import `<MoonPayProvider>` directly
(see below) you may also want to declare it in your own `package.json` to keep
your dependency surface explicit:

```bash
npm install @moonpay/moonpay-react
```

Wrap your app in `<MoonPayProvider>` (only on routes that use the on-ramp,
to keep MoonPay out of unrelated bundles):

```tsx
import { MoonPayProvider } from '@moonpay/moonpay-react'
;<MoonPayProvider apiKey={import.meta.env.VITE_MOONPAY_API_KEY} debug={import.meta.env.DEV}>
  {/* on-ramp routes */}
</MoonPayProvider>
```

### Quick start with `<FiatOnRampForm>`

```tsx
import { FiatOnRampForm } from '@oasisprotocol/privana-sdk/on-ramp'
;<FiatOnRampForm
  tokenId="0x..." // Privana token id (e.g. USDC on Base)
  currencyCode="usdc_base" // MoonPay currency code; test/live is controlled by the apiKey (pk_test_* → testnet, pk_live_* → mainnet)
  baseCurrencyCode="usd" // optional, defaults to "usd"
  defaultBaseCurrencyAmount="100" // optional pre-fill (MoonPay still lets the user edit)
  onCredited={(txHash) => console.log('credited', txHash)}
  onError={(err) => console.error(err)}
/>
```

The form:

- fetches the user's Privana deposit address and passes it to MoonPay as the
  destination,
- sets `externalCustomerId = address.toLowerCase()` so the backend can bind the
  MoonPay transaction to the SIWE-authenticated user,
- creates a backend on-ramp intent (`POST /onramp/intent`) and passes its id to
  MoonPay as `externalTransactionId` for exact authenticated recovery,
- persists at most ten unresolved signed intents under the authenticated user
  and sends them as repeated `externalTransactionId` values on pending reads,
- gates the "Buy" button on the configured token's minimum deposit (input-time
  check) and double-checks the delivered amount before triggering verification,
- on MoonPay's `transaction_created`, fire-and-forget calls
  `POST /onramp/{id}` with the MoonPay transaction id so the backend can
  reconcile both ids during provider reads,
- treats MoonPay events as wake-up hints, polls the authenticated pending read
  for the provider transaction and on-chain hash, derives the delivered amount
  from matching receipt logs, then triggers Privana verification
  (`checkDeposit` + status polling).

### `useFiatOnRamp` for custom UI

If you need a different shell around the MoonPay widget, use the hook
directly and wire MoonPay's widget callbacks yourself:

```tsx
import { MoonPayBuyWidget } from '@moonpay/moonpay-react'
import { useFiatOnRamp } from '@oasisprotocol/privana-sdk/on-ramp'

const {
  status, // 'idle' | 'awaiting-purchase' | 'awaiting-delivery' | 'verifying' | 'credited' | 'failed'
  activeIntentId, // pass to MoonPay as externalTransactionId
  pending, // recovery list (completed-but-unverified)
  error,
  depositAddress, // pass to MoonPay as walletAddress
  minDepositBaseUnits, // for input validation
  selectedToken, // resolved token config (decimals/symbol for the configured tokenId)
  prepareOnRampIntent, // call before opening the widget
  signUrl, // wire to onUrlSignatureRequested
  handleTransactionCreated, // wire to onTransactionCreated
  handleTransactionCompleted, // wire to onTransactionCompleted
  handleWidgetClosed, // call from onClose / onCloseOverlay
  finishPendingVerification, // call from the recovery CTA
  refreshPending, // manual refresh of the pending list
} = useFiatOnRamp({ tokenId, onCredited, onError })
```

### Pending / recovery

If the user closes or reloads between launch and verification, the SDK reloads
its bounded signed-intent set and combines exact provider lookups with the
authenticated derived-wallet lookup. A corrupt local intent is isolated and
removed without blocking valid recovery. Render `pending` with a "Finish
verification" CTA that calls `finishPendingVerification(record)` — no wallet
signature is required for deposit verification.

### Required backend endpoints

The `useFiatOnRamp` hook + form call:

- `POST /v1/accounting/onramp/sign-url` — HMAC-signs the MoonPay widget URL
- `POST /v1/accounting/onramp/intent` — mints a signed provider/user/wallet/token/chain/asset intent
- `POST /v1/accounting/onramp/{transaction_id}` — validates and echoes MoonPay compatibility metadata without becoming order state
- `GET /v1/accounting/onramp/pending` — bounded provider reads for completed, strictly admitted transactions awaiting verification

And the existing deposit verification endpoints:

- `POST /v1/accounting/deposits/check`
- `GET /v1/accounting/deposits/status/{id}`

The MoonPay webhook (`POST /v1/accounting/onramp/moonpay/webhook`) is an optional
verified observability signal. It does not populate order state and is not
required for recovery or credit.

## License

Apache-2.0
