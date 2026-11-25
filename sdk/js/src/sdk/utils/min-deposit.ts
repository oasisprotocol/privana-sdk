import type { DepositAddressResponse } from '../types'

/**
 * Minimum deposit of a token in base units. A token the backend does not list
 * has no minimum (0n); undefined means the minimums are not loaded or invalid.
 */
export function getMinDepositBaseUnits(
  minDeposits: DepositAddressResponse['min_deposit'] | undefined,
  tokenId: string
): bigint | undefined {
  if (!minDeposits) return undefined
  const value = minDeposits[tokenId.toLowerCase()]
  if (value === undefined) return 0n
  return /^\d+$/.test(value) ? BigInt(value) : undefined
}
