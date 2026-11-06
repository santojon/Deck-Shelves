// @vitest-environment jsdom
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilterGroup, FilterItem } from '../../../types'

const host = vi.hoisted(() => ({ focused: [] as HTMLElement[] }))

// Plain elements for the client components; buttons expose their A hint.
vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  const { createElement: el } = await import('react')
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    DialogButton: ({ onClick, onOKActionDescription, children, ...rest }: any) =>
      el('button', { 'aria-label': rest['aria-label'], 'data-hint': onOKActionDescription, onClick }, children),
    Focusable: ({ className, onClick, children }: any) => el('div', { className, onClick }, children),
    Field: ({ label, children }: any) => el('div', { 'data-field': label }, children),
    DropdownItem: ({ label, rgOptions, onChange }: any) => el('div', { 'data-picker': label },
      rgOptions.map((option: any) => el('span', { key: option.data, 'data-option': option.data, onClick: () => onChange(option) }, option.label))),
    TextField: ({ value }: any) => el('input', { value, readOnly: true }),
  }
})
vi.mock('../../../runtime/navFocus', () => ({ takeNavTreeFocus: (el: HTMLElement) => { host.focused.push(el); return true } }))

import { initI18n } from '../../../i18n'
import { ConditionEditor } from '../../../components/conditions/ConditionEditor'
import { describeCondition } from '../../../components/conditions/ConditionRow'
import { offeredTypes } from '../../../components/conditions/ConditionTypePicker'

const win = document.defaultView as any
let root: Root
let mount: HTMLDivElement
let frames: FrameRequestCallback[]
let savedRaf: unknown
let latest: FilterGroup
let replaceGroup: (group: FilterGroup) => void

function Harness({ initial, ...props }: { initial: FilterGroup; hideMode?: boolean; onlineFeaturesOn?: boolean }) {
  const [group, setGroup] = useState(initial)
  latest = group
  replaceGroup = setGroup
  return h(ConditionEditor, { group, onChange: setGroup, ...props })
}

const cond = (type: FilterItem['type'], params: Record<string, unknown> = {}): FilterItem => ({ type, params })

function show(items: FilterItem[], props: { hideMode?: boolean; onlineFeaturesOn?: boolean } = {}) {
  act(() => root.render(h(Harness, { initial: { mode: 'and', items }, ...props })))
}

function flushFrames() {
  act(() => { frames.splice(0).forEach((cb) => cb(0)) })
}

function click(target: Element) {
  act(() => (target as HTMLElement).click())
  flushFrames()
}

const buttons = (scope: ParentNode = mount) => Array.from(scope.querySelectorAll<HTMLButtonElement>('button'))
const button = (text: string, scope: ParentNode = mount) => buttons(scope).find((b) => b.textContent === text) as HTMLButtonElement
const labelled = (label: string, scope: ParentNode = mount) => scope.querySelector(`[aria-label="${label}"]`) as HTMLElement
const headers = () => Array.from(mount.querySelectorAll<HTMLElement>('.ds-collapsible-header'))
const boxOf = (header: HTMLElement) => header.closest('.ds-collapsible-box') as HTMLElement
const isOpen = (header: HTMLElement) => boxOf(header).querySelector(':scope > .ds-collapsible-content') !== null
const title = (header: HTMLElement) => header.firstElementChild?.textContent
const mark = (header: HTMLElement) => header.querySelector('[role="img"]')?.getAttribute('aria-label')
const option = (type: string) => mount.querySelector(`[data-option="${type}"]`) as HTMLElement

function removeAt(index: number) {
  const header = headers()[index]
  click(header)
  click(labelled('Remove', boxOf(header)))
}

beforeAll(() => { initI18n() })

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host.focused.length = 0
  frames = []
  savedRaf = win.requestAnimationFrame
  win.requestAnimationFrame = (cb: FrameRequestCallback) => frames.push(cb)
  mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
})

