import { AccountingApiError } from '../client/errors'
import type { DepositCheckResponse } from '../types'

export type DepositFinalityCheckResult =
  | { kind: 'response'; response: DepositCheckResponse }
  | { kind: 'stale' }
  | { kind: 'timeout' }

export async function checkDepositWithFinalityRetry({
  checkDeposit,
  isStale,
  onRetry,
  timeoutMs,
  retryIntervalMs,
  startedAt = Date.now(),
  now = Date.now,
  sleep = defaultSleep,
}: {
  checkDeposit: () => Promise<DepositCheckResponse>
  isStale: () => boolean
  onRetry: (message: string) => void
  timeoutMs: number
  retryIntervalMs: number
  startedAt?: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}): Promise<DepositFinalityCheckResult> {
  while (true) {
    if (isStale()) return { kind: 'stale' }
    try {
      const response = await checkDeposit()
      if (!isInsufficientFinalityMessage(response.detail) || response.status !== 'error') {
        return { kind: 'response', response }
      }
      if (response.detail) onRetry(response.detail)
    } catch (error) {
      if (isStale()) return { kind: 'stale' }
      if (!isInsufficientFinalityError(error)) throw error
      onRetry(
        error instanceof AccountingApiError && error.detail
          ? error.detail
          : error instanceof Error
            ? error.message
            : String(error)
      )
    }

    if (now() - startedAt > timeoutMs) return { kind: 'timeout' }
    await sleep(retryIntervalMs)
  }
}

export function isInsufficientFinalityError(error: unknown): boolean {
  if (error instanceof AccountingApiError) {
    return (
      isInsufficientFinalityMessage(error.detail) || isInsufficientFinalityMessage(error.message)
    )
  }
  return error instanceof Error && isInsufficientFinalityMessage(error.message)
}

export function isInsufficientFinalityMessage(message: string | null | undefined): boolean {
  return message?.includes('Insufficient finality') ?? false
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
