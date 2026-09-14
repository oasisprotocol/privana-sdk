import { describe, expect, test } from 'bun:test'
import { classifyFailedSubmit } from '../src/sdk/hooks/use-withdraw'

const USER = '0x000000000000000000000000000000000000dEaD'
const TOKEN = '0xAAbb000000000000000000000000000000000000000000000000000000000001'

const reader = ({
  nonce = '4',
  pending = [] as { token_id: string; amount: string }[],
  nonceFails = false,
  pendingFails = false,
} = {}) => ({
  getWithdrawalNonce: async () => {
    if (nonceFails) throw new Error('network unreachable')
    return { nonce }
  },
  getPendingWithdrawals: async () => {
    if (pendingFails) throw new Error('network unreachable')
    return { pending_withdrawals: pending }
  },
})

describe('classifyFailedSubmit', () => {
  test('spent nonce with a matching pending withdrawal means it landed', async () => {
    const client = reader({ pending: [{ token_id: TOKEN.toLowerCase(), amount: '100' }] })
    expect(await classifyFailedSubmit(client, USER, 3n, TOKEN, 100n)).toBe('landed')
  })

  test('spent nonce without a matching withdrawal lost the race to another one', async () => {
    const client = reader({ pending: [{ token_id: TOKEN, amount: '999' }] })
    expect(await classifyFailedSubmit(client, USER, 3n, TOKEN, 100n)).toBe('lost-nonce-race')
  })

  test('an unspent nonce is a plain failure', async () => {
    expect(await classifyFailedSubmit(reader({ nonce: '3' }), USER, 3n, TOKEN, 100n)).toBe('failed')
  })

  test('an unavailable nonce check surfaces the original error', async () => {
    const client = reader({ nonceFails: true })
    expect(await classifyFailedSubmit(client, USER, 3n, TOKEN, 100n)).toBe('failed')
  })

  test('proven advancement degrades to landed when the pending list is unavailable', async () => {
    const client = reader({ pendingFails: true })
    expect(await classifyFailedSubmit(client, USER, 3n, TOKEN, 100n)).toBe('landed')
  })
})
