import { describe, expect, it } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AccountingApiError, PrivanaClient } from '../src/sdk/client'
import { executeSiwePrivateReadRequest } from '../src/sdk/hooks/use-private-read-request'
import {
  normalizeTransakWidgetMessage,
  requestTransakWidgetSession,
  resolveTransakWidgetMessage,
  transakOnRampAdapter,
  validateTransakWidgetSession,
  type TransakMessageEvent,
  type TransakWidgetSession,
} from '../src/sdk/on-ramp/transak-adapter'
import {
  isTransakWidgetFrameRenderable,
  TransakWidgetFrame,
} from '../src/sdk/on-ramp/transak-frame'
import {
  getMountedTransakSessionError,
  getTransakRecreateSessionError,
  getTransakSessionContextError,
  getTransakSessionRequestError,
  hasTransakProviderEvidence,
  shouldSurfaceTransakSessionFailure,
  transitionTransakSessionRecreation,
} from '../src/sdk/hooks/use-transak-on-ramp'
import { recordOnRampProviderDeposit } from '../src/sdk/on-ramp/provider'
import type {
  Address,
  Bytes32,
  CreateOnRampSessionRequest,
  OnRampIpAttestation,
  OnRampRecord,
  OnRampSessionResponse,
} from '../src/sdk/types'

const BASE_URL = 'https://privana.example.com'
const DEPOSIT = '0x1111111111111111111111111111111111111111' as Address
const TOKEN_ID = `0x${'aa'.repeat(32)}` as Bytes32
const INTENT_ID = 'signed-intent-1'
const WIDGET_URL = 'https://global-stg.transak.com/?sessionId=opaque-token'
const NOW = 1_800_000_000_000
const TEST_ORIGIN = 'https://app.testnet.privana.finance'
const INTENT_HASH = '6bdf3b7de575169b5fc37269f6c0af116e3d5d3fd083b7af5bb9c2a3263c5941'

function ipAttestation(sequence: number): OnRampIpAttestation {
  return {
    v: 1,
    ip: '8.8.8.8',
    iat: NOW / 1000,
    exp: NOW / 1000 + 60,
    nonce: sequence.toString(16).padStart(32, '0'),
    sig: sequence.toString(16).padStart(64, '0'),
  }
}

function sessionResponse(overrides: Partial<OnRampSessionResponse> = {}): OnRampSessionResponse {
  return {
    provider: 'transak',
    url: WIDGET_URL,
    expires_at: NOW / 1000 + 300,
    ...overrides,
  }
}

async function withTestBrowserOrigin<T>(operation: () => Promise<T>): Promise<T> {
  const originalLocation = Object.getOwnPropertyDescriptor(globalThis, 'location')
  Object.defineProperty(globalThis, 'location', {
    configurable: true,
    value: { origin: TEST_ORIGIN },
  })
  try {
    return await operation()
  } finally {
    if (originalLocation) Object.defineProperty(globalThis, 'location', originalLocation)
    else Reflect.deleteProperty(globalThis, 'location')
  }
}

function widgetSession(overrides: Partial<TransakWidgetSession> = {}): TransakWidgetSession {
  return {
    provider: 'transak',
    url: WIDGET_URL,
    origin: 'https://global-stg.transak.com',
    expiresAt: NOW / 1000 + 300,
    intentId: INTENT_ID,
    generation: 7,
    ...overrides,
  }
}

