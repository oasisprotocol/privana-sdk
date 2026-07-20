import { describe, expect, it } from 'bun:test'
import {
  clearExternalDepositVerification,
  clearExternalDepositLockSession,
  discardExternalDepositLockSession,
  externalDepositRetryAmount,
  externalDepositSessionId,
  getExternalDepositMinimum,
  isExternalDepositBlockInSession,
  loadExternalDepositLockSession,
  saveExternalDepositLockSession,
  subscribeExternalDepositLockSession,
  submitExternalDepositLock,
  type ExternalDepositLockSessionRecord,
} from '../src/sdk/hooks/external-deposit-lock'
import { PostDepositLockError, requireDepositLockOwner } from '../src/sdk/hooks/pending-lock'
import {
  canUseSharedBrowserStorage,
  getSharedBrowserStorageItem,
  removeSharedBrowserStorageItem,
  setSharedBrowserStorageItem,
} from '../src/sdk/hooks/browser-storage'
import { AccountingApiError } from '../src/sdk/client/errors'
import type { Address, DepositAddressResponse, LockFundsRequest } from '../src/sdk/types'

const OWNER = '0x000000000000000000000000000000000000dEaD' as Address
const OTHER_OWNER = '0x000000000000000000000000000000000000bEEF' as Address
const SERVICE = '0x1111111111111111111111111111111111111111' as Address
const TOKEN_ID = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const OTHER_TOKEN_ID = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
const CHAIN_ID = 84532

function createStorageStub({ failWrites = false }: { failWrites?: boolean } = {}): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error('Storage unavailable')
      map.set(key, String(value))
    },
  }
}

function copyStorage(source: Storage, target: Storage): void {
  for (let index = 0; index < source.length; index++) {
    const key = source.key(index)
    if (!key) continue
    const value = source.getItem(key)
    if (value !== null) target.setItem(key, value)
  }
}

async function withBrowserStorage(fn: () => Promise<void>): Promise<void> {
  const globals = globalThis as { window?: unknown }
  const original = globals.window
  globals.window = {
    localStorage: createStorageStub(),
    sessionStorage: createStorageStub(),
  }
  try {
    await fn()
  } finally {
    if (original === undefined) {
      delete globals.window
    } else {
      globals.window = original
    }
  }
}

async function withBrowserTabs(
  fn: (context: {
    localStorage: Storage
    sessionA: Storage
    sessionB: Storage
    selectTab: (tab: 'a' | 'b') => void
  }) => Promise<void>
): Promise<void> {
  const globals = globalThis as { window?: unknown }
  const original = globals.window
  const localStorage = createStorageStub()
  const sessionA = createStorageStub()
  const sessionB = createStorageStub()
  const selectTab = (tab: 'a' | 'b') => {
    globals.window = {
      localStorage,
      sessionStorage: tab === 'a' ? sessionA : sessionB,
    }
  }
  selectTab('a')
  try {
    await fn({ localStorage, sessionA, sessionB, selectTab })
  } finally {
    if (original === undefined) {
      delete globals.window
    } else {
      globals.window = original
    }
  }
}

async function withBrowserStorageEvents(
  fn: (context: {
    localStorage: Storage
    sessionStorage: Storage
    dispatchStorage: (key: string | null, storageArea?: Storage) => void
  }) => Promise<void>
): Promise<void> {
  const globals = globalThis as { window?: unknown }
  const original = globals.window
  const localStorage = createStorageStub()
  const sessionStorage = createStorageStub()
  const listeners = new Set<(event: StorageEvent) => void>()
  globals.window = {
    localStorage,
    sessionStorage,
    addEventListener: (type: string, listener: (event: StorageEvent) => void) => {
      if (type === 'storage') listeners.add(listener)
    },
    removeEventListener: (type: string, listener: (event: StorageEvent) => void) => {
      if (type === 'storage') listeners.delete(listener)
    },
  }
  try {
    await fn({
      localStorage,
      sessionStorage,
      dispatchStorage: (key, storageArea = localStorage) => {
        for (const listener of listeners) listener({ key, storageArea } as StorageEvent)
      },
    })
  } finally {
    if (original === undefined) {
      delete globals.window
    } else {
      globals.window = original
    }
  }
}

