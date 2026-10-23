// @vitest-environment jsdom
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useContainerDragReorder } from '../../core/reorder'

const ITEM_WIDTH = 100

function Harness({ order, onReorder }: { order: string[]; onReorder: (next: string[]) => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  useContainerDragReorder<string>({
    containerRef: ref,
    itemSelector: '[data-id]',
    getItemId: (el) => el.getAttribute('data-id'),
    getOrder: () => order,
    onReorder,
  })
  return createElement('div', { ref }, order.map((id) => createElement('div', { key: id, 'data-id': id })))
}

let root: Root
let mount: HTMLDivElement

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const idx = Array.from(this.parentElement?.children ?? []).indexOf(this)
    const left = idx * ITEM_WIDTH
    return { left, right: left + ITEM_WIDTH - 1, top: 0, bottom: 50, x: left, y: 0, width: ITEM_WIDTH - 1, height: 50, toJSON() {} } as DOMRect
  })
  mount = document.createElement('div')
  document.body.appendChild(mount)
  root = createRoot(mount)
})

afterEach(async () => {
  await act(async () => root.unmount())
  mount.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function pointer(type: string, target: EventTarget, clientX: number) {
  const ev = new MouseEvent(type, { bubbles: true, clientX, clientY: 10 })
  Object.defineProperty(ev, 'pointerType', { value: 'touch' })
  target.dispatchEvent(ev)
}

async function drag(id: string, toIdx: number) {
  const el = mount.querySelector(`[data-id="${id}"]`) as HTMLElement
  await act(async () => { pointer('pointerdown', el, el.getBoundingClientRect().left + 10) })
  await act(async () => { vi.advanceTimersByTime(300) })
  await act(async () => { pointer('pointermove', document, toIdx * ITEM_WIDTH + 10) })
  await act(async () => { pointer('pointerup', document, toIdx * ITEM_WIDTH + 10) })
}

describe('useContainerDragReorder pointer drag', () => {
  it('a second drag starts from the order passed after the first drop', async () => {
    const first = vi.fn()
    await act(async () => { root.render(createElement(Harness, { order: ['a', 'b', 'c'], onReorder: first })) })

    await drag('c', 0)
    expect(first).toHaveBeenLastCalledWith(['c', 'a', 'b'])

    const second = vi.fn()
    await act(async () => { root.render(createElement(Harness, { order: ['c', 'a', 'b'], onReorder: second })) })

    await drag('b', 1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenLastCalledWith(['c', 'b', 'a'])
    expect(first).toHaveBeenCalledTimes(1)
  })

  it('with the same callback, the second drop builds on the first instead of undoing it', async () => {
    const onReorder = vi.fn()
    await act(async () => { root.render(createElement(Harness, { order: ['a', 'b', 'c'], onReorder })) })

    await drag('c', 0)
    await act(async () => { root.render(createElement(Harness, { order: ['c', 'a', 'b'], onReorder })) })

    await drag('a', 2)
    expect(onReorder.mock.calls).toEqual([[['c', 'a', 'b']], [['c', 'b', 'a']]])
  })
})
