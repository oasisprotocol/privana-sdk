import { describe, expect, test } from 'bun:test'
import { didWithdrawalLand } from '../src/sdk/hooks/use-withdraw'

const USER = '0x000000000000000000000000000000000000dEaD'

const reader = (nonce: string) => ({
  getWithdrawalNonce: async () => ({ nonce }),
})

describe('didWithdrawalLand', () => {
  test('an advanced nonce proves the withdrawal was accepted', async () => {
    expect(await didWithdrawalLand(reader('4'), USER, 3n)).toBe(true)
  })

  test('an unchanged nonce means the withdrawal did not land', async () => {
    expect(await didWithdrawalLand(reader('3'), USER, 3n)).toBe(false)
  })

  test('a failing nonce check reports false so the original error surfaces', async () => {
    const failing = {
      getWithdrawalNonce: async (): Promise<{ nonce: string }> => {
        throw new Error('network unreachable')
      },
    }
    expect(await didWithdrawalLand(failing, USER, 3n)).toBe(false)
  })
})
