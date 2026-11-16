import type { ReactElement } from 'react'

// Steam's Quick Access panel keeps its own menu manager, unregistered with its window, so Steam's lookup
// by window lands on the main window and the panel hides while the menu is open. Through the panel's
// own manager the menu stays inside, and the client widens the panel while it is open.

export type PanelMenu = { Show: () => void; Hide: () => void }

type Registration = { Unregister?: () => void }

export type PanelMenuManager = {
  ActiveMenu?: unknown
  OnMenusChanged?: { Register?: (fn: () => void) => Registration | undefined }
  CreateContextMenuInstance: (content: ReactElement, anchor: Element, x?: number, y?: number, options?: object) => PanelMenu
}

type Fiber = { return?: Fiber | null; child?: Fiber | null; sibling?: Fiber | null; memoizedState?: unknown }

const SEARCH_UP = 150
const SEARCH_NODES = 4000
const HOOKS_PER_FIBER = 40

function isMenuManager(v: unknown): v is PanelMenuManager {
  if (!v || typeof v !== 'object') return false
  const m = v as Record<string, unknown>
  return 'm_ActiveMenu' in m && 'm_callbacksMenusChanged' in m && typeof m.CreateContextMenuInstance === 'function'
}

function fiberOf(el: Element): Fiber | null {
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
  return key ? ((el as unknown as Record<string, Fiber | undefined>)[key] ?? null) : null
}

function hookValues(f: Fiber): unknown[] {
  const out: unknown[] = []
  let h = f.memoizedState as { memoizedState?: unknown; next?: unknown } | null | undefined
  while (h && typeof h === 'object' && 'next' in h && out.length < HOOKS_PER_FIBER) {
    out.push(h.memoizedState)
    h = h.next as typeof h
  }
  return out
}

function managerInHooks(f: Fiber): PanelMenuManager | null {
  for (const v of hookValues(f)) {
    if (isMenuManager(v)) return v
    const ref = v as { current?: unknown } | null
    if (ref && typeof ref === 'object' && isMenuManager(ref.current)) return ref.current
  }
  return null
}

// The panel's host holds its browser view and the view's window; above it is the main window's tree.
function isPanelHost(f: Fiber): boolean {
  return hookValues(f).some((v) => !!v && typeof v === 'object' && 'm_browserView' in v && 'm_viewWindow' in v)
}

function panelHostOf(el: Element): Fiber | null {
  let f = fiberOf(el)
  for (let depth = 0; f && depth < SEARCH_UP; depth++) {
    if (isPanelHost(f)) return f
    f = f.return ?? null
  }
  return null
}

function managerBelow(host: Fiber): PanelMenuManager | null {
  const stack: Fiber[] = [host]
  for (let seen = 0; stack.length && seen < SEARCH_NODES; seen++) {
    const f = stack.pop() as Fiber
    const m = managerInHooks(f)
    if (m) return m
    if (f.sibling && f !== host) stack.push(f.sibling)
    if (f.child) stack.push(f.child)
  }
  return null
}

export function findPanelMenuManager(el: Element | null | undefined): PanelMenuManager | null {
  if (!el) return null
  try {
    const host = panelHostOf(el)
    return host ? managerBelow(host) : null
  } catch {
    return null
  }
}