describe('Transak provider adapter', () => {
  it('builds an intent without MoonPay compatibility fields and keeps poll-only recovery on', () => {
    expect(
      transakOnRampAdapter.buildIntentRequest({
        walletAddress: DEPOSIT,
        tokenId: TOKEN_ID,
        chainId: 84532,
        providerAssetCode: 'usdc',
      })
    ).toEqual({
      wallet_address: DEPOSIT,
      token_id: TOKEN_ID,
      chain_id: 84532,
    })
    expect(transakOnRampAdapter.pollPendingWhileOpen).toBe(true)
    expect(transakOnRampAdapter.registerTransaction).toBeUndefined()
    expect(transakOnRampAdapter.recordDeposit).toBeUndefined()
  })

  it('does not call the MoonPay compatibility route after a Transak credit', async () => {
    let updateCalls = 0
    const client = {
      updateOnRamp: async () => {
        updateCalls++
        throw new Error('must not be called')
      },
    } as unknown as PrivanaClient
    const record = {
      transaction_id: INTENT_ID,
      external_transaction_id: INTENT_ID,
      provider: 'transak',
      provider_asset_code: 'usdc',
      status: 'completed',
      on_chain_tx_hash: `0x${'11'.repeat(32)}`,
      created_at: NOW / 1000,
      updated_at: NOW / 1000,
    } satisfies OnRampRecord

    await expect(
      recordOnRampProviderDeposit(transakOnRampAdapter, {
        client,
        record,
        depositTxHash: record.on_chain_tx_hash,
      })
    ).resolves.toBeUndefined()
    expect(updateCalls).toBe(0)
  })

  it('fetches fresh intent-bound attestations for initial and recreated sessions', async () => {
    const requests: CreateOnRampSessionRequest[] = []
    const attestationRequests: Array<{ input: string; init?: RequestInit }> = []
    let attestationCount = 0
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      attestationRequests.push({ input: String(input), init })
      attestationCount++
      return Response.json(ipAttestation(attestationCount))
    }
    const client = {
      createOnRampSession: async (request: CreateOnRampSessionRequest) => {
        requests.push(request)
        return sessionResponse({
          url: `https://global-stg.transak.com/?sessionId=session-${requests.length}`,
        })
      },
    } as Pick<PrivanaClient, 'createOnRampSession'>

    expect(requests).toEqual([])
    const [first, second] = await withTestBrowserOrigin(async () => [
      await requestTransakWidgetSession({
        client,
        intentId: INTENT_ID,
        generation: 1,
        now: () => NOW,
        fetcher,
      }),
      await requestTransakWidgetSession({
        client,
        intentId: INTENT_ID,
        generation: 2,
        now: () => NOW,
        fetcher,
      }),
    ])

    expect(
      attestationRequests.map(({ input, init }) => ({
        input,
        method: init?.method,
        contentType: new Headers(init?.headers).get('content-type'),
        body: JSON.parse(String(init?.body)),
        cache: init?.cache,
        credentials: init?.credentials,
        redirect: init?.redirect,
        signalAborted: init?.signal?.aborted,
      }))
    ).toEqual([
      {
        input: `${TEST_ORIGIN}/__onramp-ip-attest`,
        method: 'POST',
        contentType: 'application/json',
        body: { intentHash: INTENT_HASH },
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signalAborted: false,
      },
      {
        input: `${TEST_ORIGIN}/__onramp-ip-attest`,
        method: 'POST',
        contentType: 'application/json',
        body: { intentHash: INTENT_HASH },
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signalAborted: false,
      },
    ])
    expect(requests).toEqual([
      { transaction_id: INTENT_ID, ip_attestation: ipAttestation(1) },
      { transaction_id: INTENT_ID, ip_attestation: ipAttestation(2) },
    ])
    expect(first.url).toEndWith('session-1')
    expect(second.url).toEndWith('session-2')
    expect(second.generation).toBe(2)
  })

  it('fails closed when the attestation route fails or returns invalid JSON', async () => {
    let sessionCalls = 0
    const client = {
      createOnRampSession: async () => {
        sessionCalls++
        return sessionResponse()
      },
    } as Pick<PrivanaClient, 'createOnRampSession'>

    await withTestBrowserOrigin(async () => {
      await expect(
        requestTransakWidgetSession({
          client,
          intentId: INTENT_ID,
          generation: 1,
          fetcher: async () => new Response(null, { status: 503 }),
        })
      ).rejects.toThrow('failed with HTTP 503')
      await expect(
        requestTransakWidgetSession({
          client,
          intentId: INTENT_ID,
          generation: 2,
          fetcher: async () => new Response('{'),
        })
      ).rejects.toThrow('response is malformed')
    })

    expect(sessionCalls).toBe(0)
  })

  it('fetches a new attestation inside an authenticated private-read retry', async () => {
    const requests: CreateOnRampSessionRequest[] = []
    let attestationCount = 0
    const readClient = {
      createOnRampSession: async (request: CreateOnRampSessionRequest) => {
        requests.push(request)
        if (requests.length === 1) throw new AccountingApiError('Unauthorized', 401)
        return sessionResponse()
      },
    } as unknown as PrivanaClient
    const authClient = {
      withPrivateReadToken: () => readClient,
      clearPrivateReadToken: () => undefined,
    } as Pick<PrivanaClient, 'withPrivateReadToken' | 'clearPrivateReadToken'>
    const tokenRefreshes: boolean[] = []

    const session = await withTestBrowserOrigin(() =>
      executeSiwePrivateReadRequest({
        client: authClient,
        scopeKey: 'transak-attestation-retry',
        getToken: async (forceRefresh) => {
          tokenRefreshes.push(forceRefresh)
          return forceRefresh ? 'fresh-token' : 'stale-token'
        },
        request: (client) =>
          requestTransakWidgetSession({
            client,
            intentId: INTENT_ID,
            generation: 1,
            now: () => NOW,
            fetcher: async () => {
              attestationCount++
              return Response.json(ipAttestation(attestationCount))
            },
          }),
      })
    )

    expect(tokenRefreshes).toEqual([false, true])
    expect(requests).toEqual([
      { transaction_id: INTENT_ID, ip_attestation: ipAttestation(1) },
      { transaction_id: INTENT_ID, ip_attestation: ipAttestation(2) },
    ])
    expect(session.url).toBe(WIDGET_URL)
  })
})

