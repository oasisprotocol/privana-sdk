export type AmountContext = 'balance' | 'quote' | 'price' | 'fee' | 'fiat' | 'percent'
export type AmountStyle = 'tabular' | 'inline'

export interface TokenMeta {
  symbol: string
  decimals: number
  stable?: boolean
}

export interface FormatOptions {
  context?: AmountContext
  style?: AmountStyle
  withSymbol?: boolean
}

export interface FormattedAmount {
  display: string
  exact: string
  aria: string
  isTruncated: boolean
  isDust: boolean
  decimals: number
}

type RoundingMode = 'trunc' | 'halfUp' | 'up'

const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'DAI', 'USDS', 'FDUSD', 'PYUSD'])

export const AMOUNT_RULES: Readonly<{
  modes: Readonly<Record<AmountContext, RoundingMode>>
}> = {
  modes: {
    balance: 'trunc',
    quote: 'trunc',
    price: 'halfUp',
    fee: 'up',
    fiat: 'halfUp',
    percent: 'halfUp',
  },
}

function isStable(token: TokenMeta): boolean {
  return token.stable ?? STABLE_SYMBOLS.has(token.symbol.toUpperCase())
}

function toRaw(raw: bigint | string): bigint {
  if (typeof raw === 'bigint') return raw
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(
      `formatTokenAmount expects base units (an integer string or bigint), got "${raw}" — ` +
        'a formatted or decimal string must not be re-formatted'
    )
  }
  return BigInt(raw)
}

export function displayDecimalsFor(raw: bigint, token: TokenMeta): number {
  const abs = raw < 0n ? -raw : raw
  const unit = 10n ** BigInt(token.decimals)
  const stable = isStable(token)
  let dp: number
  if (abs === 0n) dp = stable ? 2 : 0
  else if (abs >= 1000n * unit) dp = 2
  else if (abs >= unit) dp = stable ? 2 : 4
  else dp = 6
  return Math.min(dp, token.decimals)
}

export function dustGlyph(decimals: number): string {
  if (decimals <= 0) return '<1'
  return '<0.' + '0'.repeat(decimals - 1) + '1'
}

export function truncateToDecimals(raw: bigint, from: number, to: number): bigint {
  if (to >= from) return raw
  const factor = 10n ** BigInt(from - to)
  return (raw / factor) * factor
}

function roundScaled(
  raw: bigint,
  fromDecimals: number,
  toDecimals: number,
  mode: RoundingMode
): bigint {
  const abs = raw < 0n ? -raw : raw
  const sign = raw < 0n ? -1n : 1n
  if (toDecimals >= fromDecimals) return raw * 10n ** BigInt(toDecimals - fromDecimals)
  const factor = 10n ** BigInt(fromDecimals - toDecimals)
  let q: bigint
  if (mode === 'trunc') q = abs / factor
  else if (mode === 'up') q = (abs + factor - 1n) / factor
  else q = (abs + factor / 2n) / factor
  return sign * q
}

