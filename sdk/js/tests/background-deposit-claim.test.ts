import { describe, expect, it } from 'bun:test'
import { AccountingApiError } from '../src/sdk/client'
import {
  followedAfterClaim,
  followedDepositOutcome,
} from '../src/sdk/context/background-deposit-claim'

describe('background deposit claim', () => {
  it('follows each newly claimed pending deposit once', () => {
    const followed = ['a']
    expect(
      followedAfterClaim(followed, [
        { status: 'pending', deposit_id: 'a' },
        { status: 'pending', deposit_id: 'b' },
        { status: 'pending', deposit_id: null },
        { status: 'error', deposit_id: 'c' },
      ])
    ).toEqual(['a', 'b'])
    expect(followedAfterClaim(followed, [{ status: 'pending', deposit_id: 'a' }])).toBe(followed)
  })

  it('settles a deposit once it is credited, failed or dropped', () => {
    expect(followedDepositOutcome({ status: 'credited' }, null)).toBe('credited')
    expect(followedDepositOutcome({ status: 'error' }, null)).toBe('dropped')
    expect(followedDepositOutcome(undefined, new AccountingApiError('Not found', 404))).toBe(
      'dropped'
    )
    expect(followedDepositOutcome({ status: 'pending' }, null)).toBeUndefined()
    expect(followedDepositOutcome(undefined, new AccountingApiError('Busy', 503))).toBeUndefined()
  })
})
