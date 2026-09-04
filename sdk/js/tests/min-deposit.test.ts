import { describe, expect, test } from 'bun:test'
import { getMinDepositBaseUnits } from '../src/sdk/utils/min-deposit'
import type { DepositAddressResponse } from '../src/sdk/types'

const response: DepositAddressResponse = {
  deposit_address: '0x4A7c9E21d3F08b556E5a1fD9C3b82B44Aa61eF02',
  chain_type: 'evm',
  version: 0,
  min_deposit: {
    '1': { native: '2000000000000000', erc20: '1000000' },
    '999': { native: '50000000000000000', erc20: '1000000' },
  },
  finality_depth: { '1': 32, '999': 10 },
}

describe('getMinDepositBaseUnits', () => {
  test('picks the native or erc20 floor for the chain', () => {
    expect(getMinDepositBaseUnits(response, 1, 'native')).toBe(2_000_000_000_000_000n)
    expect(getMinDepositBaseUnits(response, 1, 'erc20')).toBe(1_000_000n)
    expect(getMinDepositBaseUnits(response, 999, 'native')).toBe(50_000_000_000_000_000n)
  })

  test('returns undefined when the response or chain entry is missing', () => {
    expect(getMinDepositBaseUnits(undefined, 1, 'native')).toBeUndefined()
    expect(getMinDepositBaseUnits(response, 8453, 'erc20')).toBeUndefined()
    expect(
      getMinDepositBaseUnits({ ...response, min_deposit: undefined! }, 1, 'native')
    ).toBeUndefined()
  })

  test('returns undefined for malformed or negative values', () => {
    const bad: DepositAddressResponse = {
      ...response,
      min_deposit: { '1': { native: 'not-a-number', erc20: '-5' } },
    }
    expect(getMinDepositBaseUnits(bad, 1, 'native')).toBeUndefined()
    expect(getMinDepositBaseUnits(bad, 1, 'erc20')).toBeUndefined()
  })
})
