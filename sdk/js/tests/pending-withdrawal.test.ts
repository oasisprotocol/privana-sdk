import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import {
  clearPendingWithdrawal,
  loadPendingWithdrawal,
  savePendingWithdrawal,
  type PendingWithdrawal,
} from '../src/sdk/utils/pending-withdrawal'

const ADDRESS = '0xAbCdEf0000000000000000000000000000000001'
const OTHER_ADDRESS = '0xAbCdEf0000000000000000000000000000000002'
const KEY = `privana:pending-withdrawal:${ADDRESS.toLowerCase()}`

function createStorageStub(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, String(value)),
  }
}

const globals = globalThis as { window?: { localStorage: Storage; sessionStorage: Storage } }
const originalWindow = globals.window

beforeEach(() => {
  globals.window = { localStorage: createStorageStub(), sessionStorage: createStorageStub() }
})

afterEach(() => {
  if (originalWindow === undefined) delete globals.window
  else globals.window = originalWindow
})

const withdrawal = (savedAt = Date.now()): PendingWithdrawal => ({
  index: 42,
  tokenId: '0x' + 'aa'.repeat(32),
  amount: '1500000',
  savedAt,
})

describe('pending withdrawal record', () => {
  it('round-trips a saved withdrawal for the same address in any case', () => {
    const saved = withdrawal()
    savePendingWithdrawal(ADDRESS, saved)
    expect(loadPendingWithdrawal(ADDRESS.toLowerCase())).toEqual(saved)
  })

  it('is scoped to one address', () => {
    savePendingWithdrawal(ADDRESS, withdrawal())
    expect(loadPendingWithdrawal(OTHER_ADDRESS)).toBeNull()
  })

  it('is gone after clearing', () => {
    savePendingWithdrawal(ADDRESS, withdrawal())
    clearPendingWithdrawal(ADDRESS)
    expect(loadPendingWithdrawal(ADDRESS)).toBeNull()
  })

  it('drops a record older than 30 minutes', () => {
    savePendingWithdrawal(ADDRESS, withdrawal(Date.now() - 31 * 60 * 1000))
    expect(loadPendingWithdrawal(ADDRESS)).toBeNull()
    expect(globals.window!.localStorage.getItem(KEY)).toBeNull()
  })

  it.each([
    ['not json'],
    [JSON.stringify({ index: '42', tokenId: '0x1', amount: '1', savedAt: 1 })],
  ])('drops an unreadable record: %s', (raw) => {
    globals.window!.localStorage.setItem(KEY, raw)
    expect(loadPendingWithdrawal(ADDRESS)).toBeNull()
    expect(globals.window!.localStorage.getItem(KEY)).toBeNull()
  })
})