describe('Transak session failure ownership', () => {
  it('scopes recreation evidence to the current signed intent', () => {
    const unrelated: OnRampRecord = {
      transaction_id: 'old-row',
      external_transaction_id: 'old-intent',
      provider: 'transak',
      provider_asset_code: 'usdc',
      status: 'completed',
      on_chain_tx_hash: `0x${'22'.repeat(32)}`,
      created_at: NOW / 1000,
      updated_at: NOW / 1000,
    }
    const matching = { ...unrelated, external_transaction_id: INTENT_ID }

    expect(
      hasTransakProviderEvidence({
        status: 'verifying',
        activeIntentId: INTENT_ID,
        pending: [unrelated],
        activeVerificationRecord: unrelated,
      })
    ).toBe(false)
    expect(
      hasTransakProviderEvidence({
        status: 'verifying',
        activeIntentId: INTENT_ID,
        pending: [matching],
        activeVerificationRecord: matching,
      })
    ).toBe(true)
  })

  it('rejects launch and reopen while a checkout is already mounted', () => {
    expect(getMountedTransakSessionError('launch', false)).toBeNull()
    expect(getMountedTransakSessionError('launch', true)?.message).toBe(
      'Close the current Transak checkout before launching another'
    )
    expect(getMountedTransakSessionError('reopen', true)?.message).toBe(
      'Close or expire the current Transak checkout before reopening'
    )
  })

  it('allows same-intent recreation only before provider UI activation', () => {
    let state = transitionTransakSessionRecreation('none', 'intent-created')
    expect(state).toBe('preload-only')
    expect(
      getTransakRecreateSessionError({
        hasMountedSession: false,
        activeIntentId: INTENT_ID,
        canRecreateSession: state === 'preload-only',
      })
    ).toBeNull()

    // A pre-load expiry or close does not add provider evidence, so eligibility
    // remains unchanged until a new session is requested.
    expect(state).toBe('preload-only')
    state = transitionTransakSessionRecreation(state, 'provider-ui-activated')
    expect(state).toBe('blocked')
    expect(
      getTransakRecreateSessionError({
        hasMountedSession: false,
        activeIntentId: INTENT_ID,
        canRecreateSession: state === 'preload-only',
      })?.message
    ).toContain('already be in progress')
  })

  it('blocks recreation after provider evidence or completion recovery', () => {
    const evidenceState = transitionTransakSessionRecreation(
      transitionTransakSessionRecreation('none', 'intent-created'),
      'provider-evidence'
    )
    expect(evidenceState).toBe('blocked')

    expect(
      getTransakRecreateSessionError({
        hasMountedSession: false,
        activeIntentId: null,
        canRecreateSession: false,
      })?.message
    ).toContain('No unresolved')
    expect(transitionTransakSessionRecreation(evidenceState, 'reset')).toBe('none')
  })

  it('allows the initial session request before React commits the prepared intent state', () => {
    expect(
      getTransakSessionContextError({
        currentGeneration: 1,
        expectedGeneration: 1,
        scopeChanged: false,
      })
    ).toBeNull()

    expect(
      getTransakSessionContextError({
        currentGeneration: 2,
        expectedGeneration: 1,
        scopeChanged: false,
      })?.message
    ).toContain('cancelled')
    expect(
      getTransakSessionContextError({
        currentGeneration: 1,
        expectedGeneration: 1,
        scopeChanged: true,
      })?.message
    ).toContain('account or network changed')
  })

  it('rejects a session request that no longer owns a live checkout', () => {
    expect(
      getTransakSessionRequestError({
        currentGeneration: 1,
        expectedGeneration: 1,
        scopeChanged: false,
        activeIntentId: INTENT_ID,
        expectedIntentId: INTENT_ID,
      })
    ).toBeNull()
    expect(
      getTransakSessionRequestError({
        currentGeneration: 2,
        expectedGeneration: 1,
        scopeChanged: false,
        activeIntentId: INTENT_ID,
        expectedIntentId: INTENT_ID,
      })?.message
    ).toContain('cancelled')
    expect(
      getTransakSessionRequestError({
        currentGeneration: 1,
        expectedGeneration: 1,
        scopeChanged: true,
        activeIntentId: INTENT_ID,
        expectedIntentId: INTENT_ID,
      })?.message
    ).toContain('account or network changed')
    expect(
      getTransakSessionRequestError({
        currentGeneration: 1,
        expectedGeneration: 1,
        scopeChanged: false,
        activeIntentId: null,
        expectedIntentId: INTENT_ID,
      })?.message
    ).toContain('no longer active')
  })

  it('never lets a stale session failure replace delivery, verification, or credit state', () => {
    expect(
      shouldSurfaceTransakSessionFailure({
        status: 'awaiting-delivery',
        activeIntentId: INTENT_ID,
        activeVerificationId: null,
        activeVerificationRecord: null,
        expectedIntentId: INTENT_ID,
      })
    ).toBe(false)

    const activeVerificationRecord: OnRampRecord = {
      transaction_id: 'provider-row-id',
      external_transaction_id: INTENT_ID,
      provider: 'transak',
      provider_asset_code: 'usdc',
      status: 'completed',
      created_at: NOW / 1000,
      updated_at: NOW / 1000,
    }
    for (const status of ['verifying', 'credited'] as const) {
      expect(
        shouldSurfaceTransakSessionFailure({
          status,
          activeIntentId: INTENT_ID,
          activeVerificationId: activeVerificationRecord.transaction_id,
          activeVerificationRecord,
          expectedIntentId: INTENT_ID,
        })
      ).toBe(false)
    }

    expect(
      shouldSurfaceTransakSessionFailure({
        status: 'credited',
        activeIntentId: 'new-intent',
        activeVerificationId: INTENT_ID,
        activeVerificationRecord,
        expectedIntentId: 'new-intent',
      })
    ).toBe(true)
    expect(
      shouldSurfaceTransakSessionFailure({
        status: 'awaiting-purchase',
        activeIntentId: INTENT_ID,
        activeVerificationId: null,
        activeVerificationRecord: null,
        expectedIntentId: INTENT_ID,
      })
    ).toBe(true)
    expect(
      shouldSurfaceTransakSessionFailure({
        status: 'awaiting-purchase',
        activeIntentId: 'new-intent',
        activeVerificationId: null,
        activeVerificationRecord: null,
        expectedIntentId: INTENT_ID,
      })
    ).toBe(false)
  })
})

