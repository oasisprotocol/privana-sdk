import { describe, expect, it } from 'bun:test'
import { PrivanaClient } from '../src/sdk/client'

const BASE_URL = 'https://privana.example.com'
const HISTORY_TOKEN_ID = '0x1111111111111111111111111111111111111111111111111111111111111111'
const HISTORY_DEPOSIT_ID = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
const HISTORY_RECIPIENT = '0x0000000000000000000000000000000000000003'
const HISTORY_SENDER = '0x0000000000000000000000000000000000000001'
const HISTORY_SERVICE = '0x0000000000000000000000000000000000000002'

describe('PrivanaClient history methods', () => {
  it('getHistory requests the latest page by default', async () => {
    const originalFetch = globalThis.fetch
    let requestUrl: string | undefined

    globalThis.fetch = async (input) => {
      requestUrl = String(input)
      return new Response(
        JSON.stringify({
          history: [
            {
              kind: 'deposit',
              timestamp: 1710000000,
              token_id: HISTORY_TOKEN_ID,
              amount: '1000',
              counterparty: null,
              deposit_id: HISTORY_DEPOSIT_ID,
              chain_id: 84532,
            },
            {
              kind: 'transferBalanceOut',
              timestamp: 1710000001,
              token_id: HISTORY_TOKEN_ID,
              amount: '250',
              counterparty: HISTORY_RECIPIENT,
              deposit_id: null,
              chain_id: 84532,
            },
            {
              kind: 'transferBalanceIn',
              timestamp: 1710000002,
              token_id: HISTORY_TOKEN_ID,
              amount: '250',
              counterparty: HISTORY_SENDER,
              deposit_id: null,
              chain_id: 84532,
            },
            {
              kind: 'modifyLock',
              timestamp: 1710000003,
              token_id: HISTORY_TOKEN_ID,
              amount: '0',
              counterparty: HISTORY_SERVICE,
              deposit_id: null,
              chain_id: null,
            },
            {
              kind: 'unlockLock',
              timestamp: 1710000004,
              token_id: HISTORY_TOKEN_ID,
              amount: '500',
              counterparty: HISTORY_SERVICE,
              deposit_id: null,
              chain_id: null,
            },
            {
              kind: 'unknown',
              timestamp: 1710000005,
              token_id: null,
              amount: null,
              counterparty: null,
              deposit_id: null,
              chain_id: null,
            },
          ],
          total: 6,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      const result = await client.getHistory()

      expect(requestUrl).toBe(`${BASE_URL}/v1/accounting/history?offset=-1&limit=50`)
      expect(result.total).toBe(6)
      expect(result.history.map((entry) => entry.kind)).toEqual([
        'deposit',
        'transferBalanceOut',
        'transferBalanceIn',
        'modifyLock',
        'unlockLock',
        'unknown',
      ])
      expect(result.history[0].token_id).toBe(HISTORY_TOKEN_ID)
      expect(result.history[0].deposit_id).toBe(HISTORY_DEPOSIT_ID)
      expect(result.history[1].counterparty).toBe(HISTORY_RECIPIENT)
      expect(result.history[2].counterparty).toBe(HISTORY_SENDER)
      expect(result.history[3].counterparty).toBe(HISTORY_SERVICE)
      expect(result.history[5].token_id).toBeNull()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('getHistory sends only pagination parameters', async () => {
    const originalFetch = globalThis.fetch
    let requestUrl: string | undefined

    globalThis.fetch = async (input) => {
      requestUrl = String(input)
      return new Response(JSON.stringify({ history: [], total: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      await client.getHistory({ offset: 2, limit: 0 })

      const url = new URL(requestUrl ?? '')
      expect(url.pathname).toBe('/v1/accounting/history')
      expect(url.searchParams.get('offset')).toBe('2')
      expect(url.searchParams.get('limit')).toBe('0')
      expect(url.searchParams.has('user_address')).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('rejects invalid history pagination before sending a request', async () => {
    const originalFetch = globalThis.fetch
    let called = false

    globalThis.fetch = async () => {
      called = true
      return new Response(JSON.stringify({ history: [], total: 0 }))
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      let error: unknown

      try {
        await client.getHistory({ offset: 0, limit: 101 })
      } catch (err) {
        error = err
      }

      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain('between 0 and 100')
      expect(called).toBe(false)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
