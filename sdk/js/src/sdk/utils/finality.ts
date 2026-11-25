import { getBlock, type Config } from '@wagmi/core'
import type { DepositAddressResponse, DepositFinalityProgress } from '../types'

export interface DepositFinality {
  chainId: number
  depth: number
}

export function depositFinality(
  depositAddress: DepositAddressResponse | undefined,
  chainId: number | undefined
): DepositFinality | undefined {
  if (!depositAddress || chainId === undefined) return undefined
  const depth = depositAddress.finality_depth?.[String(chainId)]
  return depth === undefined ? undefined : { chainId, depth }
}

export function formatFinalityProgress({
  confirmations,
  required,
}: DepositFinalityProgress): string {
  return `${confirmations}/${required} confirmations`
}

export async function finalityDurationMs(
  config: Config,
  { chainId, depth }: DepositFinality
): Promise<number> {
  const latest = await getBlock(config, { chainId })
  if (latest.number < BigInt(depth)) return 0
  const earlier = await getBlock(config, { chainId, blockNumber: latest.number - BigInt(depth) })
  return Number(latest.timestamp - earlier.timestamp) * 1000
}