async function withWebLocks(fn: () => Promise<void>): Promise<void> {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  let tail: Promise<unknown> = Promise.resolve()
  const locks = {
    request: <T>(_name: string, callback: () => T | PromiseLike<T>): Promise<T> => {
      const run = tail.then(callback)
      tail = run.then(
        () => undefined,
        () => undefined
      )
      return run
    },
  }
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { locks },
  })
  try {
    await fn()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor)
    else delete (globalThis as { navigator?: unknown }).navigator
  }
}

function futureExpiry(seconds = 3600): string {
  return String(Math.floor(Date.now() / 1000) + seconds)
}

function makePayload(overrides: Partial<LockFundsRequest> = {}): LockFundsRequest {
  return {
    service_address: SERVICE,
    token_id: TOKEN_ID,
    amount: '1000',
    expiry: futureExpiry(),
    nonce: '0',
    signature: '0xsigned',
    ...overrides,
  }
}

function makeSession(
  overrides: Partial<ExternalDepositLockSessionRecord> = {}
): ExternalDepositLockSessionRecord {
  const payload = overrides.payload === undefined ? makePayload() : overrides.payload
  return {
    version: 1,
    owner: OWNER,
    serviceAddress: SERVICE,
    chainId: CHAIN_ID,
    tokenId: TOKEN_ID,
    startBlock: 100,
    depositAmount: '1000',
    maxLockAmount: '1000',
    lockDuration: 3600,
    generation: payload?.signature ?? '0xconsumed',
    payload,
    ...overrides,
  }
}

function stubClient() {
  const calls: LockFundsRequest[] = []
  const client = {
    lockFunds: async (payload: LockFundsRequest) => {
      calls.push(payload)
      return { submission_id: 'sub-1', status: 'submitted' }
    },
  }
  return { client: client as never, calls }
}

describe('browser storage authority', () => {
  it('stores recovery state durably without retaining a tab-local mirror', async () => {
    await withBrowserStorage(async () => {
      const key = 'privana:test-recovery'
      window.sessionStorage.setItem(key, 'stale')

      expect(setSharedBrowserStorageItem(key, 'current')).toBe(true)
      expect(window.localStorage.getItem(key)).toBe('current')
      expect(window.sessionStorage.getItem(key)).toBeNull()

      // A legacy tab-local copy must not become authoritative after the shared
      // record is cleared by another tab.
      window.sessionStorage.setItem(key, 'stale')
      window.localStorage.removeItem(key)
      expect(getSharedBrowserStorageItem(key)).toBeNull()

      removeSharedBrowserStorageItem(key)
      expect(window.sessionStorage.getItem(key)).toBeNull()
    })
  })

  it('fails closed when durable storage is unavailable', async () => {
    const globals = globalThis as { window?: unknown }
    const original = globals.window
    const sessionStorage = createStorageStub()
    globals.window = {
      localStorage: createStorageStub({ failWrites: true }),
      sessionStorage,
    }
    try {
      expect(canUseSharedBrowserStorage()).toBe(false)
      expect(setSharedBrowserStorageItem('privana:test-recovery', 'value')).toBe(false)
      expect(sessionStorage.getItem('privana:test-recovery')).toBeNull()
    } finally {
      if (original === undefined) delete globals.window
      else globals.window = original
    }
  })
})

describe('external deposit owner', () => {
  it('uses the authenticated beneficiary and accepts checksum-only casing differences', () => {
    expect(requireDepositLockOwner(OWNER.toLowerCase() as Address, OWNER)).toBe(OWNER)
  })

  it('rejects a connected wallet that differs from the authenticated beneficiary', () => {
    expect(() => requireDepositLockOwner(OTHER_OWNER, OWNER)).toThrow(
      'Connected wallet does not match the authenticated deposit account'
    )
  })
})

