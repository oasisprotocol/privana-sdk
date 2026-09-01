import type { PrivanaClient } from '../client'
import type { OnRampIpAttestation, OnRampSessionResponse } from '../types'
import type { OnRampProviderAdapter, OnRampProviderEvent } from './provider'

const MAX_INTENT_ID_LENGTH = 512
const MAX_WIDGET_URL_LENGTH = 8192
const TRANSAK_IP_ATTESTATION_PATH = '/__onramp-ip-attest'
const TRANSAK_IP_ATTESTATION_TIMEOUT_MS = 10_000

type TransakAttestationFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

const TRANSAK_WIDGET_ORIGINS = new Set([
  'https://global-stg.transak.com',
  'https://global.transak.com',
])

export const transakOnRampAdapter: OnRampProviderAdapter = {
  provider: 'transak',
  pollPendingWhileOpen: true,
  buildIntentRequest: ({ walletAddress, tokenId, chainId }) => ({
    wallet_address: walletAddress,
    token_id: tokenId,
    chain_id: chainId,
  }),
}

export interface TransakWidgetSession {
  provider: 'transak'
  /** Kept in memory only and used byte-for-byte as the iframe source. */
  url: string
  origin: string
  expiresAt: number
  intentId: string
  generation: number
}

export type TransakWidgetAction =
  | { type: 'ready' }
  | { type: 'refresh' }
  | { type: 'close' }
  | { type: 'provider-event'; event: OnRampProviderEvent }

export interface TransakMessageEvent {
  origin: string
  source: MessageEventSource | null
  data: unknown
}

export async function requestTransakWidgetSession({
  client,
  intentId,
  generation,
  now = Date.now,
  fetcher = globalThis.fetch,
}: {
  client: Pick<PrivanaClient, 'createOnRampSession'>
  intentId: string
  generation: number
  now?: () => number
  fetcher?: TransakAttestationFetcher
}): Promise<TransakWidgetSession> {
  if (!intentId || intentId.length > MAX_INTENT_ID_LENGTH) {
    throw new Error('Transak session requires a valid on-ramp intent')
  }
  const ipAttestation = await fetchTransakIpAttestation({
    intentId,
    fetcher,
  })
  const response = await client.createOnRampSession({
    transaction_id: intentId,
    ip_attestation: ipAttestation,
  })
  return validateTransakWidgetSession(response, intentId, generation, now())
}

async function fetchTransakIpAttestation({
  intentId,
  fetcher,
}: {
  intentId: string
  fetcher: TransakAttestationFetcher
}): Promise<OnRampIpAttestation> {
  const subtleCrypto = globalThis.crypto?.subtle
  const origin = globalThis.location?.origin
  if (typeof fetcher !== 'function' || !subtleCrypto || !origin || origin === 'null') {
    throw new Error('Secure client-IP attestation is unavailable')
  }

  const digest = await subtleCrypto.digest('SHA-256', new TextEncoder().encode(intentId))
  const intentHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TRANSAK_IP_ATTESTATION_TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await fetcher(`${origin}${TRANSAK_IP_ATTESTATION_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intentHash }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal: controller.signal,
      })
    } catch (error) {
      throw new Error('Client-IP attestation request failed', { cause: error })
    }
    if (!response.ok) {
      throw new Error(`Client-IP attestation request failed with HTTP ${response.status}`)
    }

    try {
      return (await response.json()) as OnRampIpAttestation
    } catch (error) {
      throw new Error('Client-IP attestation response is malformed', { cause: error })
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

export function validateTransakWidgetSession(
  response: OnRampSessionResponse,
  intentId: string,
  generation: number,
  now: number = Date.now()
): TransakWidgetSession {
  if (!isPlainRecord(response) || response.provider !== 'transak') {
    throw new Error('On-ramp session provider does not match Transak')
  }
  if (!Number.isSafeInteger(response.expires_at) || response.expires_at * 1000 <= now) {
    throw new Error('Transak session is expired or malformed')
  }

  const origin = validateTransakWidgetUrl(response.url)
  return {
    provider: 'transak',
    url: response.url,
    origin,
    expiresAt: response.expires_at,
    intentId,
    generation,
  }
}

export function isTransakWidgetSessionLoadable(
  session: TransakWidgetSession,
  now: number = Date.now()
): boolean {
  return session.expiresAt * 1000 > now
}

/**
 * Accept a widget message only from the currently mounted iframe at the exact
 * origin of its validated, backend-issued session URL.
 */
export function resolveTransakWidgetMessage({
  message,
  iframeWindow,
  session,
  currentGeneration,
}: {
  message: TransakMessageEvent
  iframeWindow: MessageEventSource | null
  session: TransakWidgetSession
  currentGeneration: number
}): TransakWidgetAction | null {
  if (session.generation !== currentGeneration) return null
  if (!iframeWindow || message.source !== iframeWindow) return null
  if (message.origin !== session.origin) return null
  return normalizeTransakWidgetMessage(message.data, session.intentId)
}

export function normalizeTransakWidgetMessage(
  data: unknown,
  intentId: string
): TransakWidgetAction | null {
  if (!isPlainRecord(data) || typeof data.event_id !== 'string') return null

  switch (data.event_id) {
    case 'TRANSAK_WIDGET_INITIALISED':
    case 'TRANSAK_WIDGET_OPEN':
      return { type: 'ready' }
    case 'TRANSAK_ORDER_CREATED':
      return {
        type: 'provider-event',
        event: {
          provider: 'transak',
          kind: 'transaction-created',
          providerTransactionId: intentId,
          intentId,
        },
      }
    case 'TRANSAK_ORDER_SUCCESSFUL':
      return {
        type: 'provider-event',
        event: {
          provider: 'transak',
          kind: 'transaction-completed',
          providerTransactionId: intentId,
          intentId,
        },
      }
    case 'TRANSAK_ORDER_CANCELLED':
    case 'TRANSAK_ORDER_FAILED':
      return { type: 'refresh' }
    case 'TRANSAK_WIDGET_CLOSE':
      return { type: 'close' }
    default:
      return null
  }
}

function validateTransakWidgetUrl(url: string): string {
  if (
    typeof url !== 'string' ||
    url.length === 0 ||
    url.length > MAX_WIDGET_URL_LENGTH ||
    !/^[\x21-\x7e]+$/.test(url) ||
    url.includes('\\')
  ) {
    throw new Error('Transak widget URL is malformed')
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error('Transak widget URL is malformed')
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new Error('Transak widget URL is malformed')
  }
  if (!TRANSAK_WIDGET_ORIGINS.has(parsed.origin)) {
    throw new Error('Transak widget URL origin is not allowed')
  }
  return parsed.origin
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
