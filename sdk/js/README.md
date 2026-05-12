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

## License

Apache-2.0
