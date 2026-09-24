import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../../components/notify', () => ({ notify: vi.fn() }))
vi.mock('../../../../steam/usageTracking', () => ({ trackFeature: vi.fn() }))
vi.mock('../../../../settingsStore', () => ({ writeJsonFile: vi.fn(), readJsonFile: vi.fn() }))

const createSnapshot = vi.fn(async () => [])
vi.mock('../../../../store/settingsStore', () => ({ createSnapshot: () => createSnapshot() }))

import { createShelfActions } from '../../../../features/settings/controller/shelves'

function makeDeps(shelves: any[]) {
  const state = { current: { shelves } as any }
  const persisted: any[] = []
  let selectedId: string | null = null
  const deps = {
    liveSettings: () => state.current,
    persist: async (next: any) => { persisted.push(next); state.current = next; return true },
    setSelectedId: (id: string | null) => { selectedId = id },
    get selectedId() { return selectedId },
    collections: [],
    tabs: [],
    shelves,
    t: (k: string) => k,
  }
  return { deps, state, persisted, getSelectedId: () => selectedId }
}

describe('composeShelfWith', () => {
  const sourceShelf = { id: 'a', title: 'Backlog', source: { type: 'tab', id: 'tab-a' } }
  const targetShelf = { id: 'b', title: 'Favorites', source: { type: 'tab', id: 'tab-b' } }

  it('folds the source shelf into the target as a composite union, then deletes the source', async () => {
    createSnapshot.mockClear()
    const { deps, state } = makeDeps([sourceShelf, targetShelf])
    const actions = createShelfActions(deps)
    await actions.composeShelfWith('a', 'b')

    expect(state.current.shelves).toHaveLength(1)
    const merged = state.current.shelves[0]
    expect(merged.id).toBe('b')
    expect(merged.title).toBe('Favorites')
    expect(merged.source).toEqual({
      type: 'composite',
      combine: 'union',
      sources: [targetShelf.source, sourceShelf.source],
    })
    expect(createSnapshot).toHaveBeenCalledTimes(1)
  })

  it('selects the target shelf after composing', async () => {
    const { deps, getSelectedId } = makeDeps([sourceShelf, targetShelf])
    const actions = createShelfActions(deps)
    await actions.composeShelfWith('a', 'b')
    expect(getSelectedId()).toBe('b')
  })

  it('is a no-op when either shelf id is unknown', async () => {
    const { deps, state } = makeDeps([sourceShelf, targetShelf])
    const actions = createShelfActions(deps)
    await actions.composeShelfWith('a', 'missing')
    expect(state.current.shelves).toHaveLength(2)
  })

  it('still composes even when the backend snapshot fails', async () => {
    createSnapshot.mockRejectedValueOnce(new Error('backend unreachable'))
    const { deps, state } = makeDeps([sourceShelf, targetShelf])
    const actions = createShelfActions(deps)
    await actions.composeShelfWith('a', 'b')
    expect(state.current.shelves).toHaveLength(1)
  })
})
