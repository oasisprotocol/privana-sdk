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

/**
 * External deposit sessions coordinate work across tabs, so they require one
 * shared authority. A tab-local fallback can resurrect a session another tab
 * already completed or cancelled.
 */
export function canUseSharedBrowserStorage(): boolean {
  const storage = storageCandidate('localStorage')
  if (!storage) return false
  const probeKey = 'privana:shared-storage-probe'
  try {
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return true
  } catch {
    return false
  }
}

export function setSharedBrowserStorageItem(key: string, value: string): boolean {
  const storage = storageCandidate('localStorage')
  if (!storage) return false
  try {
    storage.setItem(key, value)
  } catch {
    return false
  }

  // Clean up a current-tab copy left by development versions which mirrored
  // these new session keys before shared storage became authoritative.
  try {
    storageCandidate('sessionStorage')?.removeItem(key)
  } catch {
    // The shared write above is authoritative.
  }
  return true
}

export function getSharedBrowserStorageItem(key: string): string | null {
  try {
    return storageCandidate('localStorage')?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function removeSharedBrowserStorageItem(key: string): void {
  // localStorage is authoritative. Removing the current tab's legacy mirror
  // as well prevents confusing leftovers during development and upgrades.
  for (const storage of storageCandidates()) {
    try {
      storage.removeItem(key)
    } catch {
      // Ignore cleanup failures.
    }
  }
}
