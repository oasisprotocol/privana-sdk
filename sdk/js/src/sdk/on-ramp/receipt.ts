import { decodeEventLog, parseAbiItem, zeroAddress, type Address, type Hex, type Log } from 'viem'

import type { MinDepositAmounts } from '../types'

const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
)

export type OnRampReceiptLog = Pick<Log, 'address' | 'data' | 'topics'>

export function assertErc20OnRampToken(tokenAddress: Address): void {
  if (tokenAddress.toLowerCase() === zeroAddress) {
    throw new Error('On-ramp verification supports ERC-20 tokens only')
  }
}

export function erc20MinDepositBaseUnits(
  minDepositByChain: Record<string, MinDepositAmounts> | undefined,
  chainId: number
): bigint | undefined {
  const minimum = minDepositByChain?.[String(chainId)]?.erc20
  return minimum !== undefined && /^\d+$/.test(minimum) ? BigInt(minimum) : undefined
}

/** Sum matching ERC-20 transfers to the derived Privana deposit address. */
export function deliveredErc20Amount(
  logs: readonly OnRampReceiptLog[],
  tokenAddress: Address,
  depositAddress: Address
): bigint {
  let delivered = 0n
  for (const log of logs) {
    if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) continue
    try {
      const decoded = decodeEventLog({
        abi: [ERC20_TRANSFER_EVENT],
        data: log.data as Hex,
        topics: log.topics,
      })
      if (
        decoded.eventName === 'Transfer' &&
        decoded.args.to.toLowerCase() === depositAddress.toLowerCase()
      ) {
        delivered += decoded.args.value
      }
    } catch {
      // Not an ERC-20 Transfer log for this token.
    }
  }
  return delivered
}
