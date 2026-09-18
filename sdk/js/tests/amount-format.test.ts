import { describe, expect, test } from 'bun:test'
import {
  AMOUNT_RULES,
  displayDecimalsFor,
  dustGlyph,
  formatFiatAmount,
  formatPercent,
  formatTokenAmount,
  maxAmount,
  parseAmountInput,
  truncateToDecimals,
  type TokenMeta,
} from '../src/sdk/utils/amount-format'

const USDC: TokenMeta = { symbol: 'USDC', decimals: 6 }
const ETH: TokenMeta = { symbol: 'ETH', decimals: 18 }

const units = (human: string, decimals: number): bigint => {
  const [i, f = ''] = human.split('.')
  return BigInt(i + f.padEnd(decimals, '0'))
}

// The spec's acceptance vectors, section 07 — computed there by a reference
// implementation; any change to these is a product decision, not a refactor.
const VECTORS: Array<{
  human: string
  token: TokenMeta
  tabular: string
  inline: string
  price: string
  dp: number
  note: string
}> = [
  {
    human: '1234.5',
    token: USDC,
    tabular: '1,234.50',
    inline: '1,234.5',
    price: '1,234.50',
    dp: 2,
    note: 'headline row',
  },
  {
    human: '25',
    token: USDC,
    tabular: '25.00',
    inline: '25',
    price: '25.00',
    dp: 2,
    note: 'whole number',
  },
  {
    human: '0.0020639',
    token: ETH,
    tabular: '0.002063',
    inline: '0.002063',
    price: '0.002064',
    dp: 6,
    note: 'the rounding row',
  },
  {
    human: '0.0000005',
    token: ETH,
    tabular: '<0.000001',
    inline: '<0.000001',
    price: '0.000001',
    dp: 6,
    note: 'dust',
  },
  {
    human: '0',
    token: USDC,
    tabular: '0.00',
    inline: '0',
    price: '0.00',
    dp: 2,
    note: 'true zero',
  },
  {
    human: '0.000000000000000001',
    token: ETH,
    tabular: '<0.000001',
    inline: '<0.000001',
    price: '<0.000001',
    dp: 6,
    note: '1 wei',
  },
  {
    human: '0.999999999999999999',
    token: ETH,
    tabular: '0.999999',
    inline: '0.999999',
    price: '1',
    dp: 6,
    note: 'just under 1 ETH',
  },
  { human: '1', token: ETH, tabular: '1', inline: '1', price: '1', dp: 4, note: 'exactly 1 ETH' },
  {
    human: '1234567.890123',
    token: USDC,
    tabular: '1,234,567.89',
    inline: '1,234,567.89',
    price: '1,234,567.89',
    dp: 2,
    note: '1.23M USDC',
  },
  {
    human: '0.012345',
    token: USDC,
    tabular: '0.012345',
    inline: '0.012345',
    price: '0.012345',
    dp: 6,
    note: 'sub-cent stablecoin',
  },
  {
    human: '123.456789012345678901',
    token: ETH,
    tabular: '123.4567',
    inline: '123.4567',
    price: '123.4568',
    dp: 4,
    note: '123.45 ETH',
  },
]

describe('formatTokenAmount vectors', () => {
  for (const v of VECTORS) {
    const raw = units(v.human, v.token.decimals)
    test(`${v.note}: ${v.human} ${v.token.symbol}`, () => {
      const tab = formatTokenAmount(raw, v.token, { context: 'balance', style: 'tabular' })
      const inl = formatTokenAmount(raw, v.token, { context: 'balance', style: 'inline' })
      const price = formatTokenAmount(raw, v.token, { context: 'price', style: 'tabular' })
      expect(tab.display).toBe(v.tabular)
      expect(inl.display).toBe(v.inline)
      expect(price.display).toBe(v.price)
      expect(tab.decimals).toBe(v.dp)
    })
  }
})

describe('fiat vectors', () => {
  test('renders per spec', () => {
    expect(formatFiatAmount('1234.5').display).toBe('$1,234.50')
    expect(formatFiatAmount('25').display).toBe('$25.00')
    expect(formatFiatAmount('0.006').display).toBe('$0.01')
    expect(formatFiatAmount('0.004').display).toBe('<$0.01')
    expect(formatFiatAmount('0.004').isDust).toBe(true)
    expect(formatFiatAmount('1234567.891').display).toBe('$1,234,567.89')
  })
})

