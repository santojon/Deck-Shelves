// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const found = vi.hoisted(() => ({ manager: null as any }))
vi.mock('../../../components/qam/qamMenuManager', () => ({ findPanelMenuManager: () => found.manager }))
const seen = vi.hoisted(() => ({ controllers: [] as unknown[] }))
vi.mock('../../../components/qam/sidecar/SidecarPanel', () => ({ SidecarPanel: (p: { controller: unknown }) => { seen.controllers.push(p.controller); return null }, rememberSidecarFocus: vi.fn(), focusedInSidecar: () => null }))

import { openSidecarList, useSidecarMenu } from '../../../components/qam/sidecar/sidecarMenu'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

function fakeManager() {
  let changed: (() => void) | null = null
  const menus: any[] = []
  const m: any = {
    ActiveMenu: null,
    OnMenusChanged: { Register: (fn: () => void) => { changed = fn; return { Unregister: () => { changed = null } } }, fire: () => changed?.() },
    CreateContextMenuInstance: vi.fn(() => {
      const menu = { Show: vi.fn(() => { m.ActiveMenu = menu }), Hide: vi.fn(() => { m.ActiveMenu = null; changed?.() }) }
      menus.push(menu)
      return menu
    }),
  }
  return { m, menus, steamCloses: () => { m.ActiveMenu = null; changed?.() } }
}

let root: Root
let mount: HTMLElement
let inline: boolean[] = []

const BASE = {} as any

let onOpen = vi.fn()

function Probe({ open, onCollapse, controller }: { open: boolean; onCollapse: () => void; controller: any }) {
  const ref = useRef<HTMLDivElement>(null)
  inline.push(useSidecarMenu({ scopeRef: ref, open, controller, onCollapse, onOpen }))
  return createElement('div', { ref })
}

async function render(open: boolean, onCollapse: () => void, controller: any = BASE) {
  await act(async () => root.render(createElement(Probe, { open, onCollapse, controller })))
}

