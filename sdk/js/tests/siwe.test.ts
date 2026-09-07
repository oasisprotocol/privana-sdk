import { describe, expect, it } from 'bun:test'
import { buildSiweLoginMessage, pickSiweDomain } from '../src/sdk/auth/siwe'
import type { Address } from '../src/sdk/types'

const ADDRESS: Address = '0x0000000000000000000000000000000000000001'

async function withWindowLocation<T>(
  location: { host: string; origin: string } | undefined,
  fn: () => T | Promise<T>
): Promise<T> {
  const globals = globalThis as { window?: unknown }
  const original = globals.window
  globals.window = location === undefined ? undefined : { location }
  try {
    return await fn()
  } finally {
    if (original === undefined) {
      delete globals.window
    } else {
      globals.window = original
    }
  }
}

describe('pickSiweDomain', () => {
  it('uses the page host when it is in the allow-list', async () => {
    const domain = await withWindowLocation(
      { host: 'app.privana.finance', origin: 'https://app.privana.finance' },
      () => pickSiweDomain({ domains: ['api.privana.finance', 'app.privana.finance'] })
    )
    expect(domain).toBe('app.privana.finance')
  })

  it('matches hosts case-insensitively and keeps the lowercased page host', async () => {
    const domain = await withWindowLocation(
      { host: 'App.Privana.Finance', origin: 'https://app.privana.finance' },
      () => pickSiweDomain({ domains: ['api.privana.finance', 'APP.PRIVANA.FINANCE'] })
    )
    expect(domain).toBe('app.privana.finance')
  })

  it('matches hosts with ports', async () => {
    const domain = await withWindowLocation(
      { host: 'localhost:3000', origin: 'http://localhost:3000' },
      () => pickSiweDomain({ domains: ['api.testnet.privana.finance', 'localhost:3000'] })
    )
    expect(domain).toBe('localhost:3000')
  })

  it('falls back to the first entry when the page host is not allow-listed', async () => {
    const domain = await withWindowLocation(
      { host: 'localhost:3000', origin: 'http://localhost:3000' },
      () => pickSiweDomain({ domains: ['api.privana.finance', 'app.privana.finance'] })
    )
    expect(domain).toBe('api.privana.finance')
  })

  it('falls back to the first entry outside a browser', async () => {
    const domain = await withWindowLocation(undefined, () =>
      pickSiweDomain({ domains: ['api.privana.finance', 'app.privana.finance'] })
    )
    expect(domain).toBe('api.privana.finance')
  })

  it('throws when the response contains no domains', () => {
    expect(() => pickSiweDomain({ domains: [] })).toThrow('no domains')
  })
})

describe('buildSiweLoginMessage', () => {
  const api = {
    getSiweDomain: async () => ({ domains: ['api.privana.finance', 'app.privana.finance'] }),
    getSiweNonce: async (_address: Address) => ({ nonce: 'abcdefgh12345678' }),
  }

  it('signs with the page host when allow-listed', async () => {
    const { message } = await withWindowLocation(
      { host: 'app.privana.finance', origin: 'https://app.privana.finance' },
      () =>
        buildSiweLoginMessage(api, {
          address: ADDRESS,
          chainId: 1,
          apiUrl: 'https://api.privana.finance',
        })
    )
    expect(message.startsWith('app.privana.finance wants you to sign in')).toBe(true)
    expect(message).toContain('URI: https://app.privana.finance')
    expect(message).toContain('Nonce: abcdefgh12345678')
  })

  it('signs with the primary domain when the page host is not allow-listed', async () => {
    const { message } = await withWindowLocation(
      { host: 'localhost:3000', origin: 'http://localhost:3000' },
      () =>
        buildSiweLoginMessage(api, {
          address: ADDRESS,
          chainId: 1,
          apiUrl: 'https://api.privana.finance',
        })
    )
    expect(message.startsWith('api.privana.finance wants you to sign in')).toBe(true)
  })
})
