// @vitest-environment jsdom
import { act, createElement as h, Fragment, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  fallback: false,
  props: new Map<Element, any>(),
  takeFocus: vi.fn((_el: HTMLElement) => true),
}))

// Small doubles for the host adapter: plain elements that expose their handlers.
vi.mock('../../../runtime/host/decky', async () => {
  const { createElement: el, Fragment: Frag } = await import('react')
  const dataAttrs = (props: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith('data-')))
  function Focusable(props: any) {
    if (host.fallback) return props.children ?? null
    const keep = (node: HTMLElement | null) => {
      if (node) host.props.set(node, props)
      const { ref } = props
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    }
    return el('div', {
      ref: keep,
      className: props.className,
      style: props.style,
      'data-ok-text': props.onOKActionDescription,
      'data-cancel-text': props.onCancelActionDescription,
      ...dataAttrs(props),
    }, props.children)
  }
  function Field(props: any) {
    if (host.fallback) return el(Frag, null, props.label, props.children)
    return el('div', { className: 'test-field', 'data-focusable': String(props.focusable) },
      el('div', { className: 'test-field-label' }, props.label),
      el('div', { className: 'test-field-children' }, props.children))
  }
  return { Focusable, Field, GamepadButton: { OK: 1, CANCEL: 2, DIR_UP: 9, DIR_DOWN: 10, DIR_LEFT: 11, DIR_RIGHT: 12 } }
})
vi.mock('../../../runtime/navFocus', () => ({ takeNavTreeFocus: (el: HTMLElement) => host.takeFocus(el) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

import { GrabReorderList } from '../../../components/ui/GrabReorderList'
import { ReorderableShelfList } from '../../../components/qam/common/ReorderableShelfList'

type Item = { id: string; label: string }
type Shelfish = { id: string; title?: string; hidden?: boolean }
const ItemList = GrabReorderList<Item>
const ShelfList = ReorderableShelfList<Shelfish>

const OK = 1
const CANCEL = 2
const UP = 9
const DOWN = 10
const LEFT = 11
const RIGHT = 12

const win = document.defaultView as any
let root: Root
let mount: HTMLDivElement
let mounted = false
let frames: Map<number, FrameRequestCallback>
let nextFrame = 1
let savedRaf: unknown
let savedCaf: unknown

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host.fallback = false
  host.props.clear()
  host.takeFocus.mockReset()
  host.takeFocus.mockReturnValue(true)
  frames = new Map()
  nextFrame = 1
  savedRaf = win.requestAnimationFrame
  savedCaf = win.cancelAnimationFrame
  win.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => { const id = nextFrame++; frames.set(id, cb); return id })
  win.cancelAnimationFrame = vi.fn((id: number) => { frames.delete(id) })
  mount = document.createElement('div')
  document.body.append(mount)
  root = createRoot(mount)
  mounted = true
})

afterEach(() => {
  if (mounted) act(() => root.unmount())
  mounted = false
  win.requestAnimationFrame = savedRaf
  win.cancelAnimationFrame = savedCaf
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.body.replaceChildren()
})

const items = (...ids: string[]): Item[] => ids.map((id) => ({ id, label: `label-${id}` }))

function listProps(overrides: Partial<Parameters<typeof ItemList>[0]> & { items: Item[] }) {
  return {
    getId: (item: Item) => item.id,
    renderLabel: (item: Item): ReactNode => h('span', { className: 'test-label' }, item.label),
    renderActions: (item: Item): ReactNode => h('button', { className: 'test-action' }, `act-${item.id}`),
    onReorder: vi.fn<(ids: string[]) => void>(),
    ...overrides,
  }
}

function renderList(overrides: Partial<Parameters<typeof ItemList>[0]> & { items: Item[] }) {
  const props = listProps(overrides)
  act(() => root.render(h(ItemList, props)))
  return props
}

const rows = (scope: ParentNode = mount) => Array.from(scope.querySelectorAll<HTMLElement>('.ds-grab-row'))
const rowOf = (id: string, scope?: ParentNode) => rows(scope).find((row) => row.getAttribute('data-ds-grab-row') === id) as HTMLElement
const targetOf = (id: string, scope?: ParentNode) => rowOf(id, scope).querySelector<HTMLElement>('.ds-grab-target') as HTMLElement
const propsOf = (id: string, scope?: ParentNode) => host.props.get(targetOf(id, scope))
const domOrder = () => rows().map((row) => row.getAttribute('data-ds-grab-row'))
const orders = () => rows().map((row) => row.style.order)
const visualOrder = () =>
  rows().slice().sort((a, b) => Number(a.style.order) - Number(b.style.order)).map((row) => row.getAttribute('data-ds-grab-row'))
