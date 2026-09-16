export const NATIVE_TRANSFER_GAS = 21_000n

const FEE_BUFFER_NUM = 3n
const FEE_BUFFER_DEN = 2n

export const FALLBACK_GAS_RESERVE_WEI = NATIVE_TRANSFER_GAS * 60_000_000_000n

export function gasReserveWei(maxFeePerGas: bigint | null | undefined): bigint {
  if (maxFeePerGas == null || maxFeePerGas <= 0n) return FALLBACK_GAS_RESERVE_WEI
  return (NATIVE_TRANSFER_GAS * maxFeePerGas * FEE_BUFFER_NUM) / FEE_BUFFER_DEN
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
  return nativeBalanceWei < (ERC20_TRANSFER_GAS * maxFeePerGas * FEE_BUFFER_NUM) / FEE_BUFFER_DEN
}
