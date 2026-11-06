// @vitest-environment jsdom
import { act, createElement as h, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  const { createElement: el } = await import('react')
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    Focusable: ({ className, onClick, children, ...rest }: any) =>
      el('div', { className, onClick, 'data-ds-section': rest['data-ds-section'] }, children),
  }
})

import { CollapsibleSection } from '../../../components/ui/CollapsibleSection'
import { DeckModalStyles } from '../../../components/styles/DeckModalStyles'
import { DeckQAMStyles } from '../../../components/styles/DeckQAMStyles'

let root: Root
let mount: HTMLDivElement
let storage: { getItem: (key: string) => string | null; setItem: ReturnType<typeof vi.fn> }

function show(element: ReactElement) {
  act(() => root.render(element))
}

function remount(element: ReactElement) {
  act(() => root.unmount())
  root = createRoot(mount)
  show(element)
}

const header = () => mount.querySelector('.ds-collapsible-header') as HTMLElement
const isOpen = () => mount.querySelector('.ds-collapsible-content') !== null
const stored = () => JSON.parse(storage.getItem('ds-qam-sections') ?? '{}')

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const data = new Map<string, string>()
  storage = { getItem: (key) => data.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { data.set(key, value) }) }
  vi.stubGlobal('localStorage', storage)
  mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  act(() => root.unmount())
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('collapsible section', () => {
  it('keeps the open state under its id across mounts', () => {
    const section = h(CollapsibleSection, { id: 'tools', title: 'Tools', count: 0, children: 'body' })
    show(section)
    expect(isOpen()).toBe(false)
    act(() => header().click())
    expect(isOpen()).toBe(true)
    expect(stored()).toEqual({ tools: true })
    expect(header().getAttribute('data-ds-section')).toBe('tools')
    remount(section)
    expect(isOpen()).toBe(true)
  })

  it('without an id keeps the state in memory only', () => {
    const section = h(CollapsibleSection, { title: 'Conditions', count: 3, initialOpen: false, children: 'body' })
    show(section)
    expect(isOpen()).toBe(false)
    act(() => header().click())
    expect(isOpen()).toBe(true)
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(header().hasAttribute('data-ds-section')).toBe(false)
    remount(section)
    expect(isOpen()).toBe(false)
  })

  it('shows its status at the end of the header, open or closed', () => {
    show(h(CollapsibleSection, { title: 'Conditions', count: 0, status: h('i', { className: 'mark' }), children: 'body' }))
    const end = () => header().lastElementChild as HTMLElement
    expect(end().querySelector('.mark')).not.toBeNull()
    act(() => header().click())
    expect(isOpen()).toBe(true)
    expect(end().querySelector('.mark')).not.toBeNull()
  })

  it('without an id still opens by its count when no state is given', () => {
    show(h(CollapsibleSection, { title: 'Conditions', count: 2, children: 'body' }))
    expect(isOpen()).toBe(true)
  })
})

describe('collapsible section styles', () => {
  it('reach the dialogs, with a ring on the focused header row', () => {
    const css = renderToStaticMarkup(h(DeckModalStyles))
    expect(css).toContain('.deck-shelves-dialog .ds-collapsible-box')
    expect(css).toContain('.deck-shelves-dialog .ds-collapsible-header')
    expect(css).toMatch(/\.deck-shelves-dialog \.ds-collapsible-row:is\(\.gpfocuswithin, :focus-within\) \{[^}]*box-shadow: inset 0 0 0 2px/)
  })

  it('stay scoped to the QAM and the settings page in their own sheet', () => {
    const css = renderToStaticMarkup(h(DeckQAMStyles))
    const selectors = css.split('\n').filter((line) => line.includes('.ds-collapsible-'))
    expect(selectors.length).toBeGreaterThan(0)
    for (const line of selectors) expect(line.trim()).toMatch(/^\.deck-shelves-(qam-panel|settings-page) \.ds-collapsible-/)
  })
})
