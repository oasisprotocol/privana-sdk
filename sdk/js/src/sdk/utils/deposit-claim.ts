import type { Bytes32, DepositCheckResponse } from '../types'

export type DepositClaimResult =
  | { kind: 'claimed'; deposit: DepositCheckResponse }
  | { kind: 'stale' }
  | { kind: 'timeout' }

export const NOTHING_TO_CLAIM_MESSAGE = 'Nothing to claim at the deposit address yet'

export async function claimDepositWithRetry({
  claim,
  tokenId,
  isStale,
  onRetry,
  timeoutMs,
  retryIntervalMs,
  startedAt = Date.now(),
  now = Date.now,
  sleep = defaultSleep,
}: {
  claim: () => Promise<DepositCheckResponse[]>
  tokenId?: Bytes32
  isStale: () => boolean
  onRetry: (message: string) => void
  timeoutMs: number
  retryIntervalMs: number
  startedAt?: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}): Promise<DepositClaimResult> {
  while (true) {
    if (isStale()) return { kind: 'stale' }
    const deposits = await claim()
    if (isStale()) return { kind: 'stale' }
    const deposit = findClaimedDeposit(deposits, tokenId)
    if (deposit) return { kind: 'claimed', deposit }
    onRetry(NOTHING_TO_CLAIM_MESSAGE)

    if (now() - startedAt > timeoutMs) return { kind: 'timeout' }
    await sleep(retryIntervalMs)
  }
}

export function findClaimedDeposit(
  deposits: DepositCheckResponse[],
  tokenId?: Bytes32
): DepositCheckResponse | undefined {
  return deposits.find((d) => !tokenId || d.token_id?.toLowerCase() === tokenId.toLowerCase())
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
