import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTokenAmount(
  amount: string | bigint,
  decimals: number = 18,
  maxDecimals: number = 6
): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount
  const divisor = 10n ** BigInt(decimals)
  const integerPart = value / divisor
  const fractionalPart = value % divisor

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
  const shown = fractionalStr.slice(0, Math.max(2, Math.min(maxDecimals, decimals)))
  const trimmed = shown.replace(/0+$/, '').padEnd(2, '0')

  const integerWithSpaces = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u2009')
  return `${integerWithSpaces}.${trimmed}`
}

export function parseTokenAmount(amount: string, decimals: number = 18): bigint {
  const sanitized = amount.replace(/[\s\u2009]/g, '').replace(/,/g, '.')
  const lastDot = sanitized.lastIndexOf('.')
  const integerPart = lastDot === -1 ? sanitized : sanitized.slice(0, lastDot).replace(/\./g, '')
  const fractionalPart = lastDot === -1 ? '' : sanitized.slice(lastDot + 1)
  const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals)
  return BigInt(integerPart + paddedFractional)
}

export function shortenAddress(address: string, chars: number = 4): string {
  if (!address || address.length < chars * 2 + 2) return address
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

export function isExpired(expiry: number): boolean {
  return Math.floor(Date.now() / 1000) > expiry
}

export function formatTimeRemaining(expiryTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000)
  const diff = expiryTimestamp - now

  if (diff <= 0) return 'Expired'

  const days = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  const minutes = Math.floor((diff % 3600) / 60)

  if (days > 0) {
    return hours > 0 ? `${days}d ${hours}h left` : `${days}d left`
  }
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`
  }
  return `${minutes}m left`
}

export function formatCountdown(secondsLeft: number): string {
  const clamped = Math.max(0, secondsLeft)
  const minutes = Math.floor(clamped / 60)
  const seconds = clamped % 60
  return `${minutes}m:${String(seconds).padStart(2, '0')}s`
}

export function formatRelativeTime(timestamp: string | number): string {
  const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp * 1000)
  const now = new Date()
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (diff < 60) return 'Just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return date.toLocaleDateString()
}