afterEach(() => {
  act(() => root.unmount())
  win.requestAnimationFrame = savedRaf
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('condition editor', () => {
  it('adds an installed condition, open, with the focus on it', () => {
    show([])
    click(labelled('Add condition'))
    expect(latest.items).toEqual([{ type: 'installed', params: {} }])
    const [header] = headers()
    expect(title(header)).toBe('Installed')
    expect(isOpen(header)).toBe(true)
    expect(host.focused.at(-1)).toBe(header)
  })

  it('names its icon buttons for the footer hints', () => {
    show([cond('installed')])
    click(headers()[0])
    for (const label of ['Add condition', 'Negate', 'Remove']) {
      expect(labelled(label).dataset.hint).toBe(label)
      expect(labelled(label).querySelector('svg')).not.toBeNull()
    }
  })

  it('keeps each condition open or closed when another one goes', () => {
    show([cond('installed'), cond('favorites'), cond('nonSteam')])
    click(headers()[2])
    removeAt(0)
    expect(latest.items.map((item) => item.type)).toEqual(['favorites', 'nonSteam'])
    expect(headers().map(isOpen)).toEqual([false, true])
  })

  it('after a removal focuses the condition above, below, then add', () => {
    show([cond('installed'), cond('favorites'), cond('nonSteam')])
    removeAt(1)
    expect(host.focused.at(-1)).toBe(headers()[0])
    expect(title(headers()[0])).toBe('Installed')
    removeAt(0)
    expect(host.focused.at(-1)).toBe(headers()[0])
    expect(title(headers()[0])).toBe('Non-Steam')
    removeAt(0)
    expect(host.focused.at(-1)).toBe(labelled('Add condition'))
  })

  it('negates a condition and shows it while closed', () => {
    show([cond('installed')])
    click(headers()[0])
    click(labelled('Negate'))
    expect(latest.items[0]).toEqual({ type: 'installed', params: {}, inverted: true })
    expect(labelled('Stop negating').dataset.hint).toBe('Stop negating')
    click(headers()[0])
    expect(title(headers()[0])).toBe('Not: Installed')
  })

  it('a new type starts from its own options and keeps the negation', () => {
    show([{ type: 'nameIncludes', inverted: true, params: { text: 'zelda' } }])
    expect(title(headers()[0])).toBe('Not: Name contains · zelda')
    click(headers()[0])
    click(option('favorites'))
    expect(latest.items[0]).toEqual({ type: 'favorites', inverted: true, params: {} })
  })

  it('a condition holding others only changes to another grouping type', () => {
    const inner = cond('installed')
    show([{ type: 'merge', params: { mode: 'or', items: [inner] } }])
    click(headers()[0])
    const offered = Array.from(mount.querySelector('[data-picker]')!.querySelectorAll('[data-option]'), (o) => o.getAttribute('data-option'))
    expect(offered.sort()).toEqual(['exclusionGroup', 'merge', 'priorityFilter', 'weightedFilter'])
    expect(mount.textContent).toContain('Remove the conditions inside to pick another type.')
    click(option('exclusionGroup'))
    expect(latest.items[0]).toEqual({ type: 'exclusionGroup', params: { children: [inner] } })
  })

  it('adds inside a nested group and leaves the outer list alone', () => {
    show([{ type: 'merge', params: { mode: 'and', items: [] } }, cond('installed')])
    click(headers()[0])
    click(labelled('Add condition', boxOf(headers()[0])))
    expect(latest.items).toHaveLength(2)
    expect(latest.items[0].params?.items).toEqual([{ type: 'installed', params: {} }])
    expect(isOpen(headers()[0])).toBe(true)
    expect(host.focused.at(-1)).toBe(headers()[1])
  })

  it('marks each condition complete or incomplete beside its arrow', () => {
    show([cond('nameIncludes', { text: '' }), cond('installed')])
    expect(mark(headers()[0])).toBe('Incomplete')
    expect(mark(headers()[1])).toBe('Complete')
    const end = () => headers()[0].lastElementChild as HTMLElement
    expect(end().querySelector('[role="img"] svg')).not.toBeNull()
    expect(end().textContent).toBe('▼')
    click(headers()[0])
    expect(end().querySelector('[role="img"] svg')).not.toBeNull()
    expect(end().textContent).toBe('▲')
  })

  it('picking the current type again changes nothing', () => {
    const item = cond('nameIncludes', { text: 'zelda' })
    show([item])
    click(headers()[0])
    click(option('nameIncludes'))
    expect(latest.items[0]).toBe(item)
  })

  it('a group applied from outside starts closed and keeps the focus', () => {
    show([])
    click(labelled('Add condition'))
    host.focused.length = 0
    act(() => replaceGroup({ mode: 'or', items: [cond('favorites'), cond('nonSteam')] }))
    flushFrames()
    expect(headers().map(isOpen)).toEqual([false, false])
    expect(host.focused).toEqual([])
  })

  it('keeps the open state of conditions out of storage', () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() }
    vi.stubGlobal('localStorage', storage)
    show([cond('installed')])
    click(headers()[0])
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(headers()[0].hasAttribute('data-ds-section')).toBe(false)
  })

  it('switches between all and any', () => {
    show([cond('installed')])
    click(button('Any must match (OR)'))
    expect(latest.mode).toBe('or')
  })

  it('has no all/any choice when the rule comes from elsewhere', () => {
    show([cond('installed')], { hideMode: true })
    expect(button('All must match (AND)')).toBeUndefined()
    expect(button('Any must match (OR)')).toBeUndefined()
  })

  it('marks the online types in the type list', () => {
    show([cond('installed')], { onlineFeaturesOn: true })
    click(headers()[0])
    expect(option('genres').querySelector('svg')).not.toBeNull()
    expect(option('installed').querySelector('svg')).toBeNull()
  })
})

describe('type choices', () => {
  const offline = { allowOnlineFilters: false, onlineFeaturesOn: false }

  it('follow both online gates', () => {
    const local = offeredTypes('installed', offline).map((c) => c.type)
    expect(local).not.toContain('discount')
    expect(local).not.toContain('genres')
    const online = offeredTypes('installed', { allowOnlineFilters: true, onlineFeaturesOn: true }).map((c) => c.type)
    expect(online).toEqual(expect.arrayContaining(['discount', 'priceRange', 'genres', 'reviewScore']))
  })

  it('come sorted by name in the interface language', () => {
    const names = offeredTypes('installed', offline, 'en-US').map((c) => c.name)
    expect(names).toEqual([...names].sort(new Intl.Collator('en-US').compare))
  })

  it('keep a stored type that is not on offer', () => {
    expect(offeredTypes('genres', offline).map((c) => c.type)).toContain('genres')
    expect(offeredTypes('isNew', offline).map((c) => c.type)).toContain('isNew')
  })
})

describe('condition summary', () => {
  it('shows the value of text, list and collection conditions', () => {
    expect(describeCondition(cond('developer', { developers: ['Valve', 'Nintendo'] }))).toBe('Developer · Valve, Nintendo')
    expect(describeCondition(cond('collection', { collectionId: 'c1' }), [{ id: 'c1', name: 'RPGs' }])).toBe('Collection · RPGs')
    expect(describeCondition(cond('playedWithinDays', { days: 30 }))).toBe('Played within')
  })
})
