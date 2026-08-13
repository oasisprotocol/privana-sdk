import type { PrivanaClient } from '../client'
import type { OnRampSessionResponse } from '../types'
import type { OnRampProviderAdapter, OnRampProviderEvent } from './provider'

const MAX_INTENT_ID_LENGTH = 512
const MAX_WIDGET_URL_LENGTH = 8192

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
}: {
  client: Pick<PrivanaClient, 'createOnRampSession'>
  intentId: string
  generation: number
  now?: () => number
}): Promise<TransakWidgetSession> {
  if (!intentId || intentId.length > MAX_INTENT_ID_LENGTH) {
    throw new Error('Transak session requires a valid on-ramp intent')
  }
  const response = await client.createOnRampSession({ transaction_id: intentId })
  return validateTransakWidgetSession(response, intentId, generation, now())
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
