import { describe, expect, test } from 'bun:test'
import {
  chainFiltersFor,
  filterTokenItems,
  type TokenSelectListItem,
} from '../src/components/privana/token-select-list'

const items: TokenSelectListItem[] = [
  { id: '0x1', symbol: 'USDC', name: 'USD Coin', chainName: 'Base', decimals: 6 },
  { id: '0x2', symbol: 'ETH', name: 'Ether', chainName: 'Ethereum', decimals: 18 },
  { id: '0x3', symbol: 'USDC', name: 'USD Coin', chainName: 'Ethereum', decimals: 6 },
  { id: '0x4', symbol: 'HYPE', name: 'Hyperliquid', chainName: 'HyperEVM', decimals: 18 },
]

describe('filterTokenItems', () => {
  test('matches symbol and name, case-insensitively', () => {
    expect(filterTokenItems(items, 'usd', 'All').map((i) => i.id)).toEqual(['0x1', '0x3'])
    expect(filterTokenItems(items, 'HYPER', 'All').map((i) => i.id)).toEqual(['0x4'])
  })

  test('chain filter is exact and composes with the query', () => {
    expect(filterTokenItems(items, '', 'Ethereum').map((i) => i.id)).toEqual(['0x2', '0x3'])
    expect(filterTokenItems(items, 'usdc', 'Ethereum').map((i) => i.id)).toEqual(['0x3'])
  })

  test('empty query keeps everything', () => {
    expect(filterTokenItems(items, '   ', 'All')).toHaveLength(4)
  })
})

describe('chainFiltersFor', () => {
  test('All plus distinct chains in first-seen order', () => {
    expect(chainFiltersFor(items)).toEqual(['All', 'Base', 'Ethereum', 'HyperEVM'])
  })

  test('items without chain names are ignored', () => {
    expect(chainFiltersFor([{ id: 'x', symbol: 'X', decimals: 6 }])).toEqual(['All'])
  })
})
