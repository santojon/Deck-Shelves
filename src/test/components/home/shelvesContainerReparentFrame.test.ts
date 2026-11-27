// @vitest-environment jsdom
import { act, createElement, forwardRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { reparent, noop } = vi.hoisted(() => ({ reparent: vi.fn(), noop: () => {} }))

vi.mock('../../../components/home/navPatches', () => ({
  reparentNavTreeNodes: reparent,
  patchShelfEdgeNavigation: noop,
  patchMenuButton: noop,
  installVerticalFocusBridge: noop,
}))
vi.mock('../../../runtime/devStamps', () => ({ devStamp: noop }))
vi.mock('../../../components/Shelf', () => ({ ShelfView: () => null }))
vi.mock('../../../store/settingsStore', () => ({ saveSettings: async () => true, getCurrentSettings: () => null }))
vi.mock('../../../core/reorder', () => ({ useContainerDragReorder: noop }))
vi.mock('../../../runtime/deckyPlatform', () => ({ createDeckyPlatform: () => ({}) }))
vi.mock('../../../runtime/logger', () => ({ logInfo: noop }))
vi.mock('../../../runtime/diagnostics', () => ({ logDiagnostic: noop }))
vi.mock('../../../runtime/steamHost', () => ({
  getPreferredSteamDocument: () => document,
  getPreferredSteamWindow: () => window,
  getAllSteamDocuments: () => [],
}))
vi.mock('../../../components/home/mountUtils', () => ({
  detectNavTreeApi: () => ({ available: true, detail: '' }),
  homeBehindGame: () => false,
}))
vi.mock('../../../runtime/homePatch', () => ({ applyHideRecents: noop }))
vi.mock('../../../runtime/host/decky', () => ({
  Focusable: forwardRef<HTMLDivElement, any>(({ children, className, style }, ref) => createElement('div', { ref, className, style }, children)),
}))
vi.mock('../../../core/steamGameMenu', () => ({
  installPassiveMenuHook: noop,
  installPassiveShowContextMenuHook: noop,
  installLibraryContextMenuPatch: noop,
  installCreateContextMenuPatch: noop,
  prewarmMenuExtraction: () => noop,
}))
vi.mock('../../../core/focusRestore', () => ({
  tryRestoreFocus: noop,
  hasPendingFocus: () => false,
  beginFocusRestoreLoop: noop,
  beginColdBootFocusGuard: noop,
  focusElementAuto: () => false,
  startFocusFirstPoll: () => noop,
}))
vi.mock('../../../runtime/powerGate', () => ({ getPowerState: noop }))
vi.mock('../../../components/shelf/shelfWarmState', () => ({
  allShelvesWarm: () => true,
  isShelfResolved: () => true,
  subscribeShelfResolved: () => noop,
}))
vi.mock('../../../features/sidenav/ShelfSideNav', () => ({
  focusNativeRecentsFirstCard: () => false,
  findNativeRecentsEl: () => null,
}))
vi.mock('../../../components/home/heroIdlePause', () => ({ useHeroIdlePause: noop }))
vi.mock('../../../core/steamOSVersion', () => ({ flowChildrenProps: () => ({}) }))
vi.mock('../../../core/cssLoaderDetect', () => ({ isCssLoaderActive: () => false, getNativeRecentsClassName: () => null }))
vi.mock('../../../themes', () => ({ applyRootThemeFlags: noop, clearRootThemeFlags: noop }))
vi.mock('../../../components/shelf/BadgeFocusOverlay', () => ({ BadgeFocusOverlay: () => null }))
vi.mock('../../../components/shelf/FriendsAvatarOverlay', () => ({ FriendsAvatarOverlay: () => null }))
vi.mock('../../../components/home/homeInjectHelpers', () => ({ dispatchHideRecentsDisabled: noop, anyShelfHasItems: async () => false }))
vi.mock('../../../components/home/homeFocusNav', () => ({ NATIVE_ROW_FOCUS: {}, nativeRowOnScreen: () => false, watchHomeLeave: () => noop }))
vi.mock('../../../components/home/homeReveal', () => ({
  settleHideCheck: noop,
  shelfIdsOf: () => [],
  applyProgressiveReveal: () => 0,
  anyShelfWarmWithItems: () => false,
  computeAutoCollapse: () => ({}),
}))

import { ShelvesContainer } from '../../../components/home/ShelvesContainer'

const FRAME_MS = 16

let root: Root
let host: HTMLDivElement
let mountEl: HTMLDivElement

beforeEach(async () => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(performance.now()), FRAME_MS))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  const scroller = document.createElement('div')
  mountEl = document.createElement('div')
  host = document.createElement('div')
  scroller.append(mountEl)
  document.body.append(scroller, host)
  root = createRoot(host)
  await act(async () => { root.render(createElement(ShelvesContainer, { mountEl, shelves: [] })) })
  reparent.mockClear()
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

const mutateMount = async () => { await act(async () => { mountEl.append(document.createElement('span')) }) }
const focusInside = () => { mountEl.dispatchEvent(new FocusEvent('focusin', { bubbles: true })) }
const nextFrame = async () => { await act(async () => { vi.advanceTimersByTime(FRAME_MS) }) }

describe('ShelvesContainer nav-tree reparent scheduling', () => {
  it('reparents once in a frame that has a full patch pass and a reparent pending, apply first', async () => {
    await mutateMount()
    focusInside()
    await nextFrame()
    expect(reparent).toHaveBeenCalledTimes(1)
  })

  it('reparents once in a frame that has a full patch pass and a reparent pending, reparent first', async () => {
    focusInside()
    await mutateMount()
    await nextFrame()
    expect(reparent).toHaveBeenCalledTimes(1)
  })

  it('still reparents on its own when no full patch pass is pending, also after a frame that merged both', async () => {
    focusInside()
    await nextFrame()
    expect(reparent).toHaveBeenCalledTimes(1)

    focusInside()
    await mutateMount()
    await nextFrame()
    expect(reparent).toHaveBeenCalledTimes(2)

    focusInside()
    await nextFrame()
    expect(reparent).toHaveBeenCalledTimes(3)
  })

  it.each([
    ['a full patch pass', [mutateMount]],
    ['a reparent', [focusInside]],
    ['a reparent then a full patch pass', [focusInside, mutateMount]],
    ['a full patch pass then a reparent', [mutateMount, focusInside]],
  ])('runs no frame after unmount with %s pending', async (_label, steps) => {
    for (const step of steps) await step()
    await act(async () => root.unmount())
    await nextFrame()
    expect(reparent).not.toHaveBeenCalled()
    root = createRoot(host)
  })
})
