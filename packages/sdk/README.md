# @oasisprotocol/flexvaults-sdk

React SDK for Flexvaults - manage deposits, withdrawals, locks, and transfers with ease.

## Installation

```bash
npm install @oasisprotocol/flexvaults-sdk
# or
bun add @oasisprotocol/flexvaults-sdk
```

## Peer Dependencies

This SDK requires the following peer dependencies:

```bash
npm install react react-dom wagmi viem @tanstack/react-query
```

## Quick Start

### 1. Wrap your app with the FlexvaultsProvider

```tsx
import { FlexvaultsProvider } from '@oasisprotocol/flexvaults-sdk'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider } from '@tanstack/react-query'

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <FlexvaultsProvider
          networkConfig={{
            name: 'Sapphire Testnet',
            chainId: 23295,
            apiUrl: 'https://flexvaults-staging.rofl.build',
            accountingContract: '0xYourContractAddress',
          }}
        >
          <YourApp />
        </FlexvaultsProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

`accountingContract` must be the deployed Flexvaults accounting contract address for the same
environment as `apiUrl`.

### 2. Use the FlexvaultsButton

```tsx
import { FlexvaultsButton } from '@oasisprotocol/flexvaults-sdk'

function MyComponent() {
  return <FlexvaultsButton />
}
```

### 3. Or build custom UI with hooks

```tsx
import {
  useBalance,
  useDeposit,
  useTotalLockedBalance,
  useWithdraw,
} from '@oasisprotocol/flexvaults-sdk'

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

`useBalance`, `useBatchBalances`, `useLockedFunds`, `useExpiredLocks`, and `useTotalLockedBalance`
use the backend's direct SIWE private-read flow:

- `GET /v1/accounting/auth/domain`
- `GET /v1/accounting/auth/nonce?address=0x...`
- `POST /v1/accounting/auth/login`

The hooks cache the returned `X-SIWE-Token`, dedupe concurrent auth so a group of mounted
private-read hooks only triggers one sign prompt, and retry once on `401` by re-authenticating
through the same shared in-flight auth request.

This package does **not** wrap the hosted `/auth/authorize` + `/auth/token` flow in this release.

## Components

### FlexvaultsButton

A customizable button that opens the wallet modal.

```tsx
// Basic usage
<FlexvaultsButton />

// Custom text
<FlexvaultsButton>Open Wallet</FlexvaultsButton>

// Custom styling
<FlexvaultsButton variant="default" size="lg" className="my-class" />

// Full control with render prop
<FlexvaultsButton
  renderButton={({ onClick, isOpen }) => (
    <MyButton onClick={onClick}>Custom Button</MyButton>
  )}
/>

// Show when wallet disconnected (disabled state)
<FlexvaultsButton hideWhenDisconnected={false} />
```

## Hooks

| Hook                    | Description                            |
| ----------------------- | -------------------------------------- |
| `useBalance`            | Get token balance (available + locked) |
| `useBatchBalances`      | Get multiple token balances            |
| `useDeposit`            | Deposit tokens                         |
| `useWithdraw`           | Withdraw tokens                        |
| `useLockFunds`          | Lock funds for a recipient             |
| `useUnlockFunds`        | Unlock expired locks                   |
| `useTransfer`           | Transfer tokens                        |
| `useLockedFunds`        | Get list of locked funds               |
| `useTotalLockedBalance` | Get total locked balance for one token |
| `usePendingWithdrawals` | Get pending withdrawal requests        |
| `useExpiredLocks`       | Get expired locks that can be claimed  |

## License

Apache-2.0