const grabbedIds = (scope?: ParentNode) =>
  rows(scope).filter((row) => row.getAttribute('data-ds-grabbed') === '1').map((row) => row.getAttribute('data-ds-grab-row'))
const frameRequests = () => (win.requestAnimationFrame as ReturnType<typeof vi.fn>).mock.calls.length

function pad(button: number, isRepeat?: boolean) {
  return {
    detail: {
      button,
      ...(isRepeat === undefined ? {} : { is_repeat: isRepeat }),
      event: { preventDefault: vi.fn(), stopPropagation: vi.fn() },
    },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  }
}
type Pad = ReturnType<typeof pad>
const spiesOf = (evt: Pad) => [evt.preventDefault, evt.stopPropagation, evt.stopImmediatePropagation, evt.detail.event.preventDefault, evt.detail.event.stopPropagation]
const absorbed = (evt: Pad) => spiesOf(evt).every((spy) => spy.mock.calls.length > 0)
const untouched = (evt: Pad) => spiesOf(evt).every((spy) => spy.mock.calls.length === 0)

function pressA(id: string, isRepeat?: boolean) {
  const evt = pad(OK, isRepeat)
  act(() => { propsOf(id).onOKButton(evt) })
  return evt
}

// Through the name area's generic callback; `handled` stays undefined when the list set none there.
function buttonDown(id: string, button: number, isRepeat?: boolean) {
  const evt = pad(button, isRepeat)
  let handled: unknown
  act(() => { handled = propsOf(id).onButtonDown?.(evt) })
  return { evt, handled }
}

function direction(id: string, button: number) {
  const evt = pad(button)
  let handled: unknown
  act(() => { handled = propsOf(id).onGamepadDirection?.(evt) })
  return { evt, handled }
}

function flushFrames() {
  act(() => {
    const pending = Array.from(frames.values())
    frames.clear()
    pending.forEach((cb) => cb(0))
  })
}

// The single focus request after a press: its element, and one scroll of that row to the nearest edge.
function expectFocusOn(id: string, scrolls: Array<{ el: Element; opts: unknown }>) {
  expect(host.takeFocus).toHaveBeenCalledTimes(1)
  expect(host.takeFocus.mock.calls[0][0]).toBe(targetOf(id))
  expect(scrolls).toHaveLength(1)
  expect(scrolls[0].el).toBe(rowOf(id))
  expect(scrolls[0].opts).toEqual({ block: 'nearest' })
}

function pointerListeners(spy: { mock: { calls: unknown[][] } }) {
  return spy.mock.calls.filter(([type]) => type === 'pointerdown')
}

describe('GrabReorderList — rendering and idle state', () => {
  it('renders one row per item in order, with the label in the name area, the actions and a Field that is not a focus stop', () => {
    renderList({ items: items('a', 'b', 'c') })
    expect(domOrder()).toEqual(['a', 'b', 'c'])
    for (const id of ['a', 'b', 'c']) {
      const row = rowOf(id)
      expect(targetOf(id).textContent).toBe(`label-${id}`)
      expect(row.querySelector('.test-field-children .test-action')?.textContent).toBe(`act-${id}`)
      expect(row.querySelector('.test-field')?.getAttribute('data-focusable')).toBe('false')
      expect(row.hasAttribute('data-ds-grabbed')).toBe(false)
    }
    expect(orders()).toEqual(['', '', ''])
    expect(['a', 'b', 'c'].map((id) => propsOf(id).actionDescriptionMap)).toEqual([undefined, undefined, undefined])
    const list = mount.querySelector<HTMLElement>('.ds-grab-list') as HTMLElement
    expect(list.style.display).toBe('flex')
    expect(list.style.flexDirection).toBe('column')
  })

  it('renders an empty root for no items, without listeners or frames', () => {
    const add = vi.spyOn(document, 'addEventListener')
    expect(() => renderList({ items: [] })).not.toThrow()
    expect(mount.querySelector('.ds-grab-list')).not.toBeNull()
    expect(rows()).toHaveLength(0)
    expect(pointerListeners(add)).toHaveLength(0)
    expect(frameRequests()).toBe(0)
  })

  it('shows the idle footer on a name area: A reads reorder_label and there is no B text', () => {
    renderList({ items: items('a', 'b') })
    expect(targetOf('a').getAttribute('data-ok-text')).toBe('reorder_label')
    expect(targetOf('a').hasAttribute('data-cancel-text')).toBe(false)
  })

  it('leaves B and the D-pad to Steam when idle, and a tap never grabs: nothing absorbed, nothing handled, nothing scheduled', () => {
    const add = vi.spyOn(document, 'addEventListener')
    renderList({ items: items('a', 'b') })
    for (const button of [CANCEL, UP, DOWN, LEFT, RIGHT]) {
      const down = buttonDown('a', button)
      expect(down.handled).toBeFalsy()
      expect(untouched(down.evt)).toBe(true)
      const dir = direction('a', button)
      expect(dir.handled).toBeFalsy()
      expect(untouched(dir.evt)).toBe(true)
    }
    expect(typeof propsOf('a').onActivate).toBe('function')
    act(() => { propsOf('a').onActivate(); targetOf('a').click() })
    expect(propsOf('a').onCancelButton).toBeUndefined()
    expect(grabbedIds()).toEqual([])
    expect(orders()).toEqual(['', ''])
    expect(pointerListeners(add)).toHaveLength(0)
    expect(frameRequests()).toBe(0)
  })
})

