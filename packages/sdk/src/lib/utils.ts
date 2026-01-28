import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTokenAmount(amount: string | bigint, decimals: number = 18): string {
  const value = typeof amount === 'string' ? BigInt(amount) : amount
  const divisor = BigInt(10 ** decimals)
  const integerPart = value / divisor
  const fractionalPart = value % divisor

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0')
  const twoDecimals = fractionalStr.slice(0, 2).padEnd(2, '0')

  const integerWithCommas = integerPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${integerWithCommas}.${twoDecimals}`
}

export function parseTokenAmount(amount: string, decimals: number = 18): bigint {
  const [integerPart, fractionalPart = ''] = amount.split('.')
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
