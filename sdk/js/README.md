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
            apiUrl: 'https://testnet.privana.finance',
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

### 2. Use the PrivanaButton

```tsx
import { PrivanaButton } from '@oasisprotocol/privana-sdk'

function MyComponent() {
  return <PrivanaButton />
}
```

### 3. Or build custom UI with hooks

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

### Direct SIWE private reads

Default mode for same-origin Privana browser integrations:

- `GET /v1/accounting/auth/domain`
- `GET /v1/accounting/auth/nonce?address=0x...`
- `POST /v1/accounting/auth/login`

The hooks cache the returned `X-SIWE-Token`, dedupe concurrent auth so a group of mounted
private-read hooks only triggers one sign prompt, and retry once on `401` by re-authenticating
through the same shared in-flight auth request.

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

## Components

### PrivanaButton

A customizable button that opens the wallet modal.

```tsx
// Basic usage
<PrivanaButton />

// Custom text
<PrivanaButton>Open Wallet</PrivanaButton>

// Custom styling
<PrivanaButton variant="default" size="lg" className="my-class" />

// Full control with render prop
<PrivanaButton
  renderButton={({ onClick, isOpen }) => (
    <MyButton onClick={onClick}>Custom Button</MyButton>
  )}
/>

// Show when wallet disconnected (disabled state)
<PrivanaButton hideWhenDisconnected={false} />
```

## Hooks

| Hook                    | Description                            |
| ----------------------- | -------------------------------------- |
| `useHostedRedirectAuth` | Hosted redirect auth for widget apps   |
| `useBalance`            | Get token balance (available + locked) |
| `useBatchBalances`      | Get multiple token balances            |
| `useDeposit`            | Deposit tokens                         |
| `useDepositVerification`| Run checkDeposit + status polling against an existing on-chain transfer (used by `useDeposit` and `useFiatOnRamp`) |
| `useFiatOnRamp`         | Buy crypto via MoonPay; delivered straight to the Privana deposit address (from `/on-ramp` sub-export) |
| `useWithdraw`           | Withdraw tokens                        |
| `useLockFunds`          | Lock funds for a recipient             |
| `useUnlockFunds`        | Unlock expired locks                   |
| `useTransfer`           | Transfer tokens                        |
| `useLockedFunds`        | Get list of locked funds               |
| `useTotalLockedBalance` | Get total locked balance for one token |
| `useHistory`            | Get authenticated account activity     |
| `usePendingWithdrawals` | Get pending withdrawal requests        |
| `useExpiredLocks`       | Get expired locks that can be claimed  |
| `useTokenList`          | List all registered tokens             |
| `useTokenInfo`          | Get info for a single token            |

## Fiat On-Ramp

The fiat on-ramp lets users buy USDC with a card and have it credited
to their Privana balance in one flow. **MoonPay delivers USDC directly
to the user's Privana deposit address** — the connected wallet is only
used for SIWE auth and signs no on-chain transfer.

Exported from a separate entry point so consumers who don't use the
on-ramp don't pay the bundle cost of `@moonpay/moonpay-react`:

```tsx
import { FiatOnRampForm, useFiatOnRamp } from '@oasisprotocol/privana-sdk/on-ramp'
```

### Setup

Install MoonPay's React kit as a peer:

```bash
yarn add @moonpay/moonpay-react @moonpay/moonpay-js
```

Wrap your app in `<MoonPayProvider>` (only on routes that use the on-ramp,
to keep MoonPay out of unrelated bundles):

```tsx
import { MoonPayProvider } from '@moonpay/moonpay-react'

<MoonPayProvider apiKey={import.meta.env.VITE_MOONPAY_API_KEY} debug={import.meta.env.DEV}>
  {/* on-ramp routes */}
</MoonPayProvider>
```

### Quick start with `<FiatOnRampForm>`

```tsx
import { FiatOnRampForm } from '@oasisprotocol/privana-sdk/on-ramp'

<FiatOnRampForm
  tokenId="0x..."                  // Privana token id (e.g. USDC on Base)
  currencyCode="usdc_base"         // MoonPay's currency code; test/live is controlled by the apiKey (pk_test_* → Base Sepolia, pk_live_* → Base mainnet)
  baseCurrencyCode="usd"           // optional, defaults to "usd"
  defaultBaseCurrencyAmount="100"  // optional pre-fill (MoonPay still lets the user edit)
  onCredited={(txHash) => console.log('credited', txHash)}
  onError={(err) => console.error(err)}
/>
```

The form:

- fetches the user's Privana deposit address and passes it to MoonPay as the
  destination,
- sets `externalCustomerId = address.toLowerCase()` so the backend can bind
  the MoonPay transaction to the SIWE-authenticated user,
- gates the "Buy" button on the configured token's minimum deposit (input-time
  check) and double-checks the delivered amount before triggering verification,
- on MoonPay's `transaction_created`, fire-and-forget calls
  `POST /onramp/{id}` with the Privana `token_id` + `chain_id` so the backend
  knows which Privana token to credit when the delivery webhook arrives,
- listens for MoonPay's `transaction_completed` event, waits up to 60s for the
  backend webhook to surface the on-chain tx hash, then triggers Privana
  verification (`checkDeposit` + status polling).

### `useFiatOnRamp` for custom UI

If you need a different shell around the MoonPay widget, use the hook
directly and wire MoonPay's widget callbacks yourself:

```tsx
import { MoonPayBuyWidget } from '@moonpay/moonpay-react'
import { useFiatOnRamp } from '@oasisprotocol/privana-sdk/on-ramp'

const {
  status,                         // 'idle' | 'awaiting-purchase' | 'awaiting-delivery' | 'verifying' | 'credited' | 'failed'
  pending,                        // recovery list (completed-but-unverified)
  error,
  depositAddress,                 // pass as MoonPay's walletAddress
  minDepositBaseUnits,            // for input validation
  signUrl,                        // wire to onUrlSignatureRequested
  handleTransactionCreated,       // wire to onTransactionCreated
  handleTransactionCompleted,     // wire to onTransactionCompleted
  finishPendingVerification,      // call from the recovery CTA
} = useFiatOnRamp({ tokenId, onCredited, onError })
```

### Pending / recovery

If the user closes the tab between MoonPay completion and verification, the
backend has already received the webhook and the row appears in `pending`.
Render the list with a "Finish verification" CTA that calls
`finishPendingVerification(record)` — no wallet signature required, just the
verification poll.

### Required backend endpoints

The `useFiatOnRamp` hook + form call:

- `POST /v1/accounting/onramp/sign-url` — HMAC-signs the MoonPay widget URL
- `POST /v1/accounting/onramp/{transaction_id}` — registers the Privana `token_id` + `chain_id` for the MoonPay transaction (fire-and-forget on `transaction_created`)
- `GET /v1/accounting/onramp/pending` — completed MoonPay txs awaiting verification

And the existing deposit verification endpoints:

- `POST /v1/accounting/deposits/check`
- `GET /v1/accounting/deposits/status/{id}`

MoonPay → backend webhook (`POST /v1/accounting/onramp/webhook`) is what
populates the pending list with the on-chain tx hash. Configure that URL in
your MoonPay dashboard.

## License

Apache-2.0
