import { describe, expect, it } from 'bun:test'
import { PrivanaClient } from '../src/sdk/client'
import {
  applyLockBuffer,
  clearPendingLock,
  createSignedLockRequest,
  isSignedLockUsable,
  loadPendingLock,
  savePendingLock,
  submitPendingLock,
  PostDepositLockError,
} from '../src/sdk/hooks/pending-lock'
import type { LockFundsRequest } from '../src/sdk/types'

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

const USER = '0x00000000000000000000000000000000000000AA'
const SERVICE = '0x000000000000000000000000000000000000dEaD'
const TOKEN_ID = ('0x' + '11'.repeat(32)) as `0x${string}`

function signedLockFixture(overrides: Partial<LockFundsRequest> = {}): LockFundsRequest {
  return {
    service_address: SERVICE,
    token_id: TOKEN_ID,
    amount: '1000000',
    expiry: String(Math.floor(Date.now() / 1000) + 3600),
    nonce: '7',
    signature: '0xabc123',
    ...overrides,
  }
}

describe('applyLockBuffer', () => {
  it('shaves the default 2% with floor rounding at 6 decimals', () => {
    // 100 USDC → exactly 98 USDC
    expect(applyLockBuffer(100_000_000n)).toBe(98_000_000n)
    // 33.333333 × 0.98 = 32.66666634 → floors, never rounds up
    expect(applyLockBuffer(33_333_333n)).toBe(32_666_666n)
    expect(applyLockBuffer(1n)).toBe(0n)
  })

  it('buffer 0 keeps the amount exact', () => {
    expect(applyLockBuffer(123_456_789n, 0)).toBe(123_456_789n)
  })

  it('rejects buffers outside [0, 1)', () => {
    expect(() => applyLockBuffer(1_000_000n, -0.01)).toThrow()
    expect(() => applyLockBuffer(1_000_000n, 1)).toThrow()
    expect(() => applyLockBuffer(1_000_000n, Number.NaN)).toThrow()
  })

  it('quantizes sub-ppm buffers upward, never signing more than requested', () => {
    // floor(1_000_000 × (1 − 0.0200004)) = 979_999; rounding the shave to the
    // nearest ppm (20_000) would sign 980_000 — more than the buffer allows.
    expect(applyLockBuffer(1_000_000n, 0.0200004)).toBe(979_999n)
  })
})

describe('createSignedLockRequest', () => {
  it('fetches the nonce and signs the Lock typed-data shape', async () => {
    const calls: unknown[] = []
    const walletClient = {
      account: USER,
      signTypedData: async (args: unknown) => {
        calls.push(args)
        return '0xsigned'
      },
    }
    const client = {
      getLockNonce: async (userAddress: string) => {
        expect(userAddress).toBe(USER)
        return { nonce: 7 }
      },
    }

    const before = Math.floor(Date.now() / 1000)
    const payload = await createSignedLockRequest({
      client: client as never,
      walletClient: walletClient as never,
      userAddress: USER,
      networkConfig: {
        chainId: 23295,
        name: 'sapphire-testnet',
        accountingContract: '0x0000000000000000000000000000000000000001',
        apiUrl: BASE_URL,
      },
      serviceAddress: SERVICE,
      tokenId: TOKEN_ID,
      amount: 98_000_000n,
      lockDuration: 3600,
    })

    expect(payload).toEqual({
      service_address: SERVICE,
      token_id: TOKEN_ID,
      amount: '98000000',
      expiry: payload.expiry,
      nonce: '7',
      signature: '0xsigned',
    })
    const expiry = Number(payload.expiry)
    expect(expiry).toBeGreaterThanOrEqual(before + 3600)
    expect(expiry).toBeLessThanOrEqual(before + 3600 + 5)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      account: USER,
      domain: {
        name: 'AccountingModule',
        version: '1',
        chainId: 23295,
        verifyingContract: '0x0000000000000000000000000000000000000001',
      },
      types: {
        Lock: [
          { name: 'serviceAddress', type: 'address' },
          { name: 'tokenId', type: 'bytes32' },
          { name: 'amount', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
        ],
      },
      primaryType: 'Lock',
      message: {
        serviceAddress: SERVICE,
        tokenId: TOKEN_ID,
        amount: 98_000_000n,
        expiry: BigInt(payload.expiry),
        nonce: 7n,
      },
    })
  })

  it('rejects a non-positive amount before touching the wallet', async () => {
    await expect(
      createSignedLockRequest({
        client: {} as never,
        walletClient: {} as never,
        userAddress: USER,
        networkConfig: {
          chainId: 23295,
          name: 'sapphire-testnet',
          accountingContract: '0x0000000000000000000000000000000000000001',
          apiUrl: BASE_URL,
        },
        serviceAddress: SERVICE,
        tokenId: TOKEN_ID,
        amount: 0n,
      })
    ).rejects.toThrow('Lock amount must be positive')
  })
})

describe('isSignedLockUsable', () => {
  it('accepts an expiry beyond the submission slack', () => {
    expect(isSignedLockUsable(signedLockFixture())).toBe(true)
  })

  it('rejects an expiry inside the slack window or in the past', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(isSignedLockUsable(signedLockFixture({ expiry: String(now + 30) }))).toBe(false)
    expect(isSignedLockUsable(signedLockFixture({ expiry: String(now - 60) }))).toBe(false)
  })

  it('rejects a non-numeric expiry', () => {
    expect(isSignedLockUsable(signedLockFixture({ expiry: 'not-a-number' }))).toBe(false)
  })
})

