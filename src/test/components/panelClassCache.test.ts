// @vitest-environment jsdom
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const KEY = 'ds_qam_panel_classes'
const FALLBACKS = ['_10BxjeNEe7t7ZWYcnl3-J6', 'JAewWdUpiV3X2NTJykahD', '_321l150NTQBTsPZ9NnzZIz']

async function modalCss(): Promise<string> {
  const { DeckModalStyles } = await import('../../components/styles/DeckModalStyles')
  return renderToStaticMarkup(h(DeckModalStyles))
}

function editorFieldRules(css: string): string[] {
  return css.split('\n').filter((line) => line.includes('.deck-shelves-editor-fields .')).map((line) => line.trim())
}

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

afterEach(() => {
  vi.doUnmock('../../runtime/host/decky')
  vi.resetModules()
  localStorage.clear()
})

describe('shelf editor panel classes', () => {
  it('fall back to the shipped classes when the saved ones are just their own names', async () => {
    localStorage.setItem(KEY, JSON.stringify({
      PanelSection: 'PanelSection', PanelSectionRow: 'PanelSectionRow', PanelSectionTitle: 'PanelSectionTitle',
    }))
    const rules = editorFieldRules(await modalCss()).join('\n')
    for (const cls of FALLBACKS) expect(rules).toContain(`.${cls}`)
    expect(rules).not.toMatch(/\.PanelSection(Row|Title)?\b/)
  })

  it('use the classes the Quick Access menu saved', async () => {
    localStorage.setItem(KEY, JSON.stringify({ PanelSection: '_sec', PanelSectionRow: '_row', PanelSectionTitle: '_title' }))
    const rules = editorFieldRules(await modalCss()).join('\n')
    expect(rules).toContain('.deck-shelves-editor-fields ._sec {')
    expect(rules).toContain('.deck-shelves-editor-fields ._row {')
    expect(rules).toContain('.deck-shelves-editor-fields ._title {')
    for (const cls of FALLBACKS) expect(rules).not.toContain(cls)
  })

  it('use the shipped classes when nothing was saved', async () => {
    const rules = editorFieldRules(await modalCss()).join('\n')
    for (const cls of FALLBACKS) expect(rules).toContain(`.${cls}`)
  })
})

describe('Quick Access panel classes', () => {
  it('are not saved when the host has no real class group', async () => {
    await import('../../components/styles/DeckQAMStyles')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('are saved when the host has the real class group', async () => {
    vi.doMock('../../runtime/host/decky', async (importOriginal) => ({
      ...(await importOriginal<Record<string, unknown>>()),
      quickAccessControlsClasses: { PanelSection: '_sec', PanelSectionRow: '_row', PanelSectionTitle: '_title' },
    }))
    await import('../../components/styles/DeckQAMStyles')
    expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual({
      PanelSection: '_sec', PanelSectionRow: '_row', PanelSectionTitle: '_title',
    })
  })
})
