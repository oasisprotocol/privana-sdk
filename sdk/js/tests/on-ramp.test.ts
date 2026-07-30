import { describe, expect, it } from 'bun:test'
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  type Address as ViemAddress,
} from 'viem'
import { AccountingApiError, PrivanaClient } from '../src/sdk/client'
import { checkDepositWithFinalityRetry } from '../src/sdk/hooks/deposit-finality'
import { clearPendingLock, loadPendingLock, savePendingLock } from '../src/sdk/hooks/pending-lock'
import {
  moonPayOnRampAdapter,
  normalizeMoonPayProviderEvent,
} from '../src/sdk/on-ramp/moonpay-adapter'
import {
  assertOnRampRecordProvider,
  matchesOnRampTransaction,
  resolveOnRampProviderEventTarget,
  verifyPendingOnRampsSequentially,
} from '../src/sdk/on-ramp/provider'
import {
  createPendingOnRampReadCoordinator,
  discardInvalidOnRampIntent,
  forgetUnresolvedOnRampIntent,
  getOnRampCloseRecoveryAction,
  getPendingOnRampsWithRecovery,
  loadUnresolvedOnRampIntents,
  MAX_UNRESOLVED_ONRAMP_INTENTS,
  MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS,
  rememberUnresolvedOnRampIntent,
  type OnRampRecoveryScope,
} from '../src/sdk/on-ramp/recovery'
import { assertErc20OnRampToken, deliveredErc20Amount } from '../src/sdk/on-ramp/receipt'
import { settlePendingOnRampLock } from '../src/sdk/on-ramp/settlement'
import type {
  Address,
  Bytes32,
  LockFundsRequest,
  OnRampRecord,
  PendingOnRampsResponse,
} from '../src/sdk/types'

const BASE_URL = 'https://privana.example.com'
const OWNER = '0x000000000000000000000000000000000000dEaD' as Address
const DEPOSIT = '0x1111111111111111111111111111111111111111' as Address
const OTHER = '0x2222222222222222222222222222222222222222' as Address
const TOKEN = '0x3333333333333333333333333333333333333333' as Address
const OTHER_TOKEN = '0x4444444444444444444444444444444444444444' as Address
const TOKEN_ID = `0x${'aa'.repeat(32)}` as Bytes32
const CHAIN_ID = 84532
const TX_HASH = `0x${'11'.repeat(32)}` as `0x${string}`
const TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
)

function makeRecord(overrides: Partial<OnRampRecord> = {}): OnRampRecord {
  return {
    transaction_id: 'intent-1',
    external_transaction_id: 'intent-1',
    provider: 'moonpay',
    provider_transaction_id: 'provider-1',
    provider_asset_code: 'usdc_base',
    moonpay_transaction_id: 'provider-1',
    status: 'completed',
    wallet_address: DEPOSIT,
    token_id: TOKEN_ID,
    chain_id: CHAIN_ID,
    moonpay_currency_code: 'usdc_base',
    quote_currency_amount: '10',
    on_chain_tx_hash: TX_HASH,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  }
}