describe('Transak session wire and validation', () => {
  it('keeps attestation optional in the low-level client and passes it through unchanged', async () => {
    const originalFetch = globalThis.fetch
    const requests: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init })
      return Response.json(sessionResponse())
    }
    try {
      const client = new PrivanaClient({ baseUrl: BASE_URL }).withPrivateReadToken('siwe-token')
      const headerModeResponse = await client.createOnRampSession({ transaction_id: INTENT_ID })
      const attestedModeResponse = await client.createOnRampSession({
        transaction_id: INTENT_ID,
        ip_attestation: ipAttestation(1),
      })

      expect(requests.map(({ url }) => url)).toEqual([
        `${BASE_URL}/v1/accounting/onramp/session`,
        `${BASE_URL}/v1/accounting/onramp/session`,
      ])
      expect(requests.map(({ init }) => init?.method)).toEqual(['POST', 'POST'])
      expect(requests.map(({ init }) => JSON.parse(String(init?.body)))).toEqual([
        { transaction_id: INTENT_ID },
        { transaction_id: INTENT_ID, ip_attestation: ipAttestation(1) },
      ])
      expect(requests.map(({ init }) => new Headers(init?.headers).get('X-SIWE-Token'))).toEqual([
        'siwe-token',
        'siwe-token',
      ])
      expect(headerModeResponse).toEqual(sessionResponse())
      expect(attestedModeResponse).toEqual(sessionResponse())
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('accepts only exact official widget origins and preserves the opaque URL', () => {
    const staging = validateTransakWidgetSession(sessionResponse(), INTENT_ID, 1, NOW)
    const productionUrl = 'https://global.transak.com/path?sessionId=opaque%2Bvalue'
    const production = validateTransakWidgetSession(
      sessionResponse({ url: productionUrl }),
      INTENT_ID,
      2,
      NOW
    )

    expect(staging.url).toBe(WIDGET_URL)
    expect(staging.origin).toBe('https://global-stg.transak.com')
    expect(production.url).toBe(productionUrl)
    expect(production.origin).toBe('https://global.transak.com')
  })

  it('rejects malformed, expired, credentialed, and lookalike sessions', () => {
    const invalid: OnRampSessionResponse[] = [
      { ...sessionResponse(), provider: 'moonpay' } as unknown as OnRampSessionResponse,
      sessionResponse({ expires_at: NOW / 1000 }),
      sessionResponse({ url: 'http://global-stg.transak.com/?sessionId=opaque' }),
      sessionResponse({ url: 'https://user:pass@global-stg.transak.com/?sessionId=opaque' }),
      sessionResponse({ url: 'https://global-stg.transak.com.evil.example/?sessionId=opaque' }),
      sessionResponse({ url: 'https://global-stg.transak.com:444/?sessionId=opaque' }),
      sessionResponse({ url: ` ${WIDGET_URL}` }),
      sessionResponse({ url: 'https://global-stg.transak.com\\@evil.example/?sessionId=opaque' }),
      sessionResponse({ url: `${WIDGET_URL}${'a'.repeat(8192)}` }),
    ]

    for (const response of invalid) {
      expect(() => validateTransakWidgetSession(response, INTENT_ID, 1, NOW)).toThrow()
    }
  })
})