describe('invariants', () => {
  const parseDisplay = (display: string): number => Number(display.replace(/,/g, ''))

  test('never overstate: balance and quote displays are <= the true value', () => {
    for (const v of VECTORS) {
      const raw = units(v.human, v.token.decimals)
      for (const context of ['balance', 'quote'] as const) {
        const out = formatTokenAmount(raw, v.token, { context })
        if (out.isDust) continue
        expect(parseDisplay(out.display)).toBeLessThanOrEqual(Number(v.human))
      }
    }
  })

  test('never vanish: no non-zero input renders as zero', () => {
    for (const v of VECTORS) {
      const raw = units(v.human, v.token.decimals)
      if (raw === 0n) continue
      for (const context of ['balance', 'quote', 'price', 'fee'] as const) {
        const out = formatTokenAmount(raw, v.token, { context })
        expect(parseDisplay(out.display.replace('<', '')) === 0 && !out.isDust).toBe(false)
        expect(out.display === '0' || out.display === '0.00').toBe(false)
      }
    }
  })

  test('never understate a fee', () => {
    for (const v of VECTORS) {
      const raw = units(v.human, v.token.decimals)
      const out = formatTokenAmount(raw, v.token, { context: 'fee' })
      if (out.isDust) continue
      expect(parseDisplay(out.display)).toBeGreaterThanOrEqual(Number(v.human) - 1e-9)
    }
  })

  test('round-trip: parseAmountInput(exact) === raw, exactly, as bigint', () => {
    for (const v of VECTORS) {
      const raw = units(v.human, v.token.decimals)
      const out = formatTokenAmount(raw, v.token)
      const parsed = parseAmountInput(out.exact, v.token)
      expect(parsed).toEqual({ ok: true, raw })
    }
  })

  test('idempotence guard: a formatted string is rejected, not re-formatted', () => {
    expect(() => formatTokenAmount('1,234.50', USDC)).toThrow()
    expect(() => formatTokenAmount('25.00', USDC)).toThrow()
  })
})

describe('parseAmountInput', () => {
  test('classifies bad input', () => {
    expect(parseAmountInput('', USDC)).toEqual({ ok: false, reason: 'empty' })
    expect(parseAmountInput('abc', USDC)).toEqual({ ok: false, reason: 'nan' })
    expect(parseAmountInput('-1', USDC)).toEqual({ ok: false, reason: 'negative' })
    expect(parseAmountInput('0.1234567', USDC)).toEqual({ ok: false, reason: 'too-precise' })
  })

  test('rejects commas outside thousands grouping instead of misreading them', () => {
    expect(parseAmountInput('1,5', USDC)).toEqual({ ok: false, reason: 'nan' })
    expect(parseAmountInput('12,34', USDC)).toEqual({ ok: false, reason: 'nan' })
    expect(parseAmountInput('1,', USDC)).toEqual({ ok: false, reason: 'nan' })
  })

  test('accepts grouped and dot-decimal input', () => {
    expect(parseAmountInput('1,234.5', USDC)).toEqual({ ok: true, raw: 1_234_500_000n })
    expect(parseAmountInput('.5', USDC)).toEqual({ ok: true, raw: 500_000n })
  })
})

describe('helpers', () => {
  test('maxAmount is exact and never rounds', () => {
    const raw = units('0.999999999999999999', 18)
    expect(maxAmount(raw, ETH)).toEqual({ raw, input: '0.999999999999999999' })
  })

  test('truncateToDecimals zeroes below the target precision', () => {
    expect(truncateToDecimals(1_234_567n, 6, 2)).toBe(1_230_000n)
  })

  test('dust glyph derives from the display precision', () => {
    expect(dustGlyph(6)).toBe('<0.000001')
    expect(dustGlyph(2)).toBe('<0.01')
  })

  test('displayDecimalsFor caps at token.decimals', () => {
    expect(displayDecimalsFor(1n, { symbol: 'X', decimals: 2 })).toBe(2)
  })

  test('percent suppresses -0.00 and rounds half-up', () => {
    expect(formatPercent(1234).display).toBe('12.34%')
    expect(formatPercent(0).display).toBe('0.00%')
  })

  test('rules are exported for inspection', () => {
    expect(AMOUNT_RULES.modes.balance).toBe('trunc')
    expect(AMOUNT_RULES.modes.fee).toBe('up')
  })
})
