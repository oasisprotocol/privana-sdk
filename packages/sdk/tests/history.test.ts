import { describe, expect, it } from 'bun:test'
import { FlexvaultsClient } from '../src/sdk/client'

const BASE_URL = 'https://flexvaults.example.com'
const HISTORY_TOKEN_ID = '0x1111111111111111111111111111111111111111111111111111111111111111'
const HISTORY_DEPOSIT_ID = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'

describe('FlexvaultsClient history methods', () => {
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
              kind: 'unknown',
              timestamp: 1710000001,
              token_id: null,
              amount: null,
              counterparty: null,
              deposit_id: null,
              chain_id: null,
            },
          ],
          total: 2,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    try {
      const client = new FlexvaultsClient({ baseUrl: BASE_URL })
      const result = await client.getHistory()

      expect(requestUrl).toBe(`${BASE_URL}/v1/accounting/history?offset=-1&limit=50`)
      expect(result.total).toBe(2)
      expect(result.history[0].kind).toBe('deposit')
      expect(result.history[0].token_id).toBe(HISTORY_TOKEN_ID)
      expect(result.history[0].deposit_id).toBe(HISTORY_DEPOSIT_ID)
      expect(result.history[1].kind).toBe('unknown')
      expect(result.history[1].token_id).toBeNull()
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
      const client = new FlexvaultsClient({ baseUrl: BASE_URL })
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
      const client = new FlexvaultsClient({ baseUrl: BASE_URL })
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
