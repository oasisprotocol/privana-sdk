import { decodeEventLog, parseAbiItem, zeroAddress, type Address, type Hex, type Log } from 'viem'

import type { MinDepositAmounts } from '../types'

const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)'
)

export type OnRampReceiptLog = Pick<Log, 'address' | 'data' | 'topics' | 'logIndex'>

export interface OnRampDeliveredTransfer {
  amount: bigint
  logIndex: number
}

function decodeErc20TransferLog(log: OnRampReceiptLog) {
  try {
    return decodeEventLog({
      abi: [ERC20_TRANSFER_EVENT],
      data: log.data as Hex,
      topics: log.topics,
    })
  } catch {
    return undefined
  }
}

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

/** Select the one ERC-20 transfer that authorizes this deposit verification. */
export function resolveErc20OnRampTransfer(
  logs: readonly OnRampReceiptLog[],
  tokenAddress: Address,
  depositAddress: Address
): OnRampDeliveredTransfer {
  let match: OnRampDeliveredTransfer | undefined
  for (const log of logs) {
    if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) continue
    const decoded = decodeErc20TransferLog(log)
    if (!decoded) continue

    if (
      decoded.eventName !== 'Transfer' ||
      decoded.args.to.toLowerCase() !== depositAddress.toLowerCase()
    ) {
      continue
    }
    if (match) {
      throw new Error('On-ramp receipt contains multiple matching ERC-20 Transfer logs')
    }

    const logIndex = log.logIndex
    if (typeof logIndex !== 'number' || !Number.isSafeInteger(logIndex) || logIndex < 0) {
      throw new Error('Matching on-ramp ERC-20 Transfer does not have a valid log index')
    }
    match = { amount: decoded.args.value, logIndex }
  }

  if (!match) {
    throw new Error('On-ramp receipt does not contain a matching ERC-20 Transfer')
  }
  if (match.amount <= 0n) {
    throw new Error('Matching on-ramp ERC-20 Transfer must have a positive amount')
  }
  return match
}
