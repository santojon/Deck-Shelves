import { useCallback, useEffect, useState, useSyncExternalStore, type ReactElement } from 'react'
import { Menu, MenuItem, showContextMenu } from '../../../runtime/host/decky'
import { ListOpenerContext, type ListRequest } from '../../ui/PanelDropdown'
import type { SettingsController } from '../../../features/settings/controller'
import { findPanelMenuManager, type PanelMenu, type PanelMenuManager } from '../qamMenuManager'
import { SidecarPanel, focusedInSidecar, rememberSidecarFocus } from './SidecarPanel'

// The menu's element is created once, so the panel's latest controller reaches it through here.
let latest: SettingsController | null = null
const listeners = new Set<() => void>()

function publishController(next: SettingsController): void {
  if (next === latest) return
  latest = next
  listeners.forEach((l) => l())
}

function subscribeController(l: () => void): () => void {
  listeners.add(l)
  return () => { listeners.delete(l) }
}

const currentController = (): SettingsController | null => latest

// A dropdown's list from inside the sidecar opens over the Home: the sidecar closes first, so the panel
// steps aside for the list, and opens again on that dropdown once the panel is back.
const LIST_DELAY_MS = 250
const REOPEN_DELAY_MS = 200
const REOPEN_WINDOW_MS = 60_000
let reopenSince: number | null = null
let onListClosed: (() => void) | null = null

const reopenPending = (): boolean => reopenSince !== null && Date.now() - reopenSince < REOPEN_WINDOW_MS

function listMenu(request: ListRequest, done: () => void): ReactElement {
  return (
    <Menu label={request.label ?? ''} onCancel={done}>
      {request.options.map((option, i) => (
        <MenuItem key={i} onSelected={() => { request.choose(option); done() }}>
          {option.label}{option.data === request.selected ? ' ✓' : ''}
        </MenuItem>
      ))}
    </Menu>
  )
}

export function openSidecarList(request: ListRequest, close: () => void, show: (menu: ReactElement) => void = (menu) => showContextMenu(menu, undefined)): void {
  const body = (request.anchor?.closest('.ds-sidecar-body') ?? null) as HTMLElement | null
  rememberSidecarFocus(body, focusedInSidecar(body) ?? request.anchor)
  reopenSince = Date.now()
  close()
  setTimeout(() => show(listMenu(request, () => onListClosed?.())), LIST_DELAY_MS)
}

// The wrapper carries the panel's class so the panel's own rules reach the sidecar's rows.
function SidecarMenuContent({ scope, onCollapse }: { scope: HTMLElement; onCollapse: () => void }) {
  const controller = useSyncExternalStore(subscribeController, currentController)
  const openList = useCallback((request: ListRequest) => openSidecarList(request, onCollapse), [onCollapse])
  if (!controller) return null
  return (
    <ListOpenerContext.Provider value={openList}>
      <div className='deck-shelves-qam-panel' data-ds-sidecar-menu='1'>
        <SidecarPanel controller={controller} onCollapse={onCollapse} scope={scope} />
      </div>
    </ListOpenerContext.Provider>
  )
}

// Once the list closed and the panel shows again, the sidecar opens again on the dropdown.
function useReopenAfterList(scopeRef: { current: HTMLElement | null }, onOpen: () => void): void {
  useEffect(() => {
    const doc = scopeRef.current?.ownerDocument
    if (!doc) return
    let timer: ReturnType<typeof setTimeout> | null = null
    const tryReopen = () => {
      if (!reopenPending() || doc.visibilityState !== 'visible') return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        if (!reopenPending()) return
        reopenSince = null
        onOpen()
      }, REOPEN_DELAY_MS)
    }
    onListClosed = tryReopen
    doc.addEventListener('visibilitychange', tryReopen)
    return () => {
      doc.removeEventListener('visibilitychange', tryReopen)
      if (onListClosed === tryReopen) onListClosed = null
      if (timer) clearTimeout(timer)
    }
  }, [scopeRef, onOpen])
}

// A list opened from inside the sidecar takes the manager's one menu slot: the manager first drops the
// sidecar's menu, then shows the list. So a drop waits a moment before it counts as a close; under a
// list the sidecar waits and shows again, on the control that opened it, once the list closes.
const LIST_GRACE_MS = 150
// On the panel's document while such a list is open, so Steam's backdrop behind it stays clear.
const LIST_MARK = 'data-ds-sidecar-list'

function followMenus(manager: PanelMenuManager, menu: PanelMenu, anchor: HTMLElement, onCollapse: () => void): { onChange: () => void; dispose: () => void } {
  let covered = false
  let pending: ReturnType<typeof setTimeout> | null = null
  const setCovered = (on: boolean) => {
    covered = on
    const root = anchor.ownerDocument.documentElement
    if (on) root.setAttribute(LIST_MARK, '1')
    else root.removeAttribute(LIST_MARK)
  }
  const settle = () => {
    pending = null
    const active = manager.ActiveMenu
    if (active === menu) return
    if (active) setCovered(true)
    else onCollapse()
  }
  const onChange = () => {
    const active = manager.ActiveMenu
    if (active === menu) return
    if (covered) {
      if (!active) { setCovered(false); menu.Show() }
      return
    }
    if (!pending) {
      const body = anchor.ownerDocument.querySelector('[data-ds-sidecar-menu] .ds-sidecar-body') as HTMLElement | null
      rememberSidecarFocus(body, focusedInSidecar(body))
    }
    if (active) {
      if (pending) { clearTimeout(pending); pending = null }
      setCovered(true)
      return
    }
    if (!pending) pending = setTimeout(settle, LIST_GRACE_MS)
  }
  return { onChange, dispose: () => { if (pending) clearTimeout(pending); if (covered) setCovered(false) } }
}

// An open sidecar is a menu of the panel's own manager: the client widens the panel while it is open
// and its controls join the menu's navigation. Returns whether the caller still draws it inline.
export function useSidecarMenu({ scopeRef, open, controller, onCollapse, onOpen }: {
  scopeRef: { current: HTMLElement | null }
  open: boolean
  controller: SettingsController
  onCollapse: () => void
  onOpen: () => void
}): boolean {
  const [manager, setManager] = useState<PanelMenuManager | null>(null)
  useReopenAfterList(scopeRef, onOpen)
  useEffect(() => { publishController(controller) }, [controller])
  useEffect(() => { setManager(findPanelMenuManager(scopeRef.current)) }, [scopeRef])
  useEffect(() => {
    const anchor = scopeRef.current
    if (!open || !manager || !anchor) return
    const fresh = findPanelMenuManager(anchor)
    if (fresh !== manager) { setManager(fresh); return }
    const menu = manager.CreateContextMenuInstance(<SidecarMenuContent scope={anchor} onCollapse={onCollapse} />, anchor, undefined, undefined, {})
    menu.Show()
    const follow = followMenus(manager, menu, anchor, onCollapse)
    const reg = manager.OnMenusChanged?.Register?.(follow.onChange)
    return () => {
      try { reg?.Unregister?.() } catch {}
      follow.dispose()
      if (!reopenPending()) rememberSidecarFocus(null, null)
      if (manager.ActiveMenu === menu) menu.Hide()
    }
  }, [open, manager, scopeRef, onCollapse])
  return open && !manager
}
