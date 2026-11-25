import { describe, expect, it } from 'bun:test'
import { depositFinality, formatFinalityProgress } from '../src/sdk/utils/finality'
import type { DepositAddressResponse } from '../src/sdk/types'

const depositAddress = {
  deposit_address: '0x000000000000000000000000000000000000dEaD',
  chain_type: 'evm',
  version: 0,
  min_deposit: {},
  finality_depth: { '1': 32, '8453': 15 },
} as DepositAddressResponse

describe('deposit finality', () => {
  it('reads the chain finality depth from the deposit address response', () => {
    expect(depositFinality(depositAddress, 1)).toEqual({ chainId: 1, depth: 32 })
    expect(depositFinality(depositAddress, 8453)).toEqual({ chainId: 8453, depth: 15 })
  })

  it('is unknown for an unsupported chain or a missing response', () => {
    expect(depositFinality(depositAddress, 999)).toBeUndefined()
    expect(depositFinality(undefined, 1)).toBeUndefined()
    expect(depositFinality(depositAddress, undefined)).toBeUndefined()
  })

  it('formats the sweep confirmations for display', () => {
    expect(formatFinalityProgress({ confirmations: 12, required: 32 })).toBe('12/32 confirmations')
  })
})
