import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { isDebugOverlayEnabled } from '../../runtime/debugOverlay'

const lsStore = new Map<string, string>()
const localStorageStub = {
  getItem: (k: string) => lsStore.get(k) ?? null,
  setItem: (k: string, v: string) => { lsStore.set(k, v) },
  removeItem: (k: string) => { lsStore.delete(k) },
  clear: () => lsStore.clear(),
}
beforeEach(() => { vi.stubGlobal('localStorage', localStorageStub); lsStore.clear() })
afterEach(() => vi.unstubAllGlobals())

describe('isDebugOverlayEnabled', () => {
  it('is false when advanced mode is off, even with the flag set', () => {
    lsStore.set('ds-debug', '1')
    expect(isDebugOverlayEnabled({ advancedModeEnabled: false })).toBe(false)
    expect(isDebugOverlayEnabled(null)).toBe(false)
  })

  it('is false in advanced mode without a debug flag', () => {
    expect(isDebugOverlayEnabled({ advancedModeEnabled: true })).toBe(false)
  })

  it('is true in advanced mode with the debugOverlayEnabled toggle', () => {
    expect(isDebugOverlayEnabled({ advancedModeEnabled: true, debugOverlayEnabled: true })).toBe(true)
  })

  it('is false when the overlay toggle is on but advanced mode is off', () => {
    expect(isDebugOverlayEnabled({ advancedModeEnabled: false, debugOverlayEnabled: true })).toBe(false)
  })

  it('is true in advanced mode with ds-debug=1', () => {
    lsStore.set('ds-debug', '1')
    expect(isDebugOverlayEnabled({ advancedModeEnabled: true })).toBe(true)
  })

  it('is true in advanced mode with ?debug=1 in the realm URL', () => {
    vi.stubGlobal('location', { search: '?foo=bar&debug=1' })
    expect(isDebugOverlayEnabled({ advancedModeEnabled: true })).toBe(true)
  })
})