describe('Transak iframe message boundary', () => {
  it('requires both the current iframe source and exact origin', () => {
    const source = {} as MessageEventSource
    const replacedSource = {} as MessageEventSource
    const session = widgetSession()
    const message: TransakMessageEvent = {
      origin: session.origin,
      source,
      data: { event_id: 'TRANSAK_ORDER_CREATED', data: { untrusted: true } },
    }

    expect(
      resolveTransakWidgetMessage({
        message,
        iframeWindow: source,
        session,
        currentGeneration: session.generation,
      })
    ).toEqual({
      type: 'provider-event',
      event: {
        provider: 'transak',
        kind: 'transaction-created',
        providerTransactionId: INTENT_ID,
        intentId: INTENT_ID,
      },
    })
    expect(
      resolveTransakWidgetMessage({
        message: { ...message, origin: 'https://global.transak.com' },
        iframeWindow: source,
        session,
        currentGeneration: session.generation,
      })
    ).toBeNull()
    expect(
      resolveTransakWidgetMessage({
        message,
        iframeWindow: replacedSource,
        session,
        currentGeneration: session.generation,
      })
    ).toBeNull()
    expect(
      resolveTransakWidgetMessage({
        message,
        iframeWindow: source,
        session,
        currentGeneration: session.generation + 1,
      })
    ).toBeNull()
  })

  it('uses only the captured signed intent and never trusts order payload fields', () => {
    expect(
      normalizeTransakWidgetMessage(
        {
          event_id: 'TRANSAK_ORDER_SUCCESSFUL',
          data: {
            id: 'untrusted-provider-order',
            partnerOrderId: 'other-intent',
            cryptoAmount: '999999999',
            status: 'COMPLETED',
          },
        },
        INTENT_ID
      )
    ).toEqual({
      type: 'provider-event',
      event: {
        provider: 'transak',
        kind: 'transaction-completed',
        providerTransactionId: INTENT_ID,
        intentId: INTENT_ID,
      },
    })
  })

  it('maps close and non-terminal failure events only to reconciliation hints', () => {
    expect(normalizeTransakWidgetMessage({ event_id: 'TRANSAK_WIDGET_CLOSE' }, INTENT_ID)).toEqual({
      type: 'close',
    })
    expect(
      normalizeTransakWidgetMessage({ event_id: 'TRANSAK_ORDER_CANCELLED' }, INTENT_ID)
    ).toEqual({ type: 'refresh' })
    expect(normalizeTransakWidgetMessage({ event_id: 'TRANSAK_ORDER_FAILED' }, INTENT_ID)).toEqual({
      type: 'refresh',
    })
  })

  it('ignores malformed and unknown message bodies', () => {
    const invalid = [
      null,
      'TRANSAK_ORDER_SUCCESSFUL',
      [],
      {},
      { event_id: 1 },
      { event_id: 'ORDER_SUCCESSFUL' },
      new Date(),
    ]
    for (const data of invalid) {
      expect(normalizeTransakWidgetMessage(data, INTENT_ID)).toBeNull()
    }
  })
})

