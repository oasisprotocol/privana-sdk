import {
  getBrowserStorageItem,
  removeBrowserStorageItem,
  setBrowserStorageItem,
} from './browser-storage'

export interface PendingWithdrawal {
  index: number
  tokenId: string
  amount: string
  savedAt: number
}

const STALE_MS = 30 * 60 * 1000

function pendingWithdrawalKey(address: string): string {
  return `privana:pending-withdrawal:${address.toLowerCase()}`
}

export function savePendingWithdrawal(address: string, withdrawal: PendingWithdrawal): void {
  setBrowserStorageItem(pendingWithdrawalKey(address), JSON.stringify(withdrawal))
}

export function clearPendingWithdrawal(address: string): void {
  removeBrowserStorageItem(pendingWithdrawalKey(address))
}

export function loadPendingWithdrawal(address: string): PendingWithdrawal | null {
  let data: Partial<PendingWithdrawal>
  try {
    const raw = getBrowserStorageItem(pendingWithdrawalKey(address))
    if (!raw) return null
    data = JSON.parse(raw)
  } catch {
    clearPendingWithdrawal(address)
    return null
  }
  if (
    typeof data.index !== 'number' ||
    typeof data.tokenId !== 'string' ||
    typeof data.amount !== 'string' ||
    typeof data.savedAt !== 'number' ||
    Date.now() - data.savedAt > STALE_MS
  ) {
    clearPendingWithdrawal(address)
    return null
  }
  return data as PendingWithdrawal
}
