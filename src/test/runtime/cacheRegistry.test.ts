import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CACHE_GROUPS, groupSizeBytes, clearGroup, clearAllCaches, formatBytes } from '../../runtime/cacheRegistry'

const lsStore = new Map<string, string>()
const localStorageStub = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => { lsStore.set(k, v) },
  removeItem: (k: string) => { lsStore.delete(k) },
  clear: () => lsStore.clear(),
}
beforeEach(() => { vi.stubGlobal('localStorage', localStorageStub); lsStore.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('cacheRegistry', () => {
  it('groupSizeBytes sums the bytes across a group\'s keys', () => {
    localStorage.setItem('ds-store-cache-v1', 'a'.repeat(300))
    localStorage.setItem('ds-store-cache-v3', 'b'.repeat(200))
    const store = CACHE_GROUPS.find((g) => g.id === 'store')!
    expect(groupSizeBytes(store)).toBe(500)
  })

  it('clearGroup removes only that group\'s keys', () => {
    localStorage.setItem('ds-store-cache-v1', 'a')
    localStorage.setItem('ds-images-v1', 'keep')
    clearGroup(CACHE_GROUPS.find((g) => g.id === 'store')!)
    expect(localStorage.getItem('ds-store-cache-v1')).toBeNull()
    expect(localStorage.getItem('ds-images-v1')).toBe('keep')
  })

  it('clearAllCaches wipes every registered cache key', () => {
    for (const g of CACHE_GROUPS) for (const k of g.keys) localStorage.setItem(k, 'z')
    clearAllCaches()
    for (const g of CACHE_GROUPS) for (const k of g.keys) expect(localStorage.getItem(k)).toBeNull()
  })

  it('metadata group covers the online-metadata caches', () => {
    const meta = CACHE_GROUPS.find((g) => g.id === 'metadata')!
    expect(meta.keys).toContain('ds-metadata-cache-v1')
    expect(meta.keys).toContain('ds-name-appid-v1')
  })

  it('formatBytes is human-readable', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