describe('Transak iframe rendering', () => {
  it('keeps a loaded generation mounted after the single-use URL load deadline', () => {
    const expired = widgetSession({ expiresAt: NOW / 1000 })

    expect(isTransakWidgetFrameRenderable(expired, null, NOW)).toBe(false)
    expect(isTransakWidgetFrameRenderable(expired, expired.generation, NOW)).toBe(true)
    expect(isTransakWidgetFrameRenderable(expired, expired.generation + 1, NOW)).toBe(false)
  })

  it('uses the opaque URL unchanged and preserves the approved Referer', () => {
    const session = widgetSession({ generation: 1, expiresAt: Date.now() / 1000 + 300 })
    const markup = renderToStaticMarkup(
      <TransakWidgetFrame
        session={session}
        getCurrentGeneration={() => session.generation}
        shouldPollPending
        refreshPending={async () => undefined}
        onReady={() => undefined}
        onAction={() => undefined}
        onExpired={() => undefined}
      />
    )

    expect(markup).toContain(`src="${WIDGET_URL}"`)
    expect(markup).toContain('referrerPolicy="strict-origin-when-cross-origin"')
    expect(markup).toContain('allow="camera; microphone; payment"')
    expect(markup).not.toContain('sandbox=')
  })

  it('does not mount an already expired session URL', () => {
    const markup = renderToStaticMarkup(
      <TransakWidgetFrame
        session={widgetSession({ expiresAt: 1 })}
        getCurrentGeneration={() => 7}
        shouldPollPending
        refreshPending={async () => undefined}
        onReady={() => undefined}
        onAction={() => undefined}
        onExpired={() => undefined}
      />
    )
    expect(markup).toBe('')
  })
})