describe('the sidecar as a menu of the panel', () => {
  beforeEach(() => {
    inline = []
    onOpen = vi.fn()
    mount = document.createElement('div')
    document.body.appendChild(mount)
    root = createRoot(mount)
  })
  afterEach(async () => {
    await act(async () => root.unmount())
    mount.remove()
    found.manager = null
  })

  it("opens as a menu of the panel's own manager and draws no inline copy", async () => {
    const { m, menus } = fakeManager()
    found.manager = m
    const onCollapse = vi.fn()
    await render(false, onCollapse)
    await render(true, onCollapse)
    expect(m.CreateContextMenuInstance).toHaveBeenCalledTimes(1)
    expect(menus[0].Show).toHaveBeenCalledTimes(1)
    expect(inline.at(-1)).toBe(false)
  })

  it('hides its menu when the sidecar closes', async () => {
    const { m, menus } = fakeManager()
    found.manager = m
    const onCollapse = vi.fn()
    await render(false, onCollapse)
    await render(true, onCollapse)
    await render(false, onCollapse)
    expect(menus[0].Hide).toHaveBeenCalledTimes(1)
    expect(onCollapse).not.toHaveBeenCalled()
  })

  it('closes the sidecar when Steam closes its menu', async () => {
    const { m, steamCloses } = fakeManager()
    found.manager = m
    const onCollapse = vi.fn()
    await render(false, onCollapse)
    await render(true, onCollapse)
    vi.useFakeTimers()
    steamCloses()
    expect(onCollapse).not.toHaveBeenCalled()
    vi.advanceTimersByTime(200)
    vi.useRealTimers()
    expect(onCollapse).toHaveBeenCalledTimes(1)
  })

  it('stays open under a list opened from inside it, and shows again when the list closes', async () => {
    const { m, menus } = fakeManager()
    found.manager = m
    const onCollapse = vi.fn()
    await render(false, onCollapse)
    await render(true, onCollapse)
    vi.useFakeTimers()
    m.ActiveMenu = null
    m.OnMenusChanged.fire()
    m.ActiveMenu = { list: true }
    m.OnMenusChanged.fire()
    vi.advanceTimersByTime(200)
    expect(onCollapse).not.toHaveBeenCalled()
    expect(document.documentElement.getAttribute('data-ds-sidecar-list')).toBe('1')
    m.ActiveMenu = null
    m.OnMenusChanged.fire()
    vi.advanceTimersByTime(200)
    vi.useRealTimers()
    expect(onCollapse).not.toHaveBeenCalled()
    expect(menus[0].Show).toHaveBeenCalledTimes(2)
    expect(m.ActiveMenu).toBe(menus[0])
    expect(document.documentElement.hasAttribute('data-ds-sidecar-list')).toBe(false)
  })

  it('clears its list mark when it closes under a list', async () => {
    const { m } = fakeManager()
    found.manager = m
    const onCollapse = vi.fn()
    await render(false, onCollapse)
    await render(true, onCollapse)
    m.ActiveMenu = { list: true }
    m.OnMenusChanged.fire()
    expect(document.documentElement.getAttribute('data-ds-sidecar-list')).toBe('1')
    await render(false, onCollapse)
    expect(document.documentElement.hasAttribute('data-ds-sidecar-list')).toBe(false)
  })

  it("shows the panel's latest settings while open", async () => {
    const { m } = fakeManager()
    found.manager = m
    const onCollapse = vi.fn()
    const first = { id: 1 } as any
    const next = { id: 2 } as any
    await render(false, onCollapse, first)
    await render(true, onCollapse, first)
    const content = m.CreateContextMenuInstance.mock.calls[0][0]
    const menuMount = document.createElement('div')
    const menuRoot = createRoot(menuMount)
    await act(async () => menuRoot.render(content))
    await render(true, onCollapse, next)
    expect(seen.controllers.at(-1)).toBe(next)
    expect(m.CreateContextMenuInstance).toHaveBeenCalledTimes(1)
    await act(async () => menuRoot.unmount())
  })

  it('is drawn inline when the panel has no menu manager of its own', async () => {
    const onCollapse = vi.fn()
    await render(true, onCollapse)
    expect(inline.at(-1)).toBe(true)
  })
})

describe("a dropdown's list from inside the sidecar", () => {
  const request = (choose = vi.fn()) => ({ options: [{ data: 'left', label: 'Left' }, { data: 'right', label: 'Right' }], selected: 'left', label: 'Position', anchor: null, choose })

  beforeEach(() => {
    inline = []
    onOpen = vi.fn()
    mount = document.createElement('div')
    document.body.appendChild(mount)
    root = createRoot(mount)
  })
  afterEach(async () => {
    vi.useRealTimers()
    await act(async () => root.unmount())
    mount.remove()
  })

  it('closes the sidecar, then opens over the Home a moment later', () => {
    vi.useFakeTimers()
    const close = vi.fn()
    const show = vi.fn()
    openSidecarList(request(), close, show)
    expect(close).toHaveBeenCalledTimes(1)
    expect(show).not.toHaveBeenCalled()
    vi.advanceTimersByTime(300)
    expect(show).toHaveBeenCalledTimes(1)
  })

  it('opens the sidecar again once the list closed with a pick and the panel shows', async () => {
    await render(false, vi.fn())
    vi.useFakeTimers()
    const choose = vi.fn()
    const show = vi.fn()
    openSidecarList(request(choose), vi.fn(), show)
    vi.advanceTimersByTime(300)
    const menu = show.mock.calls[0][0]
    menu.props.children[1].props.onSelected()
    expect(choose).toHaveBeenCalledWith({ data: 'right', label: 'Right' })
    vi.advanceTimersByTime(250)
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('does not open the sidecar again long after the list', async () => {
    await render(false, vi.fn())
    vi.useFakeTimers()
    const show = vi.fn()
    openSidecarList(request(), vi.fn(), show)
    vi.advanceTimersByTime(61_000)
    show.mock.calls[0][0].props.onCancel()
    vi.advanceTimersByTime(250)
    expect(onOpen).not.toHaveBeenCalled()
  })
})