describe('submitPendingLock', () => {
  it('submits a usable payload and returns the API response', async () => {
    let submitted: LockFundsRequest | undefined
    const client = {
      lockFunds: async (payload: LockFundsRequest) => {
        submitted = payload
        return { submission_id: 'sub-1', status: 'submitted' }
      },
    }
    const payload = signedLockFixture()
    const result = await submitPendingLock({
      client: client as never,
      payload,
      creditedAmount: 1_000_000n,
    })
    expect(submitted).toBe(payload)
    expect(result.submission_id).toBe('sub-1')
  })

  it('fails closed with reason expired, without calling the API', async () => {
    let called = false
    const client = {
      lockFunds: async () => {
        called = true
        return { submission_id: 'sub-1', status: 'submitted' }
      },
    }
    const payload = signedLockFixture({ expiry: '1' })
    const error = await submitPendingLock({ client: client as never, payload }).catch((e) => e)
    expect(error).toBeInstanceOf(PostDepositLockError)
    expect((error as PostDepositLockError).reason).toBe('expired')
    expect(called).toBe(false)
  })

  it('skips a guaranteed revert when credited below the signed amount', async () => {
    let called = false
    const client = {
      lockFunds: async () => {
        called = true
        return { submission_id: 'sub-1', status: 'submitted' }
      },
    }
    const error = await submitPendingLock({
      client: client as never,
      payload: signedLockFixture({ amount: '1000000' }),
      creditedAmount: 999_999n,
    }).catch((e) => e)
    expect(error).toBeInstanceOf(PostDepositLockError)
    expect((error as PostDepositLockError).reason).toBe('credited-below-signed')
    expect((error as PostDepositLockError).signedAmount).toBe(1_000_000n)
    expect((error as PostDepositLockError).creditedAmount).toBe(999_999n)
    expect(called).toBe(false)
  })

  it('wraps API rejections as submission-failed with the cause attached', async () => {
    const apiError = new Error('nonce already used')
    const client = {
      lockFunds: async () => {
        throw apiError
      },
    }
    const error = await submitPendingLock({
      client: client as never,
      payload: signedLockFixture(),
    }).catch((e) => e)
    expect(error).toBeInstanceOf(PostDepositLockError)
    expect((error as PostDepositLockError).reason).toBe('submission-failed')
    expect((error as PostDepositLockError).cause).toBe(apiError)
  })

  it('reports a corrupted stored amount as a typed error, not a raw TypeError', async () => {
    let called = false
    const client = {
      lockFunds: async () => {
        called = true
      },
    }
    const error = await submitPendingLock({
      client: client as never,
      payload: { ...signedLockFixture(), amount: 'garbage' },
    }).catch((e) => e)
    expect(error).toBeInstanceOf(PostDepositLockError)
    expect((error as PostDepositLockError).reason).toBe('submission-failed')
    expect(called).toBe(false)
  })
})

describe('pending-lock persistence', () => {
  function createStorageStub(): Storage {
    const map = new Map<string, string>()
    return {
      get length() {
        return map.size
      },
      clear: () => map.clear(),
      getItem: (key: string) => map.get(key) ?? null,
      key: (index: number) => [...map.keys()][index] ?? null,
      removeItem: (key: string) => void map.delete(key),
      setItem: (key: string, value: string) => void map.set(key, String(value)),
    }
  }

  function withBrowserStorage(fn: () => void): void {
    const globals = globalThis as { window?: unknown }
    const original = globals.window
    globals.window = {
      localStorage: createStorageStub(),
      sessionStorage: createStorageStub(),
    }
    try {
      fn()
    } finally {
      if (original === undefined) {
        delete globals.window
      } else {
        globals.window = original
      }
    }
  }

  it('round-trips a payload keyed by user and correlation id', () => {
    withBrowserStorage(() => {
      const payload = signedLockFixture()
      savePendingLock(USER, 'tx-1', payload)
      expect(loadPendingLock(USER, 'tx-1')).toEqual(payload)
      expect(loadPendingLock(USER, 'tx-2')).toBeUndefined()
      expect(loadPendingLock(SERVICE, 'tx-1')).toBeUndefined()
      clearPendingLock(USER, 'tx-1')
      expect(loadPendingLock(USER, 'tx-1')).toBeUndefined()
    })
  })

  it('returns an expired payload so submission reports the precise reason', () => {
    withBrowserStorage(() => {
      const payload = signedLockFixture({ expiry: '1' })
      savePendingLock(USER, 'tx-1', payload)
      expect(loadPendingLock(USER, 'tx-1')).toEqual(payload)
    })
  })

  it('drops malformed records', () => {
    withBrowserStorage(() => {
      window.localStorage.setItem(
        `privana:pending-lock:${USER.toLowerCase()}:tx-1`,
        JSON.stringify({ savedAt: 1 })
      )
      expect(loadPendingLock(USER, 'tx-1')).toBeUndefined()
    })
  })

  it('throws when no storage backend accepts the payload', () => {
    expect(() => savePendingLock(USER, 'tx-1', signedLockFixture())).toThrow(
      'Unable to persist signed lock for recovery'
    )
  })
})
