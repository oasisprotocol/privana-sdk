function storageCandidate(name: 'localStorage' | 'sessionStorage'): Storage | undefined {
  try {
    if (typeof window === 'undefined') return undefined
    return window[name] ?? undefined
  } catch {
    return undefined
  }
}

function storageCandidates(): Storage[] {
  return [storageCandidate('localStorage'), storageCandidate('sessionStorage')].filter(
    (storage): storage is Storage => storage !== undefined
  )
}

export function canUseBrowserStorage(): boolean {
  const probeKey = 'privana:storage-probe'
  for (const storage of storageCandidates()) {
    try {
      storage.setItem(probeKey, '1')
      storage.removeItem(probeKey)
      return true
    } catch {
      // Try the next storage backend.
    }
  }
  return false
}

export function setBrowserStorageItem(key: string, value: string): boolean {
  let stored = false
  for (const storage of storageCandidates()) {
    try {
      storage.setItem(key, value)
      stored = true
    } catch {
      // Keep trying fallbacks so one storage backend can fail without losing recovery.
    }
  }
  return stored
}

export function getBrowserStorageItem(key: string): string | null {
  for (const storage of storageCandidates()) {
    try {
      const value = storage.getItem(key)
      if (value !== null) return value
    } catch {
      // Ignore unreadable storage backends.
    }
  }
  return null
}

export function removeBrowserStorageItem(key: string): void {
  for (const storage of storageCandidates()) {
    try {
      storage.removeItem(key)
    } catch {
      // Ignore cleanup failures.
    }
  }
}