function groupDigits(integer: string): string {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function exactString(raw: bigint, decimals: number): string {
  const abs = raw < 0n ? -raw : raw
  const sign = raw < 0n ? '-' : ''
  const unit = 10n ** BigInt(decimals)
  const integer = (abs / unit).toString()
  const fraction = (abs % unit).toString().padStart(decimals, '0').replace(/0+$/, '')
  return sign + integer + (fraction ? '.' + fraction : '')
}

function renderParts(
  scaled: bigint,
  dp: number,
  opts: { pad: boolean }
): { grouped: string; plain: string } {
  const abs = scaled < 0n ? -scaled : scaled
  const sign = scaled < 0n && abs !== 0n ? '-' : ''
  const unit = 10n ** BigInt(dp)
  const integer = (abs / unit).toString()
  let fraction = dp > 0 ? (abs % unit).toString().padStart(dp, '0').replace(/0+$/, '') : ''
  if (opts.pad) fraction = fraction.padEnd(2, '0')
  const tail = fraction ? '.' + fraction : ''
  return {
    grouped: sign + groupDigits(integer) + tail,
    plain: sign + integer + tail,
  }
}

export function formatTokenAmount(
  raw: bigint | string,
  token: TokenMeta,
  opts: FormatOptions = {}
): FormattedAmount {
  const value = toRaw(raw)
  const context = opts.context ?? 'balance'
  const style = opts.style ?? 'tabular'
  const mode = AMOUNT_RULES.modes[context]

  const dp = displayDecimalsFor(value, token)
  const scaled = roundScaled(value, token.decimals, dp, mode)
  const exact = exactString(value, token.decimals)
  const pad = style === 'tabular' && isStable(token) && dp >= 2

  if (value !== 0n && scaled === 0n) {
    const glyph = dustGlyph(dp)
    return {
      display: opts.withSymbol ? `${glyph} ${token.symbol}` : glyph,
      exact,
      aria: `${exact} ${token.symbol}`,
      isTruncated: true,
      isDust: true,
      decimals: dp,
    }
  }

  const { grouped, plain } = renderParts(scaled, dp, { pad })
  const isTruncated = exactString(scaled, dp) !== exact
  return {
    display: opts.withSymbol ? `${grouped} ${token.symbol}` : grouped,
    exact,
    aria: `${plain} ${token.symbol}`,
    isTruncated,
    isDust: false,
    decimals: dp,
  }
}

export function formatFiatAmount(
  value: string | bigint,
  opts: FormatOptions & { currency?: string; scale?: number } = {}
): FormattedAmount {
  const currency = opts.currency ?? '$'
  let raw: bigint
  let scale: number
  if (typeof value === 'bigint') {
    raw = value
    scale = opts.scale ?? 2
  } else {
    const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim())
    if (!m) throw new Error(`formatFiatAmount expects a decimal string or bigint, got "${value}"`)
    const frac = m[3] ?? ''
    raw = BigInt((m[1] === '-' ? '-' : '') + m[2] + frac || '0')
    scale = frac.length
  }
  const scaled = roundScaled(raw, scale, 2, 'halfUp')
  const exact = exactString(raw, scale)
  if (raw !== 0n && scaled === 0n) {
    return {
      display: `<${currency}0.01`,
      exact,
      aria: `less than ${currency}0.01`,
      isTruncated: true,
      isDust: true,
      decimals: 2,
    }
  }
  const { grouped, plain } = renderParts(scaled, 2, { pad: true })
  return {
    display: `${currency}${grouped}`,
    exact,
    aria: `${currency}${plain}`,
    isTruncated: exactString(scaled, 2) !== exact,
    isDust: false,
    decimals: 2,
  }
}

export function formatPercent(bps: number): FormattedAmount {
  if (!Number.isFinite(bps) || !Number.isInteger(bps)) {
    throw new Error(`formatPercent expects integer basis points, got ${bps}`)
  }
  const scaled = roundScaled(BigInt(bps), 2, 2, 'halfUp')
  const exact = exactString(BigInt(bps), 2)
  const { grouped, plain } = renderParts(scaled, 2, { pad: true })
  return {
    display: `${grouped}%`,
    exact,
    aria: `${plain} percent`,
    isTruncated: exactString(scaled, 2) !== exact,
    isDust: false,
    decimals: 2,
  }
}

export function parseAmountInput(
  text: string,
  token: TokenMeta
): { ok: true; raw: bigint } | { ok: false; reason: 'empty' | 'nan' | 'too-precise' | 'negative' } {
  const cleaned = text.trim()
  if (cleaned === '') return { ok: false, reason: 'empty' }
  if (cleaned.startsWith('-')) return { ok: false, reason: 'negative' }
  // Commas count only as well-formed thousands grouping: '1,234.56' parses,
  // while a decimal-comma '1,5' is rejected rather than silently read as 15.
  const m = /^(\d+|\d{1,3}(?:,\d{3})+)?(?:\.(\d*))?$/.exec(cleaned)
  if (!m || ((m[1] ?? '') === '' && (m[2] ?? '') === '')) return { ok: false, reason: 'nan' }
  const fraction = m[2] ?? ''
  if (fraction.length > token.decimals) return { ok: false, reason: 'too-precise' }
  const integer = (m[1] ?? '').replace(/,/g, '') || '0'
  const raw = BigInt(integer + fraction.padEnd(token.decimals, '0'))
  return { ok: true, raw }
}

/**
 * Cleans typed or pasted text for an amount field: digits and one decimal point.
 * A comma is thousands grouping when the whole text is well-formed grouping (a
 * pasted displayed balance like "1,234.50"), otherwise a decimal comma ("1,5").
 * Typing never reaches the grouping branch: each keystroke already turned the
 * first comma into a point. Returns null when the text is still not one number,
 * so the field can ignore that change.
 */
export function normalizeAmountInput(text: string): string | null {
  const kept = text.replace(/[^0-9.,]/g, '')
  const value = /^\d{1,3}(,\d{3})+(\.\d*)?$/.test(kept)
    ? kept.replace(/,/g, '')
    : kept.replace(/,/g, '.')
  return value.split('.').length <= 2 ? value : null
}

/** Whether amount text holds a positive number, decided on its digits, never via a float. */
export function isPositiveAmountText(text: string): boolean {
  const value = normalizeAmountInput(text)
  return value != null && /[1-9]/.test(value)
}

export function maxAmount(raw: bigint, token: TokenMeta): { raw: bigint; input: string } {
  return { raw, input: exactString(raw, token.decimals) }
}
