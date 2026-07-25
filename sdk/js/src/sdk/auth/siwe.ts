import { createSiweMessage } from 'viem/siwe'
import type { Address } from '../types'

/** How long a signed SIWE session stays valid. The nonce expires much sooner, but the backend
 *  expects the signed message itself to cover the auth-token window. */
export const SIWE_MESSAGE_VALIDITY_MS = 24 * 60 * 60 * 1000

export type SiweMessageValue = ReturnType<typeof createSiweMessage>

export interface SiweMessageApi {
  getSiweDomain(): Promise<{ domain: string }>
  getSiweNonce(address: Address): Promise<{ nonce: string }>
}

export function buildSiweStatement(chainId: number): string {
  return `Sign in to Privana on chain ${chainId}`
}

/** Fetches the domain + nonce and assembles the message both SIWE login paths sign. */
export async function buildSiweLoginMessage(
  api: SiweMessageApi,
  params: { address: Address; chainId: number; apiUrl: string }
): Promise<{ message: SiweMessageValue; expirationTime: Date }> {
  const { address, chainId, apiUrl } = params
  const [{ domain }, { nonce }] = await Promise.all([
    api.getSiweDomain(),
    api.getSiweNonce(address),
  ])
  const issuedAt = new Date()
  const expirationTime = new Date(issuedAt.getTime() + SIWE_MESSAGE_VALIDITY_MS)
  const uri =
    typeof window !== 'undefined' && window.location.origin ? window.location.origin : apiUrl

  const message = createSiweMessage({
    address,
    chainId,
    domain,
    expirationTime,
    issuedAt,
    nonce,
    statement: buildSiweStatement(chainId),
    uri,
    version: '1',
  })
  return { message, expirationTime }
}
