import {
  AccountingApiError,
  PrivateReadAuthRequiredError,
  TransferRateLimitedError,
} from '../client'
import type { PrivanaClient } from '../client'
import type { TransactionSubmissionResponse, TransferFundsRequest } from '../types'

export const TRANSFER_SIGN_IN_MESSAGE = 'Sign in to Privana to send funds.'

export async function submitTransfer(
  executePrivateRead: <T>(request: (client: PrivanaClient) => Promise<T>) => Promise<T>,
  request: TransferFundsRequest
): Promise<TransactionSubmissionResponse> {
  try {
    return await executePrivateRead((client) =>
      client.transferFunds(request).catch((error: unknown) => {
        // Mapped here, not below, so a rate-limited sign-in isn't reported as too many transfers.
        if (error instanceof AccountingApiError && error.statusCode === 429) {
          throw new TransferRateLimitedError()
        }
        throw error
      })
    )
  } catch (error) {
    if (
      error instanceof PrivateReadAuthRequiredError ||
      (error instanceof AccountingApiError && error.statusCode === 401)
    ) {
      throw new PrivateReadAuthRequiredError(TRANSFER_SIGN_IN_MESSAGE)
    }
    throw error
  }
}
