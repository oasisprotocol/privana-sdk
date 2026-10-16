import { describe, expect, it } from 'bun:test'
import {
  AccountingApiError,
  PrivanaClient,
  PrivateReadAuthRequiredError,
  TransferRateLimitedError,
} from '../src/sdk/client'
import type { TransferFundsRequest } from '../src/sdk/types'
import { BaseError, getAddress, UserRejectedRequestError } from 'viem'
import {
  submitTransfer,
  transferAmountError,
  transferErrorMessage,
  transferRecipientError,
  TRANSFER_SIGN_IN_MESSAGE,
  withBuiltInSystemAddresses,
} from '../src/sdk/utils/transfer'

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

const SENDER = '0x5f16C90a0F410AE4Cdb76d9964f5FFDDeE305876'
const EARN_POOL = '0xdF925131222EEA3D1e0677e03e1E0868C19af84A'
const RECIPIENT = getAddress('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd')
const SYSTEM = [{ address: EARN_POOL, name: 'Privana Earn pool' }] as const

describe('transferRecipientError', () => {
  const check = (input: string) => transferRecipientError(input, SENDER, SYSTEM)

  it('accepts another address, checksummed or not', () => {
    expect(check(RECIPIENT)).toBeUndefined()
    expect(check(` ${RECIPIENT.toLowerCase()} `)).toBeUndefined()
  })

  it('says nothing about an empty field', () => {
    expect(check('')).toBeUndefined()
    expect(check('   ')).toBeUndefined()
  })

  it('rejects something that is not an address', () => {
    expect(check('0x1234')).toContain('does not look like a valid address')
    expect(check(RECIPIENT.slice(2))).toContain('does not look like a valid address')
  })

  it('rejects a mixed-case address whose checksum does not match', () => {
    const typo = '0xDf' + EARN_POOL.slice(4)
    expect(check(typo)).toContain('checksum does not match')
  })

  it("rejects the sender's own address in any case", () => {
    expect(check(SENDER.toLowerCase())).toBe('That is your own address. Send to someone else.')
  })

  it('names the system address it matches', () => {
    expect(check(EARN_POOL.toLowerCase())).toBe(
      'That is a Privana system address (Privana Earn pool) and cannot receive internal transfers.'
    )
  })
})

describe('withBuiltInSystemAddresses', () => {
  const blocked = withBuiltInSystemAddresses(SENDER, SYSTEM)
  const check = (input: string) => transferRecipientError(input, RECIPIENT, blocked)

  it('always blocks the zero, burn and accounting contract addresses', () => {
    expect(check('0x0000000000000000000000000000000000000000')).toContain('(Zero address)')
    expect(check('0x000000000000000000000000000000000000dead')).toContain('(Burn address)')
    expect(check(SENDER)).toContain('(Privana vault)')
  })

  it("keeps the host app's addresses", () => {
    expect(check(EARN_POOL)).toContain('(Privana Earn pool)')
  })
})

describe('transferAmountError', () => {
  const USDC = { symbol: 'USDC', decimals: 6 }
  const FOUR_USDC = 4_000_000n

  it('accepts an amount up to the available balance', () => {
    expect(transferAmountError('1.5', USDC, FOUR_USDC)).toBeUndefined()
    expect(transferAmountError('4', USDC, FOUR_USDC)).toBeUndefined()
  })

  it('says nothing about an empty field', () => {
    expect(transferAmountError('', USDC, FOUR_USDC)).toBeUndefined()
  })

  it('rejects zero, nonsense and too many decimals', () => {
    expect(transferAmountError('0.000', USDC, FOUR_USDC)).toBe('Enter an amount above zero.')
    expect(transferAmountError('.', USDC, FOUR_USDC)).toBe('Enter a valid amount.')
    expect(transferAmountError('1.1234567', USDC, FOUR_USDC)).toBe(
      'Too many decimal places (max: 6)'
    )
  })

  it('rejects more than the available balance once it is known', () => {
    expect(transferAmountError('4.000001', USDC, FOUR_USDC)).toContain(
      'More than your Available balance of'
    )
    expect(transferAmountError('4.000001', USDC, undefined)).toBeUndefined()
  })
})

describe('transferErrorMessage', () => {
  const apiError = (status: number, detail?: unknown) =>
    new AccountingApiError(`API request failed: ${status}`, status, detail as string | undefined)

  it('recognises a rejected signature, also when wrapped', () => {
    const rejected = new UserRejectedRequestError(new Error('User denied'))
    expect(transferErrorMessage(rejected)).toBe('You rejected the signature request.')
    expect(transferErrorMessage(new BaseError('Signing failed', { cause: rejected }))).toBe(
      'You rejected the signature request.'
    )
  })

  it('explains a nonce taken by another operation', () => {
    const pending = 'Another operation was still pending. Check your activity, then try again.'
    expect(
      transferErrorMessage(apiError(422, 'Transaction reverted: InvalidNonce (module: evm)'))
    ).toBe(pending)
    expect(transferErrorMessage(apiError(400, 'Transfer nonce mismatch: got 3, expected 4.'))).toBe(
      pending
    )
  })

  it('explains a balance that dropped before execution', () => {
    expect(
      transferErrorMessage(apiError(422, 'Transaction reverted: InsufficientBalance (module: evm)'))
    ).toBe('Your balance was too low when the transfer ran.')
  })

  it("shows the API's detail, or the error message without one", () => {
    expect(transferErrorMessage(apiError(500, 'Relayer unavailable'))).toBe('Relayer unavailable')
    expect(transferErrorMessage(apiError(422, [{ msg: 'field required' }]))).toBe(
      'API request failed: 422'
    )
    expect(transferErrorMessage(new TransferRateLimitedError())).toBe(
      'Too many transfers. Try again later.'
    )
  })
})
