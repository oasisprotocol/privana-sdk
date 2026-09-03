import type { DepositAddressResponse } from '../types'

export function getMinDepositBaseUnits(
  response: DepositAddressResponse | undefined,
  chainId: number,
  kind: 'native' | 'erc20'
): bigint | undefined {
  const value = response?.min_deposit?.[String(chainId)]?.[kind]
  if (value === undefined) return undefined
  try {
    const amount = BigInt(value)
    return amount >= 0n ? amount : undefined
  } catch {
    return undefined
  }
}
