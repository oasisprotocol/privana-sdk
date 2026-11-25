import { describe, expect, test } from 'bun:test'
import { getMinDepositBaseUnits } from '../src/sdk/utils/min-deposit'

const USDC = '0x5e7facf6b7b5b9887e41398db2ae1990ff7e379d17fedb428b04265d748b33b2'
const ETH = '0xe5e6c795953f93ec9c872a4a6000788aacf182163c7abf8a5e982fedcd9f1620'

describe('getMinDepositBaseUnits', () => {
  test('reads the minimum by tokenId; an unlisted token has none', () => {
    const minDeposits = { [USDC]: '1000000' }
    expect(getMinDepositBaseUnits(minDeposits, '0x' + USDC.slice(2).toUpperCase())).toBe(1_000_000n)
    expect(getMinDepositBaseUnits(minDeposits, ETH)).toBe(0n)
  })

  test('returns undefined when the minimums are not loaded or malformed', () => {
    expect(getMinDepositBaseUnits(undefined, USDC)).toBeUndefined()
    expect(getMinDepositBaseUnits({ [USDC]: '-5' }, USDC)).toBeUndefined()
    expect(getMinDepositBaseUnits({ [USDC]: 'not-a-number' }, USDC)).toBeUndefined()
  })
})
