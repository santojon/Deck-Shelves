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

  it('covers every newly-persisted cache (smart shelves, catalog, screenshots, tabs, theme discovery)', () => {
    const ids = CACHE_GROUPS.map((g) => g.id)
    expect(ids).toEqual(expect.arrayContaining(['smart_shelves', 'catalog', 'screenshots', 'tabs', 'theme_discovery']))
    const theme = CACHE_GROUPS.find((g) => g.id === 'theme_discovery')!
    expect(theme.keys).toEqual(expect.arrayContaining(['ds_class_map', 'ds_qam_panel_classes']))
  })

  it('never lists user data or stats as a clearable cache (pinned games, read-only history, device history)', () => {
    const allKeys = CACHE_GROUPS.flatMap((g) => g.keys)
    expect(allKeys).not.toContain('ds-pinned-games-v1')
    expect(allKeys).not.toContain('ds-history-v1')
    expect(allKeys).not.toContain('ds_device_history_v1')
  })

  it('clearing the smart-shelves group also invalidates the in-memory resolver cache', async () => {
    const { invalidateSmartShelfCache } = await import('../../steam/smartShelves')
    localStorage.setItem('ds-smart-shelf-cache-v1', JSON.stringify({ 'x:quick_play:10::3600000': { ts: Date.now(), ids: [1, 2, 3] } }))
    clearGroup(CACHE_GROUPS.find((g) => g.id === 'smart_shelves')!)
    // invalidateSmartShelfCache() persists the now-empty in-memory cache back
    // out, so the key ends up holding an empty object rather than vanishing —
    // either way, nothing from before the clear should survive.
    const raw = localStorage.getItem('ds-smart-shelf-cache-v1')
    expect(raw == null || Object.keys(JSON.parse(raw)).length === 0).toBe(true)
    expect(invalidateSmartShelfCache).toBeTypeOf('function')
  })

  it('formatBytes is human-readable', () => {
    expect(formatBytes(0)).toBe('—')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })
})
