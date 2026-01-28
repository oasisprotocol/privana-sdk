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
        <FlexvaultsProvider network="testnet">
          <YourApp />
        </FlexvaultsProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

### 2. Use the FlexvaultsButton

```tsx
import { FlexvaultsButton } from '@oasisprotocol/flexvaults-sdk'

function MyComponent() {
  return <FlexvaultsButton />
}
```

### 3. Or build custom UI with hooks

```tsx
import { useBalance, useDeposit, useWithdraw } from '@oasisprotocol/flexvaults-sdk'

function CustomWallet() {
  const { data: balance } = useBalance({ token: 'USDC' })
  const { mutate: deposit } = useDeposit()
  const { mutate: withdraw } = useWithdraw()

  return (
    <div>
      <p>Balance: {balance?.available}</p>
      <button onClick={() => deposit({ amount: '100', token: 'USDC' })}>Deposit</button>
    </div>
  )
}
```

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
| `usePendingWithdrawals` | Get pending withdrawal requests        |
| `useExpiredLocks`       | Get expired locks that can be claimed  |

## License

MIT
