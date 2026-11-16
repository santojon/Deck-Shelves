// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { findPanelMenuManager } from '../../../components/qam/qamMenuManager'

type FakeFiber = { memoizedState: unknown; child: FakeFiber | null; sibling: FakeFiber | null; return: FakeFiber | null }

const hooks = (...values: unknown[]) => values.reduceRight<unknown>((next, memoizedState) => ({ memoizedState, next }), null)
const fiber = (state: unknown = null): FakeFiber => ({ memoizedState: state, child: null, sibling: null, return: null })

function makeManager() {
  const menu = { Show: vi.fn(), Hide: vi.fn() }
  const manager = { m_ActiveMenu: null, m_callbacksMenusChanged: {}, CreateContextMenuInstance: vi.fn(() => menu) }
  return { menu, manager }
}

// A control inside the panel: its fiber climbs to the panel's host, whose subtree keeps the manager in a ref.
function controlInPanel(manager: unknown, where: 'below' | 'beside' = 'below') {
  const host = fiber(hooks({ m_browserView: {}, m_viewWindow: {} }))
  const provider = fiber(hooks({ current: manager }))
  const content = fiber()
  const control = fiber()
  host.child = content
  content.return = host
  content.child = control
  control.return = content
  if (where === 'below') { content.sibling = provider; provider.return = host } else { host.sibling = provider }
  const el = document.createElement('button')
  Object.assign(el, { __reactFiber$test: control })
  return el
}

describe('the Quick Access panel menu manager', () => {
  it('is found below the panel host of a control inside the panel', () => {
    const { manager } = makeManager()
    expect(findPanelMenuManager(controlInPanel(manager))).toBe(manager)
  })

  it('is not taken from outside the panel host', () => {
    const { manager } = makeManager()
    expect(findPanelMenuManager(controlInPanel(manager, 'beside'))).toBeNull()
  })

  it('is not found for an element outside any panel', () => {
    const el = document.createElement('div')
    Object.assign(el, { __reactFiber$test: fiber() })
    expect(findPanelMenuManager(el)).toBeNull()
    expect(findPanelMenuManager(null)).toBeNull()
  })
})
