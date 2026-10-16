import { describe, expect, it } from 'bun:test'
import {
  AccountingApiError,
  PrivanaClient,
  PrivateReadAuthRequiredError,
  TransferRateLimitedError,
} from '../src/sdk/client'
import type { TransferFundsRequest } from '../src/sdk/types'
import { submitTransfer, TRANSFER_SIGN_IN_MESSAGE } from '../src/sdk/utils/transfer'

const BASE_URL = 'https://privana.example.com'

const REQUEST: TransferFundsRequest = {
  to_address: '0x000000000000000000000000000000000000dEaD',
  token_id: '0x' + '22'.repeat(32),
  amount: '1000',
  nonce: '7',
  signature: '0xabc123',
}

async function withFetch<T>(handler: typeof fetch, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch
  globalThis.fetch = handler
  try {
    return await run()
  } finally {
    globalThis.fetch = originalFetch
  }
}

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

/** Runs the request on a client that fails transferFunds with `error`. */
const failingWith =
  (error: Error) =>
  <T>(request: (client: PrivanaClient) => Promise<T>) =>
    request({ transferFunds: async () => Promise.reject(error) } as unknown as PrivanaClient)

describe('submitTransfer', () => {
  it("posts the transfer with the caller's private-read token", async () => {
    let siweToken: string | null = null
    const response = await withFetch(
      async (_input, init) => {
        siweToken = new Headers(init?.headers).get('X-SIWE-Token')
        return respond(200, { status: 'submitted' })
      },
      () =>
        submitTransfer(
          (request) =>
            request(new PrivanaClient({ baseUrl: BASE_URL }).withPrivateReadToken('tok')),
          REQUEST
        )
    )
    expect(response).toEqual({ status: 'submitted' })
    expect(siweToken).toBe('tok')
  })

  it('turns a 429 into TransferRateLimitedError', async () => {
    const limited = new AccountingApiError('Too Many Requests', 429)
    const error = await submitTransfer(failingWith(limited), REQUEST).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TransferRateLimitedError)
    expect((error as Error).message).toBe('Too many transfers. Try again later.')
  })

  it('leaves a 429 from signing in alone', async () => {
    const signInLimited = new AccountingApiError('Too Many Requests', 429)
    const error = await submitTransfer(async () => {
      throw signInLimited
    }, REQUEST).catch((e: unknown) => e)
    expect(error).toBe(signInLimited)
  })

  it('asks to sign in on a 401 or a missing session', async () => {
    for (const cause of [
      new AccountingApiError('Unauthorized', 401),
      new PrivateReadAuthRequiredError(),
    ]) {
      const error = await submitTransfer(failingWith(cause), REQUEST).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(PrivateReadAuthRequiredError)
      expect((error as Error).message).toBe(TRANSFER_SIGN_IN_MESSAGE)
    }
  })

  it('passes other failures through', async () => {
    const reverted = new AccountingApiError('Unprocessable', 422, 'InsufficientBalance')
    const error = await submitTransfer(failingWith(reverted), REQUEST).catch((e: unknown) => e)
    expect(error).toBe(reverted)
  })
})