function createStorageStub(): Storage {
  const values = new Map<string, string>()
  return {
    get length() {
      return values.size
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  }
}

async function withBrowserStorage(run: () => Promise<void>): Promise<void> {
  const globals = globalThis as { window?: unknown }
  const original = globals.window
  globals.window = {
    localStorage: createStorageStub(),
    sessionStorage: createStorageStub(),
  }
  try {
    await run()
  } finally {
    if (original === undefined) delete globals.window
    else globals.window = original
  }
}

function recoveryScope(): OnRampRecoveryScope {
  return { apiUrl: BASE_URL, chainId: CHAIN_ID, userAddress: OWNER }
}

function transferLog({
  token = TOKEN,
  to = DEPOSIT,
  amount,
}: {
  token?: Address
  to?: Address
  amount: bigint
}) {
  return {
    address: token,
    topics: encodeEventTopics({
      abi: [TRANSFER_EVENT],
      eventName: 'Transfer',
      args: { from: OTHER, to },
    }),
    data: encodeAbiParameters([{ type: 'uint256' }], [amount]),
  }
}

function lockPayload(overrides: Partial<LockFundsRequest> = {}): LockFundsRequest {
  return {
    service_address: OTHER,
    token_id: TOKEN_ID,
    amount: '1000',
    expiry: String(Math.floor(Date.now() / 1000) + 3600),
    nonce: '1',
    signature: '0xsigned',
    ...overrides,
  }
}

describe('MoonPay provider adapter', () => {
  it('builds only the MoonPay compatibility field in a provider-neutral intent request', () => {
    expect(
      moonPayOnRampAdapter.buildIntentRequest({
        walletAddress: DEPOSIT,
        tokenId: TOKEN_ID,
        chainId: CHAIN_ID,
        providerAssetCode: 'usdc_base',
      })
    ).toEqual({
      wallet_address: DEPOSIT,
      token_id: TOKEN_ID,
      chain_id: CHAIN_ID,
      moonpay_currency_code: 'usdc_base',
    })
  })

  it('normalizes raw widget events and preserves the echoed signed intent', () => {
    expect(
      normalizeMoonPayProviderEvent('transaction-completed', {
        id: 'moonpay-1',
        externalTransactionId: 'intent-1',
      })
    ).toEqual({
      provider: 'moonpay',
      kind: 'transaction-completed',
      providerTransactionId: 'moonpay-1',
      intentId: 'intent-1',
    })
  })

  it('keeps MoonPay transaction mapping inside the adapter', async () => {
    let captured:
      | {
          transactionId: string
          request: Record<string, unknown>
        }
      | undefined
    const client = {
      updateOnRamp: async (transactionId: string, request: Record<string, unknown>) => {
        captured = { transactionId, request }
        return makeRecord()
      },
    } as unknown as PrivanaClient

    await moonPayOnRampAdapter.registerTransaction?.({
      client,
      intentId: 'intent-1',
      providerTransactionId: 'moonpay-1',
      tokenId: TOKEN_ID,
      chainId: CHAIN_ID,
    })

    expect(captured).toEqual({
      transactionId: 'intent-1',
      request: {
        token_id: TOKEN_ID,
        chain_id: CHAIN_ID,
        moonpay_transaction_id: 'moonpay-1',
      },
    })
  })
})

describe('provider event and record policy', () => {
  it('correlates the active checkout and rejects a different adapter', () => {
    const active = resolveOnRampProviderEventTarget('moonpay', 'intent-1', {
      provider: 'moonpay',
      kind: 'transaction-created',
      providerTransactionId: 'provider-1',
      intentId: 'intent-1',
    })
    expect(active).toEqual({ intentId: 'intent-1', isActive: true, isStale: false })

    expect(() =>
      resolveOnRampProviderEventTarget('moonpay', 'intent-1', {
        provider: 'transak',
        kind: 'transaction-created',
        providerTransactionId: 'provider-1',
      })
    ).toThrow('does not match configured adapter')
  })

  it('does not let a stale provider event hijack a newer purchase', () => {
    const target = resolveOnRampProviderEventTarget('moonpay', 'intent-new', {
      provider: 'moonpay',
      kind: 'transaction-completed',
      providerTransactionId: 'provider-old',
      intentId: 'intent-old',
    })
    expect(target).toEqual({ intentId: 'intent-old', isActive: false, isStale: true })
  })

  it('matches normalized and MoonPay compatibility correlation ids', () => {
    const record = makeRecord()
    expect(matchesOnRampTransaction(record, 'intent-1')).toBe(true)
    expect(matchesOnRampTransaction(record, 'provider-1')).toBe(true)
    expect(matchesOnRampTransaction(record, 'missing')).toBe(false)
  })

  it('rejects a newly returned intent that differs from the configured adapter', () => {
    expect(() =>
      assertOnRampRecordProvider(
        makeRecord({ provider: 'transak', provider_asset_code: 'USDC' }),
        'moonpay'
      )
    ).toThrow('does not match configured adapter')
  })
})

describe('durable on-ramp recovery', () => {
  it('retains the signed intent and pending lock when the provider closes without an event', async () => {
    await withBrowserStorage(async () => {
      const scope = recoveryScope()
      const payload = lockPayload()
      expect(rememberUnresolvedOnRampIntent(scope, 'intent-1', 100)).toBe(true)
      savePendingLock(OWNER, 'intent-1', payload)

      expect(getOnRampCloseRecoveryAction('intent-1', false)).toBe('refresh-and-retain')
      expect(loadUnresolvedOnRampIntents(scope, 101)).toEqual([
        {
          transactionId: 'intent-1',
          savedAt: 100,
        },
      ])
      expect(loadPendingLock(OWNER, 'intent-1')).toEqual(payload)

      forgetUnresolvedOnRampIntent(scope, 'intent-1', 104)
      expect(loadUnresolvedOnRampIntents(scope, 105)).toEqual([])
    })
  })

  it('retains the newest ten unresolved purchases and deduplicates an updated intent', async () => {
    await withBrowserStorage(async () => {
      const scope = recoveryScope()
      for (let index = 0; index < MAX_UNRESOLVED_ONRAMP_INTENTS + 2; index++) {
        rememberUnresolvedOnRampIntent(scope, `intent-${index}`, index + 1)
      }
      rememberUnresolvedOnRampIntent(scope, 'intent-11', 20)

      const intents = loadUnresolvedOnRampIntents(scope, 21)
      expect(intents).toHaveLength(MAX_UNRESOLVED_ONRAMP_INTENTS)
      expect(intents[0]?.transactionId).toBe('intent-2')
      expect(intents.at(-1)).toMatchObject({ transactionId: 'intent-11', savedAt: 20 })
    })
  })

  it('drops one malformed local entry without losing valid recovery', async () => {
    await withBrowserStorage(async () => {
      const scope = recoveryScope()
      rememberUnresolvedOnRampIntent(scope, 'valid', 100)
      const key = window.localStorage.key(0)
      expect(key).not.toBeNull()
      const stored = JSON.parse(window.localStorage.getItem(key!) ?? '{}') as {
        intents: unknown[]
      }
      stored.intents.push({ transactionId: '', savedAt: 'invalid' })
      window.localStorage.setItem(key!, JSON.stringify(stored))
      window.sessionStorage.setItem(key!, JSON.stringify(stored))

      expect(loadUnresolvedOnRampIntents(scope, 101)).toEqual([
        { transactionId: 'valid', savedAt: 100 },
      ])
    })
  })

  it('isolates one invalid stored intent, removes only it, and retries the valid batch', async () => {
    const calls: string[][] = []
    const invalid: string[] = []
    const client = {
      getPendingOnRamps: async (ids: readonly string[] = []) => {
        calls.push([...ids])
        if (ids.includes('bad')) throw new AccountingApiError('Bad intent', 400)
        return { pending: [makeRecord()] }
      },
    } as Pick<PrivanaClient, 'getPendingOnRamps'>

    const result = await getPendingOnRampsWithRecovery({
      client,
      intentIds: ['valid', 'bad'],
      onInvalidIntent: (intent) => invalid.push(intent),
    })

    expect(result.pending).toHaveLength(1)
    expect(invalid).toEqual(['bad'])
    expect(calls).toEqual([['valid', 'bad'], ['valid'], ['bad'], ['valid']])
  })

  it('clears a definitively rejected active intent without deleting its recoverable lock', async () => {
    await withBrowserStorage(async () => {
      const scope = recoveryScope()
      const payload = lockPayload()
      rememberUnresolvedOnRampIntent(scope, 'bad', 100)
      savePendingLock(OWNER, 'bad', payload)

      expect(discardInvalidOnRampIntent(scope, 'bad', 'bad')).toEqual({
        activeIntentId: null,
        invalidatedActiveIntent: true,
      })
      expect(loadUnresolvedOnRampIntents(scope, 101)).toEqual([])
      expect(loadPendingLock(OWNER, 'bad')).toEqual(payload)
    })
  })

  it('keeps durable recovery isolated and intact across authenticated scope changes', async () => {
    await withBrowserStorage(async () => {
      const originalScope = recoveryScope()
      const nextScope = { ...originalScope, userAddress: OTHER }
      rememberUnresolvedOnRampIntent(originalScope, 'intent-1', 100)
      savePendingLock(OWNER, 'intent-1', lockPayload())

      expect(loadUnresolvedOnRampIntents(nextScope, 101)).toEqual([])
      expect(loadUnresolvedOnRampIntents(originalScope, 101)).toEqual([
        { transactionId: 'intent-1', savedAt: 100 },
      ])
      expect(loadPendingLock(OWNER, 'intent-1')).toBeDefined()
    })
  })

  it('falls back to an unfiltered read when no recovery hints exist', async () => {
    const calls: string[][] = []
    const client = {
      getPendingOnRamps: async (ids: readonly string[] = []) => {
        calls.push([...ids])
        return { pending: [makeRecord()] }
      },
    } as Pick<PrivanaClient, 'getPendingOnRamps'>

    const result = await getPendingOnRampsWithRecovery({
      client,
      intentIds: [],
      onInvalidIntent: () => undefined,
    })

    expect(result.pending).toHaveLength(1)
    expect(calls).toEqual([[]])
  })

  it('removes every invalid recovery hint before retrying the unfiltered read', async () => {
    const calls: string[][] = []
    const invalid: string[] = []
    const client = {
      getPendingOnRamps: async (ids: readonly string[] = []) => {
        calls.push([...ids])
        if (ids.length > 0) throw new AccountingApiError('Bad intent', 400)
        return { pending: [makeRecord()] }
      },
    } as Pick<PrivanaClient, 'getPendingOnRamps'>

    const result = await getPendingOnRampsWithRecovery({
      client,
      intentIds: ['bad-1', 'bad-2'],
      onInvalidIntent: (intent) => invalid.push(intent),
    })

    expect(result.pending).toHaveLength(1)
    expect(invalid).toEqual(['bad-1', 'bad-2'])
    expect(calls).toEqual([['bad-1', 'bad-2'], ['bad-1'], ['bad-2'], []])
  })
})

describe('pending on-ramp request ownership', () => {
  it('coalesces overlapping pollers and enforces the rate-safe request interval', async () => {
    let now = 0
    let reads = 0
    const sleeps: number[] = []
    const readPending = createPendingOnRampReadCoordinator({
      read: async () => ++reads,
      intervalMs: 3_000,
      now: () => now,
      sleep: async (milliseconds) => {
        sleeps.push(milliseconds)
        now += milliseconds
      },
    })

    const first = readPending()
    const overlappingFirst = readPending()
    expect(overlappingFirst).toBe(first)
    await expect(first).resolves.toBe(1)

    const second = readPending()
    const overlappingSecond = readPending()
    expect(overlappingSecond).toBe(second)
    await expect(second).resolves.toBe(2)

    expect(sleeps).toEqual([MIN_ONRAMP_PENDING_REQUEST_INTERVAL_MS])
    expect(reads).toBe(2)
  })
})

describe('pending verification sequencing', () => {
  it('keeps exact recovery provider-neutral across a deployment switch', async () => {
    const started: string[] = []
    await verifyPendingOnRampsSequentially({
      records: [
        makeRecord({
          provider: 'transak',
          provider_asset_code: 'USDC',
          moonpay_transaction_id: undefined,
          moonpay_currency_code: undefined,
        }),
      ],
      shouldStop: () => false,
      wasTriggered: () => false,
      trigger: async (record) => void started.push(`${record.provider}:${record.transaction_id}`),
      waitForTerminal: async () => undefined,
    })
    expect(started).toEqual(['transak:intent-1'])
  })

  it('waits for one purchase to reach a terminal state before starting the next', async () => {
    const started: string[] = []
    let releaseFirst: (() => void) | undefined
    const firstTerminal = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const run = verifyPendingOnRampsSequentially({
      records: [
        makeRecord({ transaction_id: 'intent-1', on_chain_tx_hash: TX_HASH }),
        makeRecord({
          transaction_id: 'intent-2',
          on_chain_tx_hash: `0x${'22'.repeat(32)}`,
        }),
      ],
      shouldStop: () => false,
      wasTriggered: () => false,
      trigger: async (record) => {
        started.push(record.transaction_id)
      },
      waitForTerminal: (key) => (key === TX_HASH ? firstTerminal : Promise.resolve()),
    })

    await Promise.resolve()
    expect(started).toEqual(['intent-1'])
    releaseFirst?.()
    await run
    expect(started).toEqual(['intent-1', 'intent-2'])
  })

  it('skips incomplete rows and continues after a definitive candidate failure', async () => {
    const started: string[] = []
    await verifyPendingOnRampsSequentially({
      records: [
        makeRecord({ transaction_id: 'not-delivered', on_chain_tx_hash: undefined }),
        makeRecord({
          transaction_id: 'provider-amount-missing',
          quote_currency_amount: undefined,
        }),
        makeRecord({ transaction_id: 'rejected' }),
        makeRecord({
          transaction_id: 'next',
          on_chain_tx_hash: `0x${'33'.repeat(32)}`,
        }),
      ],
      shouldStop: () => false,
      wasTriggered: () => false,
      trigger: async (record) => {
        started.push(record.transaction_id)
        if (record.transaction_id === 'rejected') throw new Error('candidate rejected')
      },
      waitForTerminal: async () => undefined,
    })
    expect(started).toEqual(['provider-amount-missing', 'rejected', 'next'])
  })
})

describe('deposit finality retry', () => {
  it('retries backend-reported insufficient finality without hardcoding confirmation depth', async () => {
    const retries: string[] = []
    const sleeps: number[] = []
    let attempt = 0
    const result = await checkDepositWithFinalityRetry({
      checkDeposit: async () => {
        attempt++
        if (attempt < 3) {
          return {
            status: 'error',
            detail: `Insufficient finality: ${attempt}/32 confirmations`,
          }
        }
        return { status: 'pending', deposit_id: 'deposit-1' }
      },
      isStale: () => false,
      onRetry: (message) => retries.push(message),
      timeoutMs: 60_000,
      retryIntervalMs: 15_000,
      now: () => 1,
      sleep: async (milliseconds) => void sleeps.push(milliseconds),
    })

    expect(result).toEqual({
      kind: 'response',
      response: { status: 'pending', deposit_id: 'deposit-1' },
    })
    expect(retries).toEqual([
      'Insufficient finality: 1/32 confirmations',
      'Insufficient finality: 2/32 confirmations',
    ])
    expect(sleeps).toEqual([15_000, 15_000])
  })

  it('also retries an insufficient-finality API error, then returns credited', async () => {
    let attempt = 0
    const result = await checkDepositWithFinalityRetry({
      checkDeposit: async () => {
        attempt++
        if (attempt === 1) {
          throw new AccountingApiError(
            'Bad request',
            400,
            'Insufficient finality: 4/12 confirmations'
          )
        }
        return { status: 'credited', amount: '1000' }
      },
      isStale: () => false,
      onRetry: () => undefined,
      timeoutMs: 60_000,
      retryIntervalMs: 1,
      now: () => 1,
      sleep: async () => undefined,
    })
    expect(result).toEqual({
      kind: 'response',
      response: { status: 'credited', amount: '1000' },
    })
  })

  it('stops before another backend check when the candidate becomes stale', async () => {
    let checks = 0
    const result = await checkDepositWithFinalityRetry({
      checkDeposit: async () => {
        checks++
        return { status: 'pending', deposit_id: 'deposit-1' }
      },
      isStale: () => true,
      onRetry: () => undefined,
      timeoutMs: 60_000,
      retryIntervalMs: 1,
    })

    expect(result).toEqual({ kind: 'stale' })
    expect(checks).toBe(0)
  })

  it('returns a timeout after backend-reported insufficient finality exceeds the deadline', async () => {
    let sleeps = 0
    const result = await checkDepositWithFinalityRetry({
      checkDeposit: async () => ({
        status: 'error',
        detail: 'Insufficient finality: 1/32 confirmations',
      }),
      isStale: () => false,
      onRetry: () => undefined,
      timeoutMs: 1,
      retryIntervalMs: 1,
      startedAt: 0,
      now: () => 2,
      sleep: async () => {
        sleeps++
      },
    })

    expect(result).toEqual({ kind: 'timeout' })
    expect(sleeps).toBe(0)
  })
})

describe('on-chain credit authority', () => {
  it('sums only matching token transfers to the derived deposit address', () => {
    const amount = deliveredErc20Amount(
      [
        transferLog({ amount: 4n }),
        transferLog({ amount: 6n }),
        transferLog({ amount: 100n, to: OTHER }),
        transferLog({ amount: 100n, token: OTHER_TOKEN }),
      ],
      TOKEN as ViemAddress,
      DEPOSIT as ViemAddress
    )
    expect(amount).toBe(10n)
  })

  it('does not fall back to provider amounts when the receipt has no matching transfer', () => {
    expect(
      deliveredErc20Amount(
        [transferLog({ amount: 100n, to: OTHER })],
        TOKEN as ViemAddress,
        DEPOSIT as ViemAddress
      )
    ).toBe(0n)
  })

  it('rejects native assets instead of treating a provider amount as authority', () => {
    expect(() => assertErc20OnRampToken('0x0000000000000000000000000000000000000000')).toThrow(
      'ERC-20 tokens only'
    )
  })
})

describe('on-ramp client wire format', () => {
  it('sends at most ten repeated externalTransactionId query values', async () => {
    const originalFetch = globalThis.fetch
    let requestUrl = ''
    globalThis.fetch = async (input) => {
      requestUrl = String(input)
      return Response.json({ pending: [] } satisfies PendingOnRampsResponse)
    }
    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      await client.getPendingOnRamps(Array.from({ length: 12 }, (_, index) => `intent ${index}`))
      const url = new URL(requestUrl)
      expect(url.searchParams.getAll('externalTransactionId')).toEqual(
        Array.from({ length: 10 }, (_, index) => `intent ${index}`)
      )
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('omits obsolete fiat fields from create-intent requests', async () => {
    const originalFetch = globalThis.fetch
    let requestBody: Record<string, unknown> | undefined
    globalThis.fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body))
      return Response.json(makeRecord())
    }
    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL })
      await client.createOnRampIntent({
        wallet_address: DEPOSIT,
        token_id: TOKEN_ID,
        chain_id: CHAIN_ID,
        moonpay_currency_code: 'usdc_base',
      })
      expect(requestBody).toEqual({
        wallet_address: DEPOSIT.toLowerCase(),
        token_id: TOKEN_ID,
        chain_id: CHAIN_ID,
        moonpay_currency_code: 'usdc_base',
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})

describe('post-credit lock settlement', () => {
  it('replays the persisted signature after reload and clears it after API acceptance', async () => {
    await withBrowserStorage(async () => {
      const payload = lockPayload()
      savePendingLock(OWNER, 'intent-1', payload)
      const calls: LockFundsRequest[] = []
      const client = {
        lockFunds: async (request: LockFundsRequest) => {
          calls.push(request)
          return { status: 'submitted', submission_id: 'submission-1' }
        },
      } as unknown as PrivanaClient

      const result = await settlePendingOnRampLock({
        client,
        userAddress: OWNER,
        transactionId: 'intent-1',
        creditedAmount: 1000n,
      })

      expect(result).toMatchObject({ kind: 'submitted', payload })
      expect(calls).toEqual([payload])
      expect(loadPendingLock(OWNER, 'intent-1')).toBeUndefined()
    })
  })

  it('reports no lock for an ordinary purchase without manufacturing a failure', async () => {
    await withBrowserStorage(async () => {
      clearPendingLock(OWNER, 'intent-1')
      const result = await settlePendingOnRampLock({
        client: { lockFunds: async () => ({ status: 'submitted' }) } as unknown as PrivanaClient,
        userAddress: OWNER,
        transactionId: 'intent-1',
        creditedAmount: 1000n,
      })
      expect(result).toEqual({ kind: 'not-found' })
    })
  })

  it('clears the persisted signature after a failed API attempt settles', async () => {
    await withBrowserStorage(async () => {
      savePendingLock(OWNER, 'intent-1', lockPayload())
      const client = {
        lockFunds: async () => {
          throw new Error('submission rejected')
        },
      } as unknown as PrivanaClient

      await expect(
        settlePendingOnRampLock({
          client,
          userAddress: OWNER,
          transactionId: 'intent-1',
          creditedAmount: 1000n,
        })
      ).rejects.toThrow('submission rejected')
      expect(loadPendingLock(OWNER, 'intent-1')).toBeUndefined()
    })
  })
})
