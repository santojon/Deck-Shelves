// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const shared = vi.hoisted(() => ({
  state: { current: null as any },
  captured: null as any,
  saveSettings: vi.fn(),
}))

vi.mock('../../store/settingsStore', () => ({
  getCurrentSettings: () => shared.state.current,
  saveSettings: (next: any) => shared.saveSettings(next),
}))
vi.mock('../../steam/usageTracking', () => ({ trackFeature: () => {} }))
// The row hands `hiddenSet` / `onHideCard` to its cards; capture them there.
vi.mock('../../components/shelf/ShelfRow', () => ({
  ShelfRow: (props: any) => { shared.captured = props; return null },
  isWideItem: () => false,
}))

import { DeckRow } from '../../components/DeckRow'

const freshSettings = () => ({
  shelves: [{ id: 'reg', title: 'Regular', enabled: true, hidden: false, limit: 10, source: { type: 'collection', collectionId: 'c' }, hiddenAppIds: [] }],
  smartShelves: [{ id: 'smart', title: 'Roulette', mode: 'random_pick', enabled: true, hidden: false, limit: 10, hiddenAppIds: [7] }],
})

let root: Root
let mount: HTMLDivElement

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(performance.now()), 16))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} })
  shared.saveSettings.mockReset()
  shared.saveSettings.mockImplementation(async (next: any) => { shared.state.current = next; return true })
  shared.captured = null
  shared.state.current = freshSettings()
  mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

async function render(shelfId: string, items: Array<{ appid: number }> = [{ appid: 7 }, { appid: 8 }]) {
  await act(async () => { root.render(createElement(DeckRow, { title: 'Row', shelfId, items: items as any })) })
  return shared.captured
}

const savedAt = (call: number) => shared.saveSettings.mock.calls[call][0]

describe('DeckRow X button hide / show', () => {
  it('smart shelf: hides and shows a game inside smartShelves, leaving the regular list alone', async () => {
    const row = await render('smart')
    expect(row.hiddenSet).toEqual(new Set([7]))

    const before = shared.state.current
    row.onHideCard(8)
    expect(shared.saveSettings).toHaveBeenCalledTimes(1)
    expect(savedAt(0).smartShelves[0].hiddenAppIds).toEqual([7, 8])
    expect(savedAt(0).shelves).toBe(before.shelves)

    row.onHideCard(7)
    expect(savedAt(1).smartShelves[0].hiddenAppIds).toEqual([8])

    // A new items array is what re-reads settings for the Hide/Show label.
    const next = await render('smart', [{ appid: 7 }, { appid: 8 }])
    expect(next.hiddenSet).toEqual(new Set([8]))
  })

  it('regular shelf: hides and shows through the shelves list, leaving smartShelves alone', async () => {
    const row = await render('reg')
    expect(row.hiddenSet).toBeUndefined()

    const before = shared.state.current
    row.onHideCard(8)
    expect(savedAt(0).shelves[0].hiddenAppIds).toEqual([8])
    expect(savedAt(0).smartShelves).toBe(before.smartShelves)

    row.onHideCard(8)
    expect(savedAt(1).shelves[0].hiddenAppIds).toEqual([])
  })

  it('a shelf id found in neither list saves nothing', async () => {
    const row = await render('ghost')
    expect(row.hiddenSet).toBeUndefined()
    row.onHideCard(8)
    expect(shared.saveSettings).not.toHaveBeenCalled()
  })
})

describe('DeckRow X button remove (menu-added game)', () => {
  it('smart shelf: drops the game from smartShelves[].manualOrder, leaving the regular list alone', async () => {
    shared.state.current.smartShelves[0].manualOrder = [9, 8]
    const row = await render('smart')

    const before = shared.state.current
    row.onRemoveCard(9)
    expect(shared.saveSettings).toHaveBeenCalledTimes(1)
    expect(savedAt(0).smartShelves[0].manualOrder).toEqual([8])
    expect(savedAt(0).shelves).toBe(before.shelves)

    // A game the manual order never held is not a removal.
    row.onRemoveCard(123)
    expect(shared.saveSettings).toHaveBeenCalledTimes(1)
  })

  it('regular shelf: drops the game from shelves[].manualOrder, leaving smartShelves alone', async () => {
    shared.state.current.shelves[0].manualOrder = [9]
    const row = await render('reg')

    const before = shared.state.current
    row.onRemoveCard(9)
    expect(savedAt(0).shelves[0].manualOrder).toEqual([])
    expect(savedAt(0).smartShelves).toBe(before.smartShelves)
  })
})
