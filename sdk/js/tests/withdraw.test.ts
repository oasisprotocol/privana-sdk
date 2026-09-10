import { describe, expect, it } from 'bun:test'
import { PrivanaClient } from '../src/sdk/client'

const BASE_URL = 'https://privana.example.com'
const TOKEN_ID = '0x1111111111111111111111111111111111111111111111111111111111111111'
const SIGNATURE = '0x' + 'ab'.repeat(65)

const withMockedFetch = async (
  body: Record<string, unknown>,
  run: (client: PrivanaClient) => Promise<void>
) => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch
  try {
    await run(new PrivanaClient({ baseUrl: BASE_URL }))
  } finally {
    globalThis.fetch = originalFetch
  }
}

describe('PrivanaClient.requestWithdrawal', () => {
  it('passes the withdrawal index through', async () => {
    await withMockedFetch(
      { submission_id: 'sub-1', status: 'submitted', detail: 'chain_id=8453', index: 20 },
      async (client) => {
        const response = await client.requestWithdrawal({
          token_id: TOKEN_ID,
          amount: 1_000_000n,
          nonce: 0,
          signature: SIGNATURE,
        })
        expect(response.index).toBe(20)
        expect(response.submission_id).toBe('sub-1')
      }
    )
  })

  it('passes a null index through when the backend lookup failed', async () => {
    await withMockedFetch(
      { submission_id: 'sub-1', status: 'submitted', index: null },
      async (client) => {
        const response = await client.requestWithdrawal({
          token_id: TOKEN_ID,
          amount: 1_000_000n,
          nonce: 0,
          signature: SIGNATURE,
        })
        expect(response.index).toBeNull()
      }
    )
  })
})
