import { describe, expect, it } from 'bun:test'
import { PrivanaClient } from '../src/sdk/client'
import { signDepositLockAuthorizationMessage } from '../src/sdk/signatures'
import {
  createDepositLockIntentIdFromString,
  isDepositLockAuthorizationUsable,
} from '../src/sdk/hooks/deposit-lock-authorization'

const BASE_URL = 'https://privana.example.com'

describe('PrivanaClient user-signed write methods', () => {
  it('checkDeposit omits lock_authorization when not provided', async () => {
    const originalFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? '{}'))
      return new Response(
        JSON.stringify({
          status: 'pending',
          deposit_id: '0x' + 'dd'.repeat(32),
          amount: '1000',
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      await client.checkDeposit({
        chain_id: 84532,
        tx_hash: '0xabc123',
        amount: '1000',
      })

      expect(requestBody).toEqual({
        chain_type: 'evm',
        chain_id: 84532,
        tx_hash: '0xabc123',
        amount: '1000',
        log_index: 0,
        version: 0,
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('checkDeposit includes normalized lock_authorization when provided', async () => {
    const originalFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body ?? '{}'))
      return new Response(
        JSON.stringify({
          status: 'pending',
          deposit_id: '0x' + 'dd'.repeat(32),
          amount: '1000',
        }),
        {
          status: 202,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      await client.checkDeposit({
        chain_id: 84532,
        tx_hash: 'abc123',
        amount: 1000,
        lock_authorization: {
          service_address: '0x000000000000000000000000000000000000dEaD',
          token_id: '11'.repeat(32) as `0x${string}`,
          max_amount: 2000,
          min_amount: 500,
          lock_duration: 3600,
          authorization_deadline: 9999999999,
          intent_id: '22'.repeat(32) as `0x${string}`,
          signature: 'abcd',
        },
      })

      expect(requestBody).toEqual({
        chain_type: 'evm',
        chain_id: 84532,
        tx_hash: '0xabc123',
        amount: '1000',
        log_index: 0,
        version: 0,
        lock_authorization: {
          service_address: '0x000000000000000000000000000000000000dead',
          token_id: '0x' + '11'.repeat(32),
          max_amount: '2000',
          min_amount: '500',
          lock_duration: '3600',
          authorization_deadline: '9999999999',
          intent_id: '0x' + '22'.repeat(32),
          signature: '0xabcd',
        },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('updateOnRamp includes normalized lock_authorization when provided', async () => {
    const originalFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    let requestUrl: string | undefined
    globalThis.fetch = async (input, init) => {
      requestUrl = String(input)
      requestBody = JSON.parse(String(init?.body ?? '{}'))
      return new Response(
        JSON.stringify({
          transaction_id: 'privana_intent_123',
          status: 'pending',
          lock_authorization: requestBody?.lock_authorization,
          created_at: 1,
          updated_at: 1,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }

    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      await client.updateOnRamp('privana_intent_123', {
        lock_authorization: {
          service_address: '0x000000000000000000000000000000000000dEaD',
          token_id: '11'.repeat(32) as `0x${string}`,
          max_amount: 2000,
          min_amount: 500,
          lock_duration: 3600,
          authorization_deadline: 9999999999,
          intent_id: '22'.repeat(32) as `0x${string}`,
          signature: 'abcd',
        },
      })

      expect(requestUrl).toContain('/v1/accounting/onramp/privana_intent_123')
      expect(requestBody).toEqual({
        lock_authorization: {
          service_address: '0x000000000000000000000000000000000000dead',
          token_id: '0x' + '11'.repeat(32),
          max_amount: '2000',
          min_amount: '500',
          lock_duration: '3600',
          authorization_deadline: '9999999999',
          intent_id: '0x' + '22'.repeat(32),
          signature: '0xabcd',
        },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('signDepositLockAuthorizationMessage signs the expected typed data shape', async () => {
    const calls: unknown[] = []
    const walletClient = {
      account: '0x000000000000000000000000000000000000dEaD',
      signTypedData: async (args: unknown) => {
        calls.push(args)
        return '0xsigned'
      },
    }

    const signature = await signDepositLockAuthorizationMessage({
      walletClient: walletClient as never,
      chainId: 23295,
      verifyingContract: '0x0000000000000000000000000000000000000001',
      message: {
        userAddress: '0x000000000000000000000000000000000000dEaD',
        serviceAddress: '0x0000000000000000000000000000000000000002',
        tokenId: ('0x' + '11'.repeat(32)) as `0x${string}`,
        maxAmount: 2000n,
        minAmount: 500n,
        lockDuration: 3600n,
        authorizationDeadline: 9999999999n,
        intentId: ('0x' + '22'.repeat(32)) as `0x${string}`,
      },
    })

    expect(signature).toBe('0xsigned')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      account: '0x000000000000000000000000000000000000dEaD',
      domain: {
        name: 'AccountingModule',
        version: '1',
        chainId: 23295,
        verifyingContract: '0x0000000000000000000000000000000000000001',
      },
      types: {
        DepositLockAuthorization: [
          { name: 'userAddress', type: 'address' },
          { name: 'serviceAddress', type: 'address' },
          { name: 'tokenId', type: 'bytes32' },
          { name: 'maxAmount', type: 'uint256' },
          { name: 'minAmount', type: 'uint256' },
          { name: 'lockDuration', type: 'uint256' },
          { name: 'authorizationDeadline', type: 'uint256' },
          { name: 'intentId', type: 'bytes32' },
        ],
      },
      primaryType: 'DepositLockAuthorization',
      message: {
        userAddress: '0x000000000000000000000000000000000000dEaD',
        serviceAddress: '0x0000000000000000000000000000000000000002',
        tokenId: '0x' + '11'.repeat(32),
        maxAmount: 2000n,
        minAmount: 500n,
        lockDuration: 3600n,
        authorizationDeadline: 9999999999n,
        intentId: '0x' + '22'.repeat(32),
      },
    })
  })

  it('createDepositLockIntentIdFromString is deterministic bytes32', () => {
    const first = createDepositLockIntentIdFromString('privana-intent-123')
    const second = createDepositLockIntentIdFromString('privana-intent-123')
    const different = createDepositLockIntentIdFromString('privana-intent-456')

    expect(first).toBe(second)
    expect(first).toMatch(/^0x[0-9a-f]{64}$/)
    expect(first).not.toBe(different)
  })

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

describe('isDepositLockAuthorizationUsable', () => {
  const baseAuthorization = {
    service_address: '0x' + '11'.repeat(20),
    token_id: ('0x' + '22'.repeat(32)) as `0x${string}`,
    max_amount: '1000',
    min_amount: '0',
    lock_duration: '3600',
    intent_id: ('0x' + '33'.repeat(32)) as `0x${string}`,
    signature: '0xabc123',
  } as const

  function authorizationWithDeadline(deadline: string) {
    return { ...baseAuthorization, authorization_deadline: deadline }
  }

  it('accepts a deadline beyond the backend buffer', () => {
    const deadline = String(Math.floor(Date.now() / 1000) + 3600)
    expect(isDepositLockAuthorizationUsable(authorizationWithDeadline(deadline))).toBe(true)
  })

  it('rejects an expired deadline', () => {
    const deadline = String(Math.floor(Date.now() / 1000) - 60)
    expect(isDepositLockAuthorizationUsable(authorizationWithDeadline(deadline))).toBe(false)
  })

  it('rejects a deadline inside the 300s backend buffer', () => {
    const deadline = String(Math.floor(Date.now() / 1000) + 120)
    expect(isDepositLockAuthorizationUsable(authorizationWithDeadline(deadline))).toBe(false)
  })

  it('rejects a non-numeric deadline', () => {
    expect(isDepositLockAuthorizationUsable(authorizationWithDeadline('not-a-number'))).toBe(false)
  })
})
