import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  options: null as any,
  builtFor: [] as number[],
  activeAppid: 0,
}))

vi.mock('../../runtime/host/decky', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  getFrontendLib: () => ({}),
}))
vi.mock('../../core/menu/libraryMenuLocator', () => ({
  locateLibraryMenuClass: () => class GameMenu { render() { return null } },
  isGameMenuItemList: () => true,
}))
vi.mock('../../core/menu/gameMenuEntries', () => ({
  installGameMenuEntries: (options: unknown) => { state.options = options; return { uninstall: () => undefined } },
}))
vi.mock('../../core/menu/itemBuilders', () => ({
  buildShelfContextMenu: () => [],
  buildLibraryAddToShelfItems: (appid: number) => { state.builtFor.push(appid); return [{ key: 'ds-lib-add-shelf' }] },
}))
vi.mock('../../core/menu/menuContext', () => ({
  DS_ROOT_KEYS: new Set<string>(),
  buildDeckShelvesMenuItems: () => [],
  findCardAnchor: () => null,
  getActiveAppIdForMenu: () => state.activeAppid,
  resolveShelfIdByAppid: () => undefined,
  resolveShelfIdFromProps: () => undefined,
  setActiveShelfIdForMenu: () => undefined,
}))
vi.mock('../../steam/internals', () => ({
  steamAppStore: () => null,
  steamUIStore: () => null,
  steamReact: () => ({ createElement: () => ({}) }),
  steamJsxRuntime: () => null,
}))

import { installLibraryContextMenuPatch } from '../../core/steamGameMenu'

const entry = (props: Record<string, unknown>) => ({ $$typeof: Symbol.for('react.transitional.element'), type: 'x', key: null, props })

function entriesFor(list: unknown[], props: unknown): void {
  state.options.entriesFor({ list, props })
}

describe('game menu entries: which app a list is for', () => {
  beforeEach(() => {
    state.builtFor = []
    state.activeAppid = 0
    if (!state.options) installLibraryContextMenuPatch()
  })

  it('reads the game menu\'s own props on its first render', () => {
    entriesFor([entry({ rgApps: [{ appid: 42 }] })], { overview: { appid: 7 } })
    expect(state.builtFor).toEqual([7])
  })

  it('reads the app the list names when the props are the menu body\'s, not a card opened earlier', () => {
    state.activeAppid = 999
    const list = [entry({ children: 'Play' }), entry({ rgApps: [{ appid: 42 }] }), entry({ rgApps: [{ appid: 42 }] })]
    entriesFor(list, { children: list })
    expect(state.builtFor).toEqual([42])
  })

  it('falls back to the card that opened the menu only when the list names no single app', () => {
    state.activeAppid = 999
    entriesFor([entry({ rgApps: [{ appid: 1 }] }), entry({ overview: { appid: 2 } })], { children: [] })
    entriesFor([entry({ rgApps: [{ appid: 1 }, { appid: 2 }] })], { children: [] })
    expect(state.builtFor).toEqual([999, 999])
  })
})
