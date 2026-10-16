// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { PerShelfHero } from '../../components/shelf/PerShelfHero'

vi.mock('../../runtime/sessionState', () => ({
  getSessionState: () => ({ gameRunning: false }),
  subscribeSessionState: () => () => {},
}))

let root: Root
let shelf: HTMLDivElement
let card: HTMLDivElement
let source: HTMLDivElement
let containerRef: { current: HTMLDivElement }

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(performance.now()), 16))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  shelf = document.createElement('div')
  card = document.createElement('div')
  card.className = 'ds-card gpfocus'
  card.dataset.appid = '123'
  source = document.createElement('div')
  source.className = 'ds-card-label'
  source.textContent = '#123'
  card.append(source)
  const row = document.createElement('div')
  row.className = 'ds-row-scroll'
  row.append(card)
  const mount = document.createElement('div')
  shelf.append(row, mount)
  document.body.append(shelf)
  containerRef = { current: shelf }
  root = createRoot(mount)
})

afterEach(async () => {
  await act(async () => root.unmount())
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

async function render(infoAbove = true) {
  await act(async () => {
    root.render(createElement(PerShelfHero, { containerRef, showArt: false, infoAbove, isFirstShelf: false, forceLayoutAsRecents: false }))
  })
}

async function frames(count = 4) {
  for (let i = 0; i < count; i++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(16) })
  }
}

const displayed = () => shelf.querySelector('.ds-promoted-hero-label > .ds-card-label')

describe('PerShelfHero label observer', () => {
  it('settles after mounting and updates a late title once without replacing unchanged output', async () => {
    await render()
    await frames()
    const first = displayed()
    expect(first?.textContent).toBe('#123')
    await frames(8)
    expect(displayed()).toBe(first)
    await act(async () => { source.firstChild!.textContent = 'Resolved title' })
    await frames()
    const second = displayed()
    expect(second?.textContent).toBe('Resolved title')
    expect(second).not.toBe(first)
    await frames(8)
    expect(displayed()).toBe(second)
  })

  it('restores the same label after the option is toggled off and on', async () => {
    await render()
    await frames()
    await render(false)
    expect(displayed()).toBeNull()
    await render(true)
    await frames()
    expect(displayed()?.textContent).toBe('#123')
  })

  it('changes games, clears non-game labels, and stops observing on unmount', async () => {
    await render()
    await frames()
    const next = card.cloneNode(true) as HTMLElement
    next.dataset.appid = '456'
    next.querySelector('.ds-card-label')!.textContent = 'Second game'
    await act(async () => {
      card.classList.remove('gpfocus')
      card.parentElement!.append(next)
      next.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    await frames()
    expect(displayed()?.textContent).toBe('Second game')
    await act(async () => {
      next.removeAttribute('data-appid')
      next.replaceChildren()
      next.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    })
    await frames()
    expect(displayed()).toBeNull()
    await act(async () => root.render(null))
    const raf = vi.fn()
    vi.stubGlobal('requestAnimationFrame', raf)
    card.classList.add('gpfocus')
    source.textContent = 'Changed after unmount'
    await frames()
    expect(raf).not.toHaveBeenCalled()
  })
})