describe('external deposit minimum', () => {
  it('reads the backend minimum for the selected chain and asset kind', () => {
    const response = {
      deposit_address: OWNER,
      chain_type: 'evm',
      version: 0,
      min_deposit: {
        [CHAIN_ID]: { native: '100', erc20: '1000' },
      },
    }

    expect(getExternalDepositMinimum(response, CHAIN_ID)).toBe(1000n)
    expect(getExternalDepositMinimum(response, 1)).toBeUndefined()
  })

  it('treats a legacy response without minimums as unavailable', () => {
    expect(
      getExternalDepositMinimum(
        {
          deposit_address: OWNER,
          chain_type: 'evm',
          version: 0,
        } as DepositAddressResponse,
        CHAIN_ID
      )
    ).toBeUndefined()
  })
})

describe('external deposit session persistence', () => {
  it('rehydrates the complete session for the canonical owner', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession()
      saveExternalDepositLockSession(session)

      expect(loadExternalDepositLockSession(OWNER)).toEqual(session)
      expect(loadExternalDepositLockSession(OTHER_OWNER)).toBeUndefined()
    })
  })

  it('refuses to replace an unresolved active session', async () => {
    await withBrowserStorage(async () => {
      const first = makeSession()
      saveExternalDepositLockSession(first)
      const payload = makePayload({ token_id: OTHER_TOKEN_ID, signature: '0xnew' })
      const replacement = makeSession({
        tokenId: OTHER_TOKEN_ID,
        generation: payload.signature,
        payload,
      })

      expect(() => saveExternalDepositLockSession(replacement)).toThrow(
        'External deposit lock session changed'
      )
      expect(loadExternalDepositLockSession(OWNER)).toEqual(first)
    })
  })

  it('persists the discovered transfer before verification and rehydrates it', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession()
      saveExternalDepositLockSession(session)
      const verifying = {
        ...session,
        verification: {
          hash: '0xabc' as const,
          chainId: CHAIN_ID,
          amount: '1000',
          logIndex: 2,
        },
      }

      saveExternalDepositLockSession(verifying, session)
      expect(loadExternalDepositLockSession(OWNER)).toEqual(verifying)
    })
  })

  it('updates an active session without rewriting its already-durable pointer', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession()
      saveExternalDepositLockSession(session)
      const activeKey = `privana:external-deposit-lock:active:${OWNER.toLowerCase()}`
      const setItem = window.localStorage.setItem.bind(window.localStorage)
      window.localStorage.setItem = (key, value) => {
        if (key === activeKey) throw new Error('Active pointer is read-only')
        setItem(key, value)
      }
      const verifying = {
        ...session,
        verification: {
          hash: '0xabc' as const,
          chainId: CHAIN_ID,
          amount: '1000',
          logIndex: 2,
        },
      }

      saveExternalDepositLockSession(verifying, session)
      expect(loadExternalDepositLockSession(OWNER)).toEqual(verifying)
    })
  })

  it('clears only the rejected verification candidate', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession({
        verification: {
          hash: '0xabc',
          chainId: CHAIN_ID,
          amount: '1000',
          logIndex: 2,
        },
      })
      saveExternalDepositLockSession(session)

      const cleared = clearExternalDepositVerification(session)
      expect(cleared?.verification).toBeUndefined()
      expect(cleared?.payload).toEqual(session.payload)
      expect(cleared?.startBlock).toBe(session.startBlock)
      expect(loadExternalDepositLockSession(OWNER)).toEqual(cleared)
    })
  })

  it('does not clear a verification candidate replaced in another tab', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession({
        verification: {
          hash: '0xabc',
          chainId: CHAIN_ID,
          amount: '1000',
          logIndex: 2,
        },
      })
      saveExternalDepositLockSession(session)
      const replacement = {
        ...session,
        verification: { ...session.verification!, hash: '0xdef' as const },
      }
      saveExternalDepositLockSession(replacement, session)

      expect(clearExternalDepositVerification(session)).toBeUndefined()
      expect(loadExternalDepositLockSession(OWNER)).toEqual(replacement)
    })
  })

  it('does not discard a session that advanced after the rendered snapshot', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession()
      saveExternalDepositLockSession(session)
      const verifying = {
        ...session,
        verification: {
          hash: '0xabc' as const,
          chainId: CHAIN_ID,
          amount: '1000',
          logIndex: 2,
        },
      }
      saveExternalDepositLockSession(verifying, session)

      expect(discardExternalDepositLockSession(session)).toBe(false)
      expect(loadExternalDepositLockSession(OWNER)).toEqual(verifying)
    })
  })

  it('does not overwrite same-generation progress from a stale tab', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession()
      saveExternalDepositLockSession(session)
      const verifying = {
        ...session,
        verification: {
          hash: '0xabc' as const,
          chainId: CHAIN_ID,
          amount: '1000',
          logIndex: 2,
        },
      }
      saveExternalDepositLockSession(verifying, session)
      const staleCandidate = {
        ...session,
        verification: {
          hash: '0xdef' as const,
          chainId: CHAIN_ID,
          amount: '1000',
          logIndex: 3,
        },
      }

      expect(() => saveExternalDepositLockSession(staleCandidate, session)).toThrow(
        'External deposit lock session changed'
      )
      expect(loadExternalDepositLockSession(OWNER)).toEqual(verifying)
    })
  })

  it('does not let an old generation clear a newer same-token session', async () => {
    await withBrowserStorage(async () => {
      const first = makeSession()
      saveExternalDepositLockSession(first)
      const payload = makePayload({ signature: '0xnew' })
      const replacement = makeSession({ generation: payload.signature, payload })
      saveExternalDepositLockSession(replacement, first)

      clearExternalDepositLockSession(
        OWNER,
        externalDepositSessionId(CHAIN_ID, TOKEN_ID),
        first.generation
      )
      expect(loadExternalDepositLockSession(OWNER)).toEqual(replacement)
    })
  })

  it("does not resurrect a cancelled session from another tab's stale mirror", async () => {
    await withBrowserTabs(async ({ localStorage, sessionB, selectTab }) => {
      const session = makeSession()
      saveExternalDepositLockSession(session)

      // Simulate a tab that loaded the record under an older SDK which mirrored
      // shared recovery state into that tab's sessionStorage.
      copyStorage(localStorage, sessionB)
      selectTab('b')
      const stale = loadExternalDepositLockSession(OWNER)
      expect(stale).toEqual(session)

      selectTab('a')
      clearExternalDepositLockSession(
        OWNER,
        externalDepositSessionId(CHAIN_ID, TOKEN_ID),
        session.generation
      )

      selectTab('b')
      expect(loadExternalDepositLockSession(OWNER)).toBeUndefined()
      expect(() => saveExternalDepositLockSession(stale!, session)).toThrow(
        'External deposit lock session changed'
      )
      expect(localStorage.length).toBe(0)
    })
  })

  it('clears an already-open tab when another tab cancels the shared session', async () => {
    await withBrowserStorageEvents(async ({ localStorage, sessionStorage, dispatchStorage }) => {
      const session = makeSession()
      saveExternalDepositLockSession(session)
      let visibleSession = loadExternalDepositLockSession(OWNER)
      const unsubscribe = subscribeExternalDepositLockSession(OWNER, (next) => {
        visibleSession = next
      })
      const activeKey = `privana:external-deposit-lock:active:${OWNER.toLowerCase()}`

      // Session-storage events and unrelated shared records must not affect the
      // currently rendered external-deposit session.
      dispatchStorage(activeKey, sessionStorage)
      dispatchStorage('privana:unrelated', localStorage)
      expect(visibleSession).toEqual(session)

      clearExternalDepositLockSession(
        OWNER,
        externalDepositSessionId(CHAIN_ID, TOKEN_ID),
        session.generation
      )
      dispatchStorage(activeKey)
      expect(visibleSession).toBeUndefined()

      unsubscribe()
      saveExternalDepositLockSession(session)
      dispatchStorage(activeKey)
      expect(visibleSession).toBeUndefined()
    })
  })
})

