export function sortTokensByBalance<T extends { name: string; decimals: number }>(
  tokens: readonly T[],
  balanceOf: (token: T) => bigint | undefined
): T[] {
  const maxDecimals = tokens.reduce((max, t) => Math.max(max, t.decimals), 0)
  const scaled = (token: T): bigint => {
    const balance = balanceOf(token) ?? 0n
    return balance * 10n ** BigInt(maxDecimals - token.decimals)
  }
  return [...tokens].sort((a, b) => {
    const av = scaled(a)
    const bv = scaled(b)
    if (av === 0n && bv === 0n) return a.name.localeCompare(b.name)
    if (av === bv) return a.name.localeCompare(b.name)
    return bv > av ? 1 : -1
  })
}
