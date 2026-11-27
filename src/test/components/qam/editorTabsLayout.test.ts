// @vitest-environment jsdom
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const seen = vi.hoisted(() => ({ buttonDown: [] as Array<(evt: any) => void> }))

vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  const { createElement: el } = await import('react')
  const original = await importOriginal<Record<string, any>>()
  return {
    ...original,
    GamepadButton: { ...original.GamepadButton, BUMPER_LEFT: 105, BUMPER_RIGHT: 106 },
    ConfirmModal: ({ children }: any) => el('div', { 'data-dialog': '1' }, children),
    Focusable: ({ children, onButtonDown, onMenuButton: _menu, onMenuActionDescription: _desc, onOKButton: _ok, onActivate: _act, noFocusRing: _ring, focusWithinClassName: _fw, ...rest }: any) => {
      if (onButtonDown) seen.buttonDown.push(onButtonDown)
      return el('div', { tabIndex: -1, ...rest }, children)
    },
  }
})

import i18n, { initI18n } from '../../../i18n'
import { EditorTabs } from '../../../components/qam/modals/editShelf/EditorTabs'
import { EditShelfFrame } from '../../../components/qam/modals/editShelf/EditShelfFrame'
import { FieldContainer } from '../../../components/ui/FieldContainer'
import { CreateShelfModal } from '../../../components/qam/modals/CreateShelfModal'

let root: Root

const TABS = [
  { id: 'one', title: 'One', content: h('p', null, 'first panel') },
  { id: 'two', title: 'Two', content: h('p', null, 'second panel') },
  { id: 'three', title: 'Three', content: h('p', null, 'third panel') },
]

function render(element: ReturnType<typeof h>) {
  seen.buttonDown.length = 0
  act(() => root.render(element))
}

function sizedOrScrolling(): string[] {
  const found: string[] = []
  for (const node of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
    const s = node.style
    if (!s) continue
    for (const prop of ['height', 'maxHeight', 'overflow', 'overflowY'] as const) {
      if (s[prop]) found.push(`${node.tagName.toLowerCase()} ${prop}: ${s[prop]}`)
    }
  }
  return found
}

function Switcher({ initial = 'one' }: { initial?: string }) {
  const [active, setActive] = useState(initial)
  return h(EditorTabs, { tabs: TABS, activeTab: active, onShowTab: setActive })
}

beforeAll(() => {
  initI18n()
})

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

const strip = () => Array.from(document.querySelectorAll<HTMLElement>('[role="tab"]'))
const panel = () => document.querySelector('[role="tabpanel"]')?.textContent
const press = (button: number) => act(() => { for (const fn of seen.buttonDown) fn({ detail: { button } }) })

describe('the editor tabs', () => {
  it('show one entry per tab and only the open tab, in the page flow', () => {
    render(h(Switcher))
    expect(strip().map((x) => x.textContent)).toEqual(['One', 'Two', 'Three'])
    expect(strip().map((x) => x.getAttribute('data-active'))).toEqual(['1', '0', '0'])
    expect(panel()).toBe('first panel')
    expect(sizedOrScrolling()).toEqual([])
  })

  it('open the first tab when the asked one is not there', () => {
    render(h(EditorTabs, { tabs: TABS, activeTab: 'gone', onShowTab: () => {} }))
    expect(panel()).toBe('first panel')
    expect(strip()[0].getAttribute('aria-selected')).toBe('true')
  })

  it('switch with a press on an entry', () => {
    render(h(Switcher))
    act(() => strip()[2].click())
    expect(panel()).toBe('third panel')
  })

  it('switch with L1 and R1, stop at the ends, and move the focus to the new entry', () => {
    render(h(Switcher, { initial: 'two' }))
    press(106)
    expect(panel()).toBe('third panel')
    expect(document.activeElement).toBe(strip()[2])
    press(106)
    expect(panel()).toBe('third panel')
    press(105)
    press(105)
    press(105)
    expect(panel()).toBe('first panel')
    press(1)
    expect(panel()).toBe('first panel')
  })
})

describe('the editor dialogs', () => {
  const t = i18n.t.bind(i18n)

  it('give the frame no height, scroll box or clip of its own', () => {
    render(h(EditShelfFrame, {
      t, heading: 'Editing', title: 'Shelf', onTitleChange: () => {}, previewCount: 3, onSave: () => {},
      tabs: h(EditorTabs, { tabs: TABS, activeTab: 'one', onShowTab: () => {} }),
      preview: h('div', { 'data-preview': '1' }),
    }))
    expect(document.querySelector('[data-dialog] [role="tabpanel"]')).not.toBeNull()
    expect(document.querySelector('[data-dialog] [data-preview]')).not.toBeNull()
    expect(sizedOrScrolling()).toEqual([])
  })

  it('give the field column no height or scroll box', () => {
    render(h(FieldContainer, null, h('p', null, 'row')))
    expect(sizedOrScrolling()).toEqual([])
  })

  it('give the new-shelf dialog no height or scroll box', () => {
    const controller: any = { t, actions: { createDraftShelf: () => ({ id: 'd', title: '', source: { type: 'tab', tab: 'all' } }) }, settings: {} }
    render(h(CreateShelfModal, { controller }))
    expect(strip().length).toBe(2)
    expect(sizedOrScrolling()).toEqual([])
  })
})