describe('external deposit session boundary', () => {
  it('accepts only source-chain blocks mined after the policy was signed', () => {
    const session = makeSession({ startBlock: 100 })
    expect(isExternalDepositBlockInSession(session, 100)).toBe(false)
    expect(isExternalDepositBlockInSession(session, 101)).toBe(true)
  })
})

describe('external deposit lock settlement', () => {
  it('keeps recovery state during the request and clears the full session on success', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession({ creditedAmount: '1000' })
      saveExternalDepositLockSession(session)
      let resolveRequest: ((value: { submission_id: string; status: string }) => void) | undefined
      const client = {
        lockFunds: () =>
          new Promise<{ submission_id: string; status: string }>((resolve) => {
            resolveRequest = resolve
          }),
      }

      const submission = submitExternalDepositLock(client as never, session)
      await Promise.resolve()
      expect(loadExternalDepositLockSession(OWNER)?.payload).toEqual(session.payload)

      resolveRequest?.({ submission_id: 'sub-1', status: 'submitted' })
      await submission
      expect(loadExternalDepositLockSession(OWNER)).toBeUndefined()
    })
  })

  it('does not resubmit after another tab completed the lock', async () => {
    await withWebLocks(async () => {
      await withBrowserTabs(async ({ localStorage, sessionB, selectTab }) => {
        const session = makeSession({ creditedAmount: '1000' })
        saveExternalDepositLockSession(session)
        copyStorage(localStorage, sessionB)

        selectTab('b')
        const stale = loadExternalDepositLockSession(OWNER)
        expect(stale).toEqual(session)

        selectTab('a')
        const first = stubClient()
        await submitExternalDepositLock(first.client, session)
        expect(first.calls).toHaveLength(1)

        selectTab('b')
        expect(loadExternalDepositLockSession(OWNER)).toBeUndefined()
        const second = stubClient()
        const error = await submitExternalDepositLock(second.client, stale!).catch((err) => err)
        expect(error).toBeInstanceOf(PostDepositLockError)
        expect((error as PostDepositLockError).reason).toBe('not-found')
        expect(second.calls).toHaveLength(0)
      })
    })
  })

  it('retains the same payload after an ambiguous API rejection', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession({ creditedAmount: '1000' })
      saveExternalDepositLockSession(session)
      const apiError = new Error('createLock nonce mismatch')
      const client = {
        lockFunds: async () => {
          throw apiError
        },
      }

      const error = await submitExternalDepositLock(client as never, session).catch((err) => err)
      expect(error).toBeInstanceOf(PostDepositLockError)
      expect((error as PostDepositLockError).reason).toBe('submission-failed')
      expect((error as PostDepositLockError).cause).toBe(apiError)
      expect((error as PostDepositLockError).submissionMayHaveSucceeded).toBe(true)
      const stored = loadExternalDepositLockSession(OWNER)
      expect(stored?.payload).toEqual(session.payload)
      expect(stored?.creditedAmount).toBe('1000')
      expect(stored?.submissionAmbiguous).toBe(true)
    })
  })

  it('fresh-signs after a definitive rejection when submission is cross-tab exclusive', async () => {
    await withWebLocks(async () => {
      await withBrowserStorage(async () => {
        const session = makeSession({ creditedAmount: '1000' })
        saveExternalDepositLockSession(session)
        const client = {
          lockFunds: async () => {
            throw new AccountingApiError('nonce rejected', 409, 'createLock nonce mismatch')
          },
        }

        const error = await submitExternalDepositLock(client as never, session).catch((err) => err)
        expect(error).toBeInstanceOf(PostDepositLockError)
        expect(loadExternalDepositLockSession(OWNER)?.payload).toBeUndefined()
      })
    })
  })

  it('never fresh-signs after an ambiguous attempt followed by a nonce rejection', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession({ creditedAmount: '1000' })
      saveExternalDepositLockSession(session)
      await submitExternalDepositLock(
        {
          lockFunds: async () => {
            throw new Error('connection closed')
          },
        } as never,
        session
      ).catch(() => undefined)

      const ambiguous = loadExternalDepositLockSession(OWNER)
      expect(ambiguous?.submissionAmbiguous).toBe(true)
      await submitExternalDepositLock(
        {
          lockFunds: async () => {
            throw new AccountingApiError('nonce rejected', 409, 'createLock nonce mismatch')
          },
        } as never,
        ambiguous!
      ).catch(() => undefined)

      expect(loadExternalDepositLockSession(OWNER)?.payload).toEqual(session.payload)
    })
  })

  it('preserves an ambiguous signature after it expires', async () => {
    await withBrowserStorage(async () => {
      const payload = makePayload({ expiry: futureExpiry(120) })
      const session = makeSession({
        creditedAmount: '1000',
        generation: payload.signature,
        payload,
      })
      saveExternalDepositLockSession(session)
      await submitExternalDepositLock(
        {
          lockFunds: async () => {
            throw new Error('connection closed')
          },
        } as never,
        session
      ).catch(() => undefined)

      const ambiguous = loadExternalDepositLockSession(OWNER)
      const originalNow = Date.now
      Date.now = () => originalNow() + 5 * 60 * 1000
      try {
        const error = await submitExternalDepositLock(
          {
            lockFunds: async () => ({ submission_id: 'unexpected', status: 'submitted' }),
          } as never,
          ambiguous!
        ).catch((err) => err)

        expect(error).toBeInstanceOf(PostDepositLockError)
        expect((error as PostDepositLockError).reason).toBe('expired')
        expect((error as PostDepositLockError).submissionMayHaveSucceeded).toBe(true)
        const stored = loadExternalDepositLockSession(OWNER)
        expect(stored?.payload).toEqual(payload)
        expect(stored?.submissionAmbiguous).toBe(true)
      } finally {
        Date.now = originalNow
      }
    })
  })

  it('serializes stale tab snapshots and preserves the signature after an ambiguous attempt', async () => {
    await withWebLocks(async () => {
      await withBrowserStorage(async () => {
        const session = makeSession({ creditedAmount: '1000' })
        saveExternalDepositLockSession(session)
        let calls = 0
        const client = {
          lockFunds: async () => {
            calls++
            if (calls === 1) throw new Error('connection closed')
            throw new AccountingApiError('nonce rejected', 409, 'createLock nonce mismatch')
          },
        }

        await Promise.all([
          submitExternalDepositLock(client as never, session).catch(() => undefined),
          submitExternalDepositLock(client as never, session).catch(() => undefined),
        ])

        expect(calls).toBe(2)
        expect(loadExternalDepositLockSession(OWNER)?.payload).toEqual(session.payload)
      })
    })
  })

  it('fails closed on a short credit and retains the exact recovery amount', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession({ creditedAmount: '999' })
      saveExternalDepositLockSession(session)
      const { client, calls } = stubClient()

      const error = await submitExternalDepositLock(client, session).catch((err) => err)
      expect(error).toBeInstanceOf(PostDepositLockError)
      expect((error as PostDepositLockError).reason).toBe('credited-below-signed')
      expect((error as PostDepositLockError).creditedAmount).toBe(999n)
      expect(calls).toHaveLength(0)
      const stored = loadExternalDepositLockSession(OWNER)
      expect(stored?.creditedAmount).toBe('999')
      expect(stored?.payload).toBeUndefined()
    })
  })

  it('locks only the signed cap when the deposit over-delivers', async () => {
    await withBrowserStorage(async () => {
      const session = makeSession({ creditedAmount: '1200' })
      saveExternalDepositLockSession(session)
      const { client, calls } = stubClient()

      await submitExternalDepositLock(client, session)
      expect(calls).toHaveLength(1)
      expect(calls[0].amount).toBe('1000')
      expect(loadExternalDepositLockSession(OWNER)).toBeUndefined()
    })
  })

  it('retries at the credited amount without exceeding the original signed cap', () => {
    expect(externalDepositRetryAmount(makeSession({ creditedAmount: '999' }))).toBe(999n)
    expect(externalDepositRetryAmount(makeSession({ creditedAmount: '1200' }))).toBe(1000n)
  })
})
