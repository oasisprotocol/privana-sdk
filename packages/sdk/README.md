# @encumbered/sdk

React SDK for the Encumbered Accounting Module - manage deposits, withdrawals, locks, and transfers with ease.

## Installation

```bash
npm install @encumbered/sdk
# or
bun add @encumbered/sdk
```

## Peer Dependencies

This SDK requires the following peer dependencies:

```bash
npm install react react-dom wagmi viem @tanstack/react-query
```

## Quick Start

### 1. Wrap your app with the AccountingProvider

```tsx
import { AccountingProvider } from '@encumbered/sdk'
import { WagmiProvider } from 'wagmi'
import { QueryClientProvider } from '@tanstack/react-query'

function App() {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AccountingProvider network="testnet">
          <YourApp />
        </AccountingProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
```

### 2. Use the EncumberedWalletButton

```tsx
import { EncumberedWalletButton } from '@encumbered/sdk'

function MyComponent() {
  return <EncumberedWalletButton />
}
```

### 3. Or build custom UI with hooks

```tsx
import { useBalance, useDeposit, useWithdraw } from '@encumbered/sdk'

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

### EncumberedWalletButton

A customizable button that opens the wallet modal.

```tsx
// Basic usage
<EncumberedWalletButton />

// Custom text
<EncumberedWalletButton>Open Wallet</EncumberedWalletButton>

// Custom styling
<EncumberedWalletButton variant="default" size="lg" className="my-class" />

// Full control with render prop
<EncumberedWalletButton
  renderButton={({ onClick, isOpen }) => (
    <MyButton onClick={onClick}>Custom Button</MyButton>
  )}
/>

// Show when wallet disconnected (disabled state)
<EncumberedWalletButton hideWhenDisconnected={false} />
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
