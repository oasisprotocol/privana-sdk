import { describe, expect, test } from 'bun:test'
import {
  FALLBACK_GAS_RESERVE_WEI,
  lacksGasForErc20Deposit,
  NATIVE_TRANSFER_GAS,
  gasReserveWei,
  maxNativeDeposit,
} from '../src/sdk/utils/native-gas-reserve'

describe('gasReserveWei', () => {
  test('scales the fee estimate by the transfer gas and the 1.5x buffer', () => {
    const maxFeePerGas = 2_000_000_000n // 2 gwei
    expect(gasReserveWei(maxFeePerGas)).toBe((NATIVE_TRANSFER_GAS * maxFeePerGas * 3n) / 2n)
  })

  test('falls back to the fixed reserve without an estimate', () => {
    expect(gasReserveWei(undefined)).toBe(FALLBACK_GAS_RESERVE_WEI)
    expect(gasReserveWei(null)).toBe(FALLBACK_GAS_RESERVE_WEI)
    expect(gasReserveWei(0n)).toBe(FALLBACK_GAS_RESERVE_WEI)
  })
})

describe('maxNativeDeposit', () => {
  test('subtracts the reserve from the balance', () => {
    const balance = 10n ** 18n // 1 ETH
    const maxFeePerGas = 2_000_000_000n
    const reserve = gasReserveWei(maxFeePerGas)
    expect(maxNativeDeposit(balance, maxFeePerGas)).toBe(balance - reserve)
  })

  test('returns zero when the balance cannot cover the reserve', () => {
    expect(maxNativeDeposit(1_000n, 2_000_000_000n)).toBe(0n)
    expect(maxNativeDeposit(0n, undefined)).toBe(0n)
  })

  test('uses the fixed fallback reserve when estimation failed', () => {
    const balance = 10n ** 18n
    expect(maxNativeDeposit(balance, undefined)).toBe(balance - FALLBACK_GAS_RESERVE_WEI)
  })
})

describe('lacksGasForErc20Deposit', () => {
  const fee = 2_000_000_000n // 2 gwei -> 65k * 2gwei * 1.5 = 195_000 gwei
  const needed = (65_000n * fee * 3n) / 2n

  test('flags a native balance below the buffered fee', () => {
    expect(lacksGasForErc20Deposit(needed - 1n, fee)).toBe(true)
    expect(lacksGasForErc20Deposit(0n, fee)).toBe(true)
  })

  test('a sufficient balance passes', () => {
    expect(lacksGasForErc20Deposit(needed, fee)).toBe(false)
  })

  test('fails open without an estimate or balance', () => {
    expect(lacksGasForErc20Deposit(undefined, fee)).toBe(false)
    expect(lacksGasForErc20Deposit(0n, undefined)).toBe(false)
    expect(lacksGasForErc20Deposit(0n, null)).toBe(false)
    expect(lacksGasForErc20Deposit(0n, 0n)).toBe(false)
  })
})
