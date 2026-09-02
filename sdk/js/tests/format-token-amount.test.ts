import { describe, expect, test } from 'bun:test'
import { formatTokenAmount } from '../src/lib/utils'

const THIN_SPACE = '\u2009'

describe('formatTokenAmount', () => {
  test('keeps two decimal places for round amounts', () => {
    expect(formatTokenAmount('1000000000000000000', 18)).toBe('1.00')
    expect(formatTokenAmount('0', 18)).toBe('0.00')
  })

  test('shows small balances instead of cutting to 0.00', () => {
    expect(formatTokenAmount('3000000000000000', 18)).toBe('0.003')
    expect(formatTokenAmount('542000000000000', 18)).toBe('0.000542')
  })

  test('trims trailing zeros but never below two places', () => {
    expect(formatTokenAmount('100000', 6)).toBe('0.10')
    expect(formatTokenAmount('1500000', 6)).toBe('1.50')
    expect(formatTokenAmount('1234567', 6)).toBe('1.234567')
  })

  test('truncates instead of rounding up', () => {
    expect(formatTokenAmount('1900000000000', 18)).toBe('0.000001')
  })

  test('dust below display precision still shows as 0.00', () => {
    expect(formatTokenAmount('999', 18)).toBe('0.00')
  })

  test('respects an explicit maxDecimals', () => {
    expect(formatTokenAmount('123456', 6, 2)).toBe('0.12')
  })

  test('groups the integer part with thin spaces', () => {
    expect(formatTokenAmount('1234000000', 6)).toBe(`1${THIN_SPACE}234.00`)
  })
})
