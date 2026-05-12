import { describe, expect, it } from 'bun:test'
import { PrivanaClient } from '../src/sdk/client'

const BASE_URL = 'https://privana.example.com'

describe('PrivanaClient user-signed write methods', () => {
  it('getModifyLockNonce calls the modify-lock nonce endpoint', async () => {
    const originalFetch = globalThis.fetch
    let requestUrl: string | undefined
    globalThis.fetch = async (input) => {
      requestUrl = String(input)
      return new Response(
        JSON.stringify({
          user_address: '0x000000000000000000000000000000000000dEaD',
          nonce: '7',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      const result = await client.getModifyLockNonce('0x000000000000000000000000000000000000dEaD')

      expect(result.user_address).toBe('0x000000000000000000000000000000000000dEaD')
      expect(result.nonce).toBe('7')
      expect(requestUrl).toContain('/v1/accounting/funds/modify-lock/nonce/')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('getModifyLockNonce calls a different endpoint than getLockNonce', async () => {
    const originalFetch = globalThis.fetch
    const requestUrls: string[] = []
    globalThis.fetch = async (input) => {
      requestUrls.push(String(input))
      return new Response(
        JSON.stringify({
          user_address: '0x000000000000000000000000000000000000dEaD',
          nonce: '3',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      await client.getLockNonce('0x000000000000000000000000000000000000dEaD')
      await client.getModifyLockNonce('0x000000000000000000000000000000000000dEaD')

      expect(requestUrls).toHaveLength(2)
      expect(requestUrls[0]).toContain('/v1/accounting/funds/lock/nonce/')
      expect(requestUrls[1]).toContain('/v1/accounting/funds/modify-lock/nonce/')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('modifyLock posts to the modify-lock endpoint with correct fields', async () => {
    const originalFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    let requestUrl: string | undefined
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input)
      requestBody = JSON.parse(String(init?.body ?? '{}'))
      return new Response(JSON.stringify({ status: 'submitted', detail: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      const result = await client.modifyLock({
        lock_id: 42,
        amount: '1000',
        new_expiry: '9999999999',
        nonce: '7',
        signature: '0xabc123',
      })

      expect(result.status).toBe('submitted')
      expect(requestUrl).toContain('/v1/accounting/funds/modify-lock')
      expect(requestBody).toEqual({
        lock_id: 42,
        amount: '1000',
        new_expiry: '9999999999',
        nonce: '7',
        signature: '0xabc123',
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('lockFunds posts only signer-derived user fields', async () => {
    const originalFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? '{}'))
      return new Response(JSON.stringify({ status: 'submitted' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      await client.lockFunds({
        service_address: '0x000000000000000000000000000000000000dEaD',
        token_id: '0x' + '11'.repeat(32),
        amount: '1000',
        expiry: '9999999999',
        nonce: '7',
        signature: '0xabc123',
      })

      expect(requestBody).toEqual({
        service_address: '0x000000000000000000000000000000000000dead',
        token_id: '0x' + '11'.repeat(32),
        amount: '1000',
        expiry: '9999999999',
        nonce: '7',
        signature: '0xabc123',
      })
      expect(requestBody).not.toHaveProperty('user_address')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('transferFunds posts only signer-derived user fields', async () => {
    const originalFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? '{}'))
      return new Response(JSON.stringify({ status: 'submitted' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      await client.transferFunds({
        to_address: '0x000000000000000000000000000000000000dEaD',
        token_id: '0x' + '22'.repeat(32),
        amount: '1000',
        nonce: '7',
        signature: '0xabc123',
      })

      expect(requestBody).toEqual({
        to_address: '0x000000000000000000000000000000000000dead',
        token_id: '0x' + '22'.repeat(32),
        amount: '1000',
        nonce: '7',
        signature: '0xabc123',
      })
      expect(requestBody).not.toHaveProperty('user_address')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('requestWithdrawal posts only signer-derived user fields', async () => {
    const originalFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? '{}'))
      return new Response(JSON.stringify({ status: 'submitted' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      await client.requestWithdrawal({
        token_id: '0x' + '33'.repeat(32),
        amount: '1000',
        nonce: '7',
        signature: '0xabc123',
      })

      expect(requestBody).toEqual({
        token_id: '0x' + '33'.repeat(32),
        amount: '1000',
        nonce: '7',
        signature: '0xabc123',
      })
      expect(requestBody).not.toHaveProperty('user_address')
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