describe('GrabReorderList — grab, move, drop', () => {
  it('grabs the row on A: marks it, puts the D-pad texts in the footer, switches the A and B texts and saves nothing', () => {
    const { onReorder } = renderList({ items: items('a', 'b', 'c') })
    pressA('a')
    expect(rowOf('a').getAttribute('data-ds-grabbed')).toBe('1')
    expect(propsOf('a').actionDescriptionMap).toEqual({ [UP]: 'move_up', [DOWN]: 'move_down' })
    expect(propsOf('b').actionDescriptionMap).toBeUndefined()
    expect(mount.textContent).not.toContain('move_')
    expect(targetOf('a').getAttribute('data-ok-text')).toBe('reorder_save_order')
    expect(targetOf('a').getAttribute('data-cancel-text')).toBe('cancel')
    expect(orders()).toEqual(['0', '1', '2'])
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('moves with CSS order only and saves the full order once on drop', () => {
    const { onReorder } = renderList({ items: items('a', 'b', 'c', 'd') })
    pressA('a')
    expect(buttonDown('a', DOWN).handled).toBe(true)
    buttonDown('a', DOWN)
    expect(visualOrder()).toEqual(['b', 'c', 'a', 'd'])
    expect(domOrder()).toEqual(['a', 'b', 'c', 'd'])
    expect(orders()).toEqual(['2', '0', '1', '3'])
    expect(onReorder).not.toHaveBeenCalled()
    pressA('a')
    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a', 'd'])
    expect(grabbedIds()).toEqual([])
    expect(propsOf('a').actionDescriptionMap).toBeUndefined()
    expect(orders()).toEqual(['', '', '', ''])
    expect(targetOf('a').getAttribute('data-ok-text')).toBe('reorder_label')
  })

  it('acts on the latest state when presses arrive before React re-renders', () => {
    const { onReorder } = renderList({ items: items('a', 'b', 'c', 'd') })
    pressA('a')
    act(() => {
      const handlers = propsOf('a')
      handlers.onButtonDown(pad(DOWN))
      handlers.onButtonDown(pad(DOWN))
    })
    expect(visualOrder()).toEqual(['b', 'c', 'a', 'd'])
    expect(frames.size).toBe(1)
    pressA('a')
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a', 'd'])
  })

  it('does not save when the row never moved or came back to its place', () => {
    const { onReorder } = renderList({ items: items('a', 'b', 'c') })
    pressA('b')
    pressA('b')
    expect(grabbedIds()).toEqual([])
    pressA('b')
    buttonDown('b', DOWN)
    buttonDown('b', UP)
    pressA('b')
    expect(grabbedIds()).toEqual([])
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('stops at the ends without wrapping and still asks for focus on the row', () => {
    const { onReorder } = renderList({ items: items('a', 'b', 'c') })
    pressA('a')
    expect(buttonDown('a', UP).handled).toBe(true)
    expect(orders()).toEqual(['0', '1', '2'])
    flushFrames()
    expect(host.takeFocus).toHaveBeenCalledTimes(1)
    expect(host.takeFocus.mock.calls[0][0]).toBe(targetOf('a'))
    pressA('a')
    flushFrames()
    host.takeFocus.mockClear()
    pressA('c')
    expect(buttonDown('c', DOWN).handled).toBe(true)
    expect(orders()).toEqual(['0', '1', '2'])
    flushFrames()
    expect(host.takeFocus).toHaveBeenCalledTimes(1)
    expect(host.takeFocus.mock.calls[0][0]).toBe(targetOf('c'))
    pressA('c')
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('handles a single item: grab and drop work, the D-pad moves nothing, nothing is saved', () => {
    const { onReorder } = renderList({ items: items('only') })
    pressA('only')
    expect(grabbedIds()).toEqual(['only'])
    buttonDown('only', DOWN)
    buttonDown('only', UP)
    expect(orders()).toEqual(['0'])
    pressA('only')
    expect(grabbedIds()).toEqual([])
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('ends the grab before calling onReorder, so a throwing save leaves no row grabbed', () => {
    const onReorder = vi.fn(() => { throw new Error('save failed') })
    renderList({ items: items('a', 'b'), onReorder })
    pressA('a')
    buttonDown('a', DOWN)
    let error: unknown
    act(() => {
      try { propsOf('a').onOKButton(pad(OK)) } catch (e) { error = e }
    })
    expect((error as Error).message).toBe('save failed')
    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(grabbedIds()).toEqual([])
    expect(orders()).toEqual(['', ''])
  })
})

describe('GrabReorderList — cancel and other buttons', () => {
  it('cancels on B: the row goes back, nothing is saved, the press is absorbed and reported handled', () => {
    const { onReorder } = renderList({ items: items('a', 'b', 'c') })
    pressA('a')
    buttonDown('a', DOWN)
    const mirror = propsOf('a').onCancelButton
    expect(typeof mirror).toBe('function')
    const { evt, handled } = buttonDown('a', CANCEL)
    expect(handled).toBe(true)
    expect(absorbed(evt)).toBe(true)
    expect(onReorder).not.toHaveBeenCalled()
    expect(orders()).toEqual(['', '', ''])
    expect(grabbedIds()).toEqual([])
    expect(propsOf('a').onCancelButton).toBeUndefined()
    expect(targetOf('a').hasAttribute('data-cancel-text')).toBe(false)
    const requests = frameRequests()
    const late = pad(CANCEL)
    act(() => { mirror(late) })
    expect(untouched(late)).toBe(true)
    expect(frameRequests()).toBe(requests)
    expect(grabbedIds()).toEqual([])
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('also cancels through the onCancelButton mirror while the row is grabbed', () => {
    const { onReorder } = renderList({ items: items('a', 'b', 'c') })
    pressA('b')
    buttonDown('b', UP)
    act(() => { propsOf('b').onCancelButton(pad(CANCEL)) })
    expect(grabbedIds()).toEqual([])
    expect(orders()).toEqual(['', '', ''])
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('absorbs left and right while grabbed and moves nothing', () => {
    renderList({ items: items('a', 'b', 'c') })
    pressA('b')
    for (const button of [LEFT, RIGHT]) {
      const down = buttonDown('b', button)
      expect(down.handled).toBe(true)
      expect(absorbed(down.evt)).toBe(true)
      const dir = direction('b', button)
      expect(dir.handled).toBe(true)
      expect(absorbed(dir.evt)).toBe(true)
    }
    expect(orders()).toEqual(['0', '1', '2'])
    const dirDown = direction('b', DOWN)
    expect(absorbed(dirDown.evt)).toBe(true)
    expect(orders()).toEqual(['0', '1', '2'])
    expect(grabbedIds()).toEqual(['b'])
  })

  it('leaves every other button to Steam while grabbed', () => {
    renderList({ items: items('a', 'b') })
    pressA('a')
    for (const button of [OK, 3, 4, 5, 6, 7, 8, 13, 14]) {
      const { evt, handled } = buttonDown('a', button)
      expect(handled).toBe(false)
      expect(untouched(evt)).toBe(true)
    }
    expect(grabbedIds()).toEqual(['a'])
  })

  it('ignores A and B repeats, but a repeated D-pad press moves the row', () => {
    const { onReorder } = renderList({ items: items('a', 'b', 'c') })
    pressA('a', true)
    expect(grabbedIds()).toEqual([])
    pressA('a')
    pressA('a', true)
    expect(grabbedIds()).toEqual(['a'])
    const repeatB = buttonDown('a', CANCEL, true)
    expect(repeatB.handled).toBeFalsy()
    expect(untouched(repeatB.evt)).toBe(true)
    act(() => { propsOf('a').onCancelButton(pad(CANCEL, true)) })
    expect(grabbedIds()).toEqual(['a'])
    expect(buttonDown('a', DOWN, true).handled).toBe(true)
    expect(visualOrder()).toEqual(['b', 'a', 'c'])
    expect(onReorder).not.toHaveBeenCalled()
    pressA('a', false)
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c'])
  })
})

describe('GrabReorderList — focus after a press', () => {
  let saved: PropertyDescriptor | undefined
  let scrolls: Array<{ el: Element; opts: unknown }>

  beforeEach(() => {
    scrolls = []
    saved = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: function (this: Element, opts: unknown) { scrolls.push({ el: this, opts }) },
    })
  })

  afterEach(() => {
    if (saved) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', saved)
    else delete (HTMLElement.prototype as any).scrollIntoView
  })

  it('puts focus back on the name area one frame after each D-pad press, then scrolls the row to the nearest edge', () => {
    renderList({ items: items('a', 'b', 'c') })
    pressA('a')
    expect(frameRequests()).toBe(0)
    buttonDown('a', DOWN)
    expect(host.takeFocus).not.toHaveBeenCalled()
    expect(frames.size).toBe(1)
    flushFrames()
    expectFocusOn('a', scrolls)
  })

  it("falls back to the element's own focus when the nav tree refuses", () => {
    renderList({ items: items('a', 'b') })
    pressA('a')
    host.takeFocus.mockReturnValue(false)
    const focus = vi.spyOn(targetOf('a'), 'focus')
    buttonDown('a', DOWN)
    flushFrames()
    expect(host.takeFocus).toHaveBeenCalledTimes(1)
    expect(host.takeFocus.mock.calls[0][0]).toBe(targetOf('a'))
    expect(focus).toHaveBeenCalledTimes(1)
  })

  it('also asks for focus after a drop and after a cancel with B, once each', () => {
    renderList({ items: items('a', 'b', 'c') })
    pressA('a')
    buttonDown('a', DOWN)
    flushFrames()
    host.takeFocus.mockClear()
    scrolls.length = 0
    pressA('a')
    flushFrames()
    expectFocusOn('a', scrolls)
    pressA('c')
    buttonDown('c', UP)
    flushFrames()
    host.takeFocus.mockClear()
    scrolls.length = 0
    buttonDown('c', CANCEL)
    flushFrames()
    expectFocusOn('c', scrolls)
  })

  it('keeps focus on the dropped row when the caller applies the new order in the same update', () => {
    const saved = vi.fn<(ids: string[]) => void>()
    function Controlled() {
      const [list, setList] = useState(() => items('a', 'b', 'c'))
      const onReorder = (ids: string[]) => {
        saved(ids)
        setList(ids.map((id) => list.find((item) => item.id === id) as Item))
      }
      return h(ItemList, listProps({ items: list, onReorder }))
    }
    act(() => root.render(h(Controlled)))
    pressA('a')
    buttonDown('a', DOWN)
    flushFrames()
    host.takeFocus.mockClear()
    const el = targetOf('a')
    pressA('a')
    expect(saved).toHaveBeenCalledTimes(1)
    expect(domOrder()).toEqual(['b', 'a', 'c'])
    expect(orders()).toEqual(['', '', ''])
    expect(grabbedIds()).toEqual([])
    expect(frames.size).toBe(1)
    flushFrames()
    expect(host.takeFocus).toHaveBeenCalledTimes(1)
    expect(host.takeFocus.mock.calls[0][0]).toBe(el)
    expect(targetOf('a')).toBe(el)
    pressA('a')
    buttonDown('a', UP)
    pressA('a')
    expect(saved).toHaveBeenCalledTimes(2)
    expect(saved).toHaveBeenLastCalledWith(['a', 'b', 'c'])
    expect(domOrder()).toEqual(['a', 'b', 'c'])
  })

  it('takes focus back on the dropped row when the caller applies the new order a render later', () => {
    let apply = () => undefined as void
    function Deferred() {
      const [list, setList] = useState(() => items('a', 'b', 'c'))
      const onReorder = (ids: string[]) => {
        apply = () => setList(ids.map((id) => list.find((item) => item.id === id) as Item))
      }
      return h(ItemList, listProps({ items: list, onReorder }))
    }
    act(() => root.render(h(Deferred)))
    pressA('a')
    buttonDown('a', DOWN)
    pressA('a')
    flushFrames()
    host.takeFocus.mockClear()
    const el = targetOf('a')
    act(() => apply())
    expect(domOrder()).toEqual(['b', 'a', 'c'])
    expect(frames.size).toBe(1)
    flushFrames()
    expect(host.takeFocus).toHaveBeenCalledTimes(1)
    expect(host.takeFocus.mock.calls[0][0]).toBe(el)
  })

  it('leaves the focus alone when some other order arrives after a drop', () => {
    let replace = () => undefined as void
    function Other() {
      const [list, setList] = useState(() => items('a', 'b', 'c'))
      replace = () => setList([list[2], list[0], list[1]])
      return h(ItemList, listProps({ items: list, onReorder: () => undefined }))
    }
    act(() => root.render(h(Other)))
    pressA('a')
    buttonDown('a', DOWN)
    pressA('a')
    flushFrames()
    host.takeFocus.mockClear()
    act(() => replace())
    expect(domOrder()).toEqual(['c', 'a', 'b'])
    expect(frames.size).toBe(0)
    expect(host.takeFocus).not.toHaveBeenCalled()
  })

  it('keeps at most one frame pending: a newer press replaces it', () => {
    renderList({ items: items('a', 'b', 'c') })
    pressA('c')
    buttonDown('c', UP)
    buttonDown('c', UP)
    expect(frames.size).toBe(1)
    expect(win.cancelAnimationFrame).toHaveBeenCalledTimes(1)
    flushFrames()
    expect(host.takeFocus).toHaveBeenCalledTimes(1)
  })

  it('does not throw without scrollIntoView', () => {
    delete (HTMLElement.prototype as any).scrollIntoView
    renderList({ items: items('a', 'b') })
    pressA('a')
    buttonDown('a', DOWN)
    expect(() => flushFrames()).not.toThrow()
    expect(host.takeFocus).toHaveBeenCalledTimes(1)
  })
})

describe('GrabReorderList — other endings', () => {
  it('ends the grab on any pointer press in the document without saving or asking for focus, and drops its listener after every ending', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    const { onReorder } = renderList({ items: items('a', 'b', 'c') })
    expect(pointerListeners(add)).toHaveLength(0)
    pressA('a')
    expect(pointerListeners(add)).toHaveLength(1)
    const [, listener, capture] = pointerListeners(add)[0]
    expect(capture).toBe(true)
    buttonDown('a', DOWN)
    expect(frames.size).toBe(1)
    act(() => { document.dispatchEvent(new Event('pointerdown')) })
    expect(grabbedIds()).toEqual([])
    expect(orders()).toEqual(['', '', ''])
    expect(onReorder).not.toHaveBeenCalled()
    expect(frames.size).toBe(0)
    flushFrames()
    expect(host.takeFocus).not.toHaveBeenCalled()
    expect(pointerListeners(remove)).toEqual([['pointerdown', listener, true]])
    pressA('a')
    pressA('a')
    expect(pointerListeners(remove)).toEqual(pointerListeners(add))
    pressA('a')
    buttonDown('a', CANCEL)
    expect(grabbedIds()).toEqual([])
    expect(pointerListeners(remove)).toEqual(pointerListeners(add))
    expect(pointerListeners(add).map(([, , useCapture]) => useCapture)).toEqual([true, true, true])
  })

  it('still ends the grab when another handler stops the press', () => {
    renderList({ items: items('a', 'b') })
    pressA('a')
    rowOf('b').addEventListener('pointerdown', (e) => e.stopPropagation())
    act(() => { rowOf('b').dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    expect(grabbedIds()).toEqual([])
  })

  it('keeps the grab when items keep the same ids in the same order, and shows the new labels', () => {
    const props = renderList({ items: items('a', 'b', 'c') })
    pressA('a')
    buttonDown('a', DOWN)
    const renamed = [{ id: 'a', label: 'A2' }, { id: 'b', label: 'B2' }, { id: 'c', label: 'C2' }]
    act(() => root.render(h(ItemList, { ...props, items: renamed })))
    expect(grabbedIds()).toEqual(['a'])
    expect(targetOf('a').textContent).toBe('A2')
    expect(visualOrder()).toEqual(['b', 'a', 'c'])
    act(() => root.render(h(ItemList, { ...props, items: renamed, renderLabel: (item: Item) => h('span', null, `new-${item.id}`) })))
    expect(rows().map((row) => row.querySelector('.ds-grab-target')?.textContent)).toEqual(['new-a', 'new-b', 'new-c'])
    expect(grabbedIds()).toEqual(['a'])
    expect(props.onReorder).not.toHaveBeenCalled()
  })

  it('cancels the grab when another path changes the order, without saving or asking for focus', () => {
    const list = items('a', 'b', 'c')
    const props = renderList({ items: list })
    pressA('a')
    buttonDown('a', DOWN)
    expect(frames.size).toBe(1)
    act(() => root.render(h(ItemList, { ...props, items: [list[1], list[0], list[2]] })))
    expect(grabbedIds()).toEqual([])
    expect(domOrder()).toEqual(['b', 'a', 'c'])
    expect(orders()).toEqual(['', '', ''])
    expect(frames.size).toBe(0)
    flushFrames()
    expect(host.takeFocus).not.toHaveBeenCalled()
    act(() => root.render(h(ItemList, { ...props, items: list })))
    expect(grabbedIds()).toEqual([])
    expect(props.onReorder).not.toHaveBeenCalled()
  })

  it('cancels the grab when an id is removed, or the grabbed item itself', () => {
    const list = items('a', 'b', 'c')
    const props = renderList({ items: list })
    pressA('a')
    act(() => root.render(h(ItemList, { ...props, items: [list[0], list[1]] })))
    expect(grabbedIds()).toEqual([])
    expect(domOrder()).toEqual(['a', 'b'])
    pressA('b')
    act(() => root.render(h(ItemList, { ...props, items: [list[0]] })))
    expect(grabbedIds()).toEqual([])
    expect(domOrder()).toEqual(['a'])
    expect(orders()).toEqual([''])
    expect(props.onReorder).not.toHaveBeenCalled()
    expect(frameRequests()).toBe(0)
  })

  it('treats a stale grab like idle on other rows, and A on another name moves the grab there', () => {
    const { onReorder } = renderList({ items: items('a', 'b', 'c') })
    pressA('a')
    buttonDown('a', DOWN)
    expect(targetOf('c').getAttribute('data-ok-text')).toBe('reorder_label')
    expect(targetOf('c').hasAttribute('data-cancel-text')).toBe(false)
    expect(propsOf('c').onCancelButton).toBeUndefined()
    for (const button of [CANCEL, UP, DOWN, LEFT, RIGHT]) {
      const down = buttonDown('c', button)
      expect(down.handled).toBeFalsy()
      expect(untouched(down.evt)).toBe(true)
      const dir = direction('c', button)
      expect(dir.handled).toBeFalsy()
      expect(untouched(dir.evt)).toBe(true)
    }
    expect(visualOrder()).toEqual(['b', 'a', 'c'])
    pressA('c')
    expect(grabbedIds()).toEqual(['c'])
    expect(orders()).toEqual(['0', '1', '2'])
    expect(frames.size).toBe(0)
    expect(onReorder).not.toHaveBeenCalled()
  })

  it('unmounts during a grab with a frame pending: no save, no throw, frame cancelled, listener removed', () => {
    const remove = vi.spyOn(document, 'removeEventListener')
    const { onReorder } = renderList({ items: items('a', 'b') })
    pressA('a')
    buttonDown('a', DOWN)
    const [pending] = Array.from(frames.keys())
    const staleOk = propsOf('a').onOKButton
    expect(() => { act(() => root.unmount()); mounted = false }).not.toThrow()
    expect(onReorder).not.toHaveBeenCalled()
    expect(win.cancelAnimationFrame).toHaveBeenCalledWith(pending)
    expect(frames.size).toBe(0)
    expect(pointerListeners(remove)).toHaveLength(1)
    expect(() => staleOk(pad(OK))).not.toThrow()
    expect(onReorder).not.toHaveBeenCalled()
  })
})

describe('GrabReorderList — cost, robustness and independence', () => {
  it('re-renders only the rows whose position changed on a D-pad press', () => {
    const renderLabel = vi.fn((item: Item): ReactNode => h('span', null, item.label))
    const renderActions = vi.fn((item: Item): ReactNode => h('button', null, `act-${item.id}`))
    renderList({ items: items('a', 'b', 'c', 'd'), renderLabel, renderActions })
    pressA('a')
    renderLabel.mockClear()
    renderActions.mockClear()
    buttonDown('a', DOWN)
    expect(renderLabel.mock.calls.map(([item]) => item.id).sort()).toEqual(['a', 'b'])
    expect(renderActions.mock.calls.map(([item]) => item.id).sort()).toEqual(['a', 'b'])
    renderLabel.mockClear()
    buttonDown('a', LEFT)
    expect(renderLabel).not.toHaveBeenCalled()
  })

  it('renders under the host fallbacks without crashing', () => {
    host.fallback = true
    expect(() => renderList({ items: items('a', 'b') })).not.toThrow()
    expect(rows()).toHaveLength(2)
    expect(rows().map((row) => row.textContent)).toEqual(['label-aact-a', 'label-bact-b'])
    expect(mount.querySelector('.ds-grab-target')).toBeNull()
  })

  it('survives duplicate ids: render, grab, a D-pad press and A throw nothing', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const dupes = [{ id: 'x', label: 'one' }, { id: 'x', label: 'two' }, { id: 'y', label: 'three' }]
    expect(() => renderList({ items: dupes })).not.toThrow()
    expect(rows()).toHaveLength(3)
    const handlersAt = (index: number) => host.props.get(rows()[index].querySelector('.ds-grab-target') as Element)
    expect(() => {
      act(() => { handlersAt(0).onOKButton(pad(OK)) })
      const grabbed = rows().findIndex((row) => row.getAttribute('data-ds-grabbed') === '1')
      act(() => { handlersAt(grabbed).onButtonDown(pad(DOWN)) })
      act(() => { handlersAt(grabbed).onOKButton(pad(OK)) })
    }).not.toThrow()
  })

  it('keeps two lists independent', () => {
    const first = listProps({ items: items('a1', 'a2') })
    const second = listProps({ items: items('b1', 'b2') })
    act(() => root.render(h(Fragment, null, h(ItemList, first), h(ItemList, second))))
    pressA('a1')
    expect(grabbedIds()).toEqual(['a1'])
    expect(rowOf('b1').hasAttribute('data-ds-grabbed')).toBe(false)
    expect(rowOf('b2').hasAttribute('data-ds-grabbed')).toBe(false)
    pressA('b2')
    expect(grabbedIds()).toEqual(['a1', 'b2'])
    buttonDown('b2', CANCEL)
    expect(grabbedIds()).toEqual(['a1'])
    buttonDown('a1', DOWN)
    pressA('a1')
    expect(first.onReorder).toHaveBeenCalledTimes(1)
    expect(first.onReorder).toHaveBeenCalledWith(['a2', 'a1'])
    expect(second.onReorder).not.toHaveBeenCalled()
  })

  it("uses the list's own document and window, never the globals, for its listener and frames", () => {
    const iframe = document.createElement('iframe')
    document.body.append(iframe)
    const idoc = iframe.contentDocument as Document
    const iwin = iframe.contentWindow as any
    iwin.requestAnimationFrame = vi.fn(() => 7)
    iwin.cancelAnimationFrame = vi.fn()
    const add = vi.spyOn(document, 'addEventListener')
    const iadd = vi.spyOn(idoc, 'addEventListener')
    const box = idoc.body.appendChild(idoc.createElement('div'))
    const r = createRoot(box)
    act(() => r.render(h(ItemList, listProps({ items: items('a', 'b') }))))
    act(() => { propsOf('a', box).onOKButton(pad(OK)) })
    expect(grabbedIds(box)).toEqual(['a'])
    expect(pointerListeners(iadd)).toHaveLength(1)
    expect(pointerListeners(iadd)[0][2]).toBe(true)
    expect(pointerListeners(add)).toHaveLength(0)
    act(() => { propsOf('a', box).onButtonDown(pad(DOWN)) })
    expect(iwin.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(frameRequests()).toBe(0)
    act(() => { document.dispatchEvent(new Event('pointerdown')) })
    expect(grabbedIds(box)).toEqual(['a'])
    act(() => { idoc.dispatchEvent(new iwin.Event('pointerdown')) })
    expect(grabbedIds(box)).toEqual([])
    expect(iwin.cancelAnimationFrame).toHaveBeenCalledWith(7)
    expect(win.cancelAnimationFrame).not.toHaveBeenCalled()
    act(() => r.unmount())
  })
})

describe('ReorderableShelfList on the grab list', () => {
  const shelves: Shelfish[] = [{ id: 's1', title: 'One' }, { id: 's2', title: 'Two' }, { id: 's3', title: 'Three', hidden: true }]

  it('shows the empty text and no list when there are no items', () => {
    act(() => root.render(h(ShelfList, { items: [], emptyText: 'Nothing here', renderActions: () => null, onReorder: vi.fn() })))
    expect(mount.querySelector('.deck-shelves-shelf-list .deck-shelves-empty')?.textContent).toBe('Nothing here')
    expect(mount.querySelector('.ds-grab-list')).toBeNull()
  })

  it('puts the marked label in each name area inside the shelf list container and saves a drop once', () => {
    const onReorder = vi.fn()
    act(() => root.render(h(ShelfList, { items: shelves, emptyText: 'Nothing here', renderActions: (s: Shelfish) => h('button', null, `menu-${s.id}`), onReorder })))
    expect(mount.querySelector('.deck-shelves-shelf-list .ds-grab-list')).not.toBeNull()
    expect(mount.querySelector('.deck-shelves-empty')).toBeNull()
    for (const shelf of shelves) {
      const marked = targetOf(shelf.id).querySelector('[data-ds-shelf-row]')
      expect(marked?.getAttribute('data-ds-shelf-row')).toBe(shelf.id)
      expect(marked?.textContent).toContain(shelf.title)
      expect(rowOf(shelf.id).textContent).toContain(`menu-${shelf.id}`)
    }
    pressA('s1')
    buttonDown('s1', DOWN)
    pressA('s1')
    expect(onReorder).toHaveBeenCalledTimes(1)
    expect(onReorder).toHaveBeenCalledWith(['s2', 's1', 's3'])
  })

  it("wraps the caller's own label in the marked element", () => {
    act(() => root.render(h(ShelfList, {
      items: shelves,
      emptyText: '',
      renderActions: () => null,
      onReorder: vi.fn(),
      renderLabel: (s: Shelfish) => h('em', null, `custom-${s.id}`),
    })))
    const marked = targetOf('s2').querySelector('[data-ds-shelf-row]')
    expect(marked?.getAttribute('data-ds-shelf-row')).toBe('s2')
    expect(marked?.querySelector('em')?.textContent).toBe('custom-s2')
  })
})
