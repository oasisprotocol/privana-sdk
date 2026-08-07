import type { PrivanaClient } from '../client'
import type { LockFundsRequest, TransactionSubmissionResponse } from '../types'
import { clearPendingLock, loadPendingLock, submitPendingLock } from '../hooks/pending-lock'

export type OnRampLockSettlement =
  | { kind: 'not-found' }
  | {
      kind: 'submitted'
      payload: LockFundsRequest
      response: TransactionSubmissionResponse
    }

export async function settlePendingOnRampLock({
  client,
  userAddress,
  transactionId,
  creditedAmount,
}: {
  client: PrivanaClient
  userAddress: string
  transactionId: string
  creditedAmount: bigint
}): Promise<OnRampLockSettlement> {
  const payload = loadPendingLock(userAddress, transactionId)
  if (!payload) {
    clearPendingLock(userAddress, transactionId)
    return { kind: 'not-found' }
  }
  try {
    const response = await submitPendingLock({
      client,
      payload,
      creditedAmount,
    })
    return { kind: 'submitted', payload, response }
  } finally {
    // Keep the exact payload until the API attempt settles so reload can
    // replay an interrupted attempt; then preserve the shipped one-shot policy.
    clearPendingLock(userAddress, transactionId)
  }
}
