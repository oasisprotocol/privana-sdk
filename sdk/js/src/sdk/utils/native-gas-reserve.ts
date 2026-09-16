export const NATIVE_TRANSFER_GAS = 21_000n

const FEE_BUFFER_NUM = 3n
const FEE_BUFFER_DEN = 2n

export const FALLBACK_GAS_RESERVE_WEI = NATIVE_TRANSFER_GAS * 60_000_000_000n

// OP-stack chains (Base) charge an L1 data fee on top of the L2 execution
// fee, and it dominates when L2 gas is near-free — a reserve computed from
// maxFeePerGas alone is then an order of magnitude short and the wallet
// refuses the send. The L1 component is a moving estimate even wallets get
// wrong, so a flat floor (~0.00005 native) is the reliable cover; on
// Ethereum the computed reserve is larger anyway.
export const MIN_GAS_RESERVE_WEI = 50_000_000_000_000n

export function gasReserveWei(maxFeePerGas: bigint | null | undefined): bigint {
  if (maxFeePerGas == null || maxFeePerGas <= 0n) return FALLBACK_GAS_RESERVE_WEI
  const computed = (NATIVE_TRANSFER_GAS * maxFeePerGas * FEE_BUFFER_NUM) / FEE_BUFFER_DEN
  return computed > MIN_GAS_RESERVE_WEI ? computed : MIN_GAS_RESERVE_WEI
}

export function maxNativeDeposit(
  balanceWei: bigint,
  maxFeePerGas: bigint | null | undefined
): bigint {
  const reserve = gasReserveWei(maxFeePerGas)
  return balanceWei > reserve ? balanceWei - reserve : 0n
}

export const ERC20_TRANSFER_GAS = 65_000n

export function lacksGasForErc20Deposit(
  nativeBalanceWei: bigint | undefined,
  maxFeePerGas: bigint | null | undefined
): boolean {
  if (nativeBalanceWei == null || maxFeePerGas == null || maxFeePerGas <= 0n) return false
  const needed = (ERC20_TRANSFER_GAS * maxFeePerGas * FEE_BUFFER_NUM) / FEE_BUFFER_DEN
  return nativeBalanceWei < (needed > MIN_GAS_RESERVE_WEI ? needed : MIN_GAS_RESERVE_WEI)
}
