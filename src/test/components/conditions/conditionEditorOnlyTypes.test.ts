// @vitest-environment jsdom
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FilterGroup } from '../../../types'

vi.mock('../../../runtime/host/decky', async (importOriginal) => {
  const { createElement: el } = await import('react')
  return {
    ...(await importOriginal<Record<string, unknown>>()),
    DialogButton: ({ onClick, children, ...rest }: any) => el('button', { 'aria-label': rest['aria-label'], onClick }, children),
    Focusable: ({ className, onClick, children }: any) => el('div', { className, onClick }, children),
    Field: ({ label, children }: any) => el('div', { 'data-field': label }, children),
    DropdownItem: ({ label, rgOptions }: any) => el('div', { 'data-picker': label },
      rgOptions.map((option: any) => el('span', { key: option.data, 'data-option': option.data }, option.label))),
    TextField: ({ value }: any) => el('input', { value, readOnly: true }),
  }
})
vi.mock('../../../runtime/navFocus', () => ({ takeNavTreeFocus: () => true }))

import i18n, { initI18n } from '../../../i18n'
import { ConditionEditor } from '../../../components/conditions/ConditionEditor'
import { POST_FILTER_TYPES } from '../../../steam/compositePostFilter'

const win = document.defaultView as any
let root: Root
let mount: HTMLDivElement
let savedRaf: unknown
let latest: FilterGroup

function Harness({ initial }: { initial: FilterGroup }) {
  const [group, setGroup] = useState(initial)
  latest = group
  return h(ConditionEditor, { group, onChange: setGroup, allowOnlineFilters: true, onlineFeaturesOn: true, onlyTypes: POST_FILTER_TYPES })
}

const offered = () => Array.from(mount.querySelectorAll<HTMLElement>(`[data-picker="${i18n.t('filter_condition_type')}"] [data-option]`)).map((o) => o.dataset.option)

beforeAll(() => { initI18n() })

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  savedRaf = win.requestAnimationFrame
  win.requestAnimationFrame = () => 0
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

describe('a condition list limited to some types', () => {
  it('adds its first type and offers only the listed ones', () => {
    act(() => root.render(h(Harness, { initial: { mode: 'and', items: [] } })))
    act(() => (mount.querySelector('[aria-label="Add condition"]') as HTMLElement).click())
    expect(latest.items.map((item) => item.type)).toEqual([POST_FILTER_TYPES[0]])
    expect(offered().sort()).toEqual([...POST_FILTER_TYPES].sort())
  })
})
