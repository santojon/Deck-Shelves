// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { reuseHeroLabel, isHeroLabelOutputMutation } from '../../components/shelf/perShelfHeroLabel'

afterEach(() => { document.body.replaceChildren() })

function label(text: string): HTMLElement {
  const node = document.createElement('div')
  node.className = 'ds-card-label'
  const title = document.createElement('span')
  title.textContent = text
  node.append(title)
  return node
}

describe('hero label synchronization', () => {
  it('clones initially and keeps the same node for equal labels, including a different source element', () => {
    const source = label('Game')
    const cloned = reuseHeroLabel(null, source)!
    expect(cloned).not.toBe(source)
    expect(cloned.isEqualNode(source)).toBe(true)
    expect(reuseHeroLabel(cloned, source)).toBe(cloned)
    expect(reuseHeroLabel(cloned, label('Game'))).toBe(cloned)
  })

  it('updates asynchronously resolved text and nested status classes without changing appid', () => {
    const source = label('#123')
    const first = reuseHeroLabel(null, source)!
    source.firstChild!.textContent = 'Resolved game title'
    const second = reuseHeroLabel(first, source)!
    expect(second).not.toBe(first)
    expect(second.textContent).toBe('Resolved game title')
    source.firstElementChild!.className = 'download-complete'
    const third = reuseHeroLabel(second, source)!
    expect(third).not.toBe(second)
    expect(third.firstElementChild!.className).toBe('download-complete')
  })

  it('clears the clone when a non-game card has no label', () => {
    expect(reuseHeroLabel(label('Previous game'), null)).toBeNull()
    expect(reuseHeroLabel(null, null)).toBeNull()
  })

  it('filters real overlay mutations but preserves source changes in the same observer delivery', () => {
    const shelf = document.createElement('div')
    const source = label('Game')
    const host = document.createElement('div')
    host.className = 'ds-promoted-hero-label'
    const clone = reuseHeroLabel(null, source)!
    host.append(clone)
    shelf.append(source, host)
    document.body.append(shelf)
    const observer = new MutationObserver(() => {})
    observer.observe(shelf, { subtree: true, childList: true, attributes: true, characterData: true })
    host.replaceChildren(clone)
    clone.firstElementChild!.firstChild!.textContent = 'Output mutation'
    host.classList.add('visible')
    const output = observer.takeRecords()
    expect(output.length).toBeGreaterThan(0)
    expect(output.every(isHeroLabelOutputMutation)).toBe(true)
    source.firstElementChild!.firstChild!.textContent = 'New title'
    source.classList.add('status-updated')
    const input = observer.takeRecords()
    expect(input.length).toBeGreaterThan(0)
    expect(input.every(record => !isHeroLabelOutputMutation(record))).toBe(true)
    expect([...output, ...input].some(record => !isHeroLabelOutputMutation(record))).toBe(true)
    observer.disconnect()
  })
})
