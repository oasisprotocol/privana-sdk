import { afterEach, describe, expect, it } from 'bun:test'
import { AccountingApiError, PrivateReadAuthRequiredError } from '../src/sdk/client'
import type { PrivanaClient } from '../src/sdk/client'
import {
  executeSessionPrivateReadRequest,
  requireSessionPrivateReadToken,
} from '../src/sdk/hooks/use-private-read-request'
import {
  deleteCachedPrivateReadToken,
  onPrivateReadTokenRejected,
  setCachedPrivateReadToken,
} from '../src/sdk/utils/private-read-token-store'

const SCOPE = 'https://privana.example.com:23295:0x000000000000000000000000000000000000dead'
const HOUR = 60 * 60 * 1000

afterEach(() => {
  deleteCachedPrivateReadToken(SCOPE)
})

describe('requireSessionPrivateReadToken', () => {
  it("reads with the session's cached token", () => {
    setCachedPrivateReadToken(SCOPE, '0xsession-token', Date.now() + HOUR)
    expect(requireSessionPrivateReadToken(SCOPE)).toBe('0xsession-token')
  })

  it('asks for sign-in instead of signing when there is no token', () => {
    expect(() => requireSessionPrivateReadToken(SCOPE)).toThrow(PrivateReadAuthRequiredError)
  })

  it('asks for sign-in instead of signing once the token has expired', () => {
    setCachedPrivateReadToken(SCOPE, '0xsession-token', Date.now() - HOUR)
    expect(() => requireSessionPrivateReadToken(SCOPE)).toThrow(PrivateReadAuthRequiredError)
  })
})

describe('executeSessionPrivateReadRequest', () => {
  // A scoped client is just the token it reads with here.
  const client = {
    withPrivateReadToken: (token: string) => token as unknown as PrivanaClient,
  }
  const unauthorized = () => new AccountingApiError('Unauthorized', 401)

  it("reads with the session's token", async () => {
    setCachedPrivateReadToken(SCOPE, '0xsession', Date.now() + HOUR)
    const read = await executeSessionPrivateReadRequest({
      client,
      scopeKey: SCOPE,
      request: async (scoped) => `read with ${scoped}`,
    })
    expect(read).toBe('read with 0xsession')
  })

  it('reports a rejected token so its session ends, then asks for sign-in', async () => {
    setCachedPrivateReadToken(SCOPE, '0xsession', Date.now() + HOUR)
    const rejected: string[] = []
    // The session owner ends the session, which drops its cached token.
    const stop = onPrivateReadTokenRejected((token) => {
      rejected.push(token)
      deleteCachedPrivateReadToken(SCOPE)
    })
    const read = executeSessionPrivateReadRequest({
      client,
      scopeKey: SCOPE,
      request: async () => {
        throw unauthorized()
      },
    })
    await expect(read).rejects.toBeInstanceOf(PrivateReadAuthRequiredError)
    expect(rejected).toEqual(['0xsession'])
    stop()
  })

  it('retries with the new token when the request raced a new sign-in', async () => {
    setCachedPrivateReadToken(SCOPE, '0xold', Date.now() + HOUR)
    const read = await executeSessionPrivateReadRequest({
      client,
      scopeKey: SCOPE,
      request: async (scoped) => {
        if ((scoped as unknown as string) === '0xold') {
          setCachedPrivateReadToken(SCOPE, '0xnew', Date.now() + HOUR)
          throw unauthorized()
        }
        return `read with ${scoped}`
      },
    })
    expect(read).toBe('read with 0xnew')
  })

  it('passes other failures through untouched', async () => {
    setCachedPrivateReadToken(SCOPE, '0xsession', Date.now() + HOUR)
    const failure = new AccountingApiError('Server error', 500)
    const read = executeSessionPrivateReadRequest({
      client,
      scopeKey: SCOPE,
      request: async () => {
        throw failure
      },
    })
    await expect(read).rejects.toBe(failure)
  })
})
