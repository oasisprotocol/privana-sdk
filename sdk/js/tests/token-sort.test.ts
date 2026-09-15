import { describe, expect, test } from 'bun:test'
import { sortTokensByBalance } from '../src/sdk/utils/token-sort'

const usdc = { name: 'USD Coin', decimals: 6 }
const eth = { name: 'Ether', decimals: 18 }
const hype = { name: 'Hyperliquid', decimals: 18 }

describe('sortTokensByBalance', () => {
  test('funded tokens rank by display amount, not base units', () => {
    const balances = new Map<object, bigint>([
      [usdc, 14_000_000n],
      [eth, 1_000_000_000_000_000n],
    ])
    const sorted = sortTokensByBalance([eth, usdc], (t) => balances.get(t))
    expect(sorted.map((t) => t.name)).toEqual(['USD Coin', 'Ether'])
  })

  test('zero and unknown balances go last, alphabetically', () => {
    const balances = new Map<object, bigint>([
      [eth, 5n],
      [usdc, 0n],
    ])
    const sorted = sortTokensByBalance([usdc, hype, eth], (t) => balances.get(t))
    expect(sorted.map((t) => t.name)).toEqual(['Ether', 'Hyperliquid', 'USD Coin'])
  })

  test('equal display amounts tie-break by name', () => {
    const one = { name: 'B Token', decimals: 6 }
    const two = { name: 'A Token', decimals: 18 }
    const balances = new Map<object, bigint>([
      [one, 1_000_000n],
      [two, 10n ** 18n],
    ])
    const sorted = sortTokensByBalance([one, two], (t) => balances.get(t))
    expect(sorted.map((t) => t.name)).toEqual(['A Token', 'B Token'])
  })

  test('an all-zero list is purely alphabetical and input is not mutated', () => {
    const input = [hype, usdc, eth]
    const sorted = sortTokensByBalance(input, () => 0n)
    expect(sorted.map((t) => t.name)).toEqual(['Ether', 'Hyperliquid', 'USD Coin'])
    expect(input.map((t) => t.name)).toEqual(['Hyperliquid', 'USD Coin', 'Ether'])
  })
})
