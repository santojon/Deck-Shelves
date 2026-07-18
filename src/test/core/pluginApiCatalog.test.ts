import { describe, it, expect } from 'vitest'
import { makeApi } from '../../core/pluginApi'
import { TRIGGER_KINDS } from '../../domain/triggerCatalog'
import { SHELF_TEMPLATES, ONLINE_SHELF_TEMPLATES } from '../../domain/templates'
import { DEFAULT_BINDINGS } from '../../runtime/buttonBindings'

describe('public API built-in catalogues', () => {
  it('listTriggerCatalog exposes every trigger kind with a category', () => {
    const cat = makeApi().listTriggerCatalog()
    expect(cat.length).toBe(TRIGGER_KINDS.length)
    for (const k of TRIGGER_KINDS) {
      const entry = cat.find((c) => c.kind === k)
      expect(entry, `missing ${k}`).toBeTruthy()
      expect(entry!.categoryTitleKey).toMatch(/^visibility_cat_/)
    }
    expect(cat.find((c) => c.kind === 'charging')?.invertible).toBe(true)
    const tw = cat.find((c) => c.kind === 'timeWindow')
    expect(tw?.invertible).toBe(false)
    expect(tw?.defaults).toEqual({ start: 9, end: 17 })
  })

  it('trigger kinds are unique', () => {
    expect(new Set(TRIGGER_KINDS).size).toBe(TRIGGER_KINDS.length)
  })

  it('listShelfTemplates exposes built-in + online templates', () => {
    const tpls = makeApi().listShelfTemplates()
    expect(tpls.length).toBe(SHELF_TEMPLATES.length + ONLINE_SHELF_TEMPLATES.length)
    for (const t of tpls) {
      expect(t.titleKey).toMatch(/^template_/)
      expect(t.source).toBeTruthy()
    }
    expect(tpls.filter((t) => t.requiresOnline).length).toBe(ONLINE_SHELF_TEMPLATES.length)
  })

  it('listShortcuts exposes every binding action with its default', () => {
    const shortcuts = makeApi().listShortcuts()
    expect(shortcuts.length).toBe(Object.keys(DEFAULT_BINDINGS).length)
    const search = shortcuts.find((s) => s.action === 'navSearch')
    expect(search?.defaultCombo).toBe('L1+R1')
    // combo falls back to the default when the user hasn't customised it
    expect(search?.combo).toBe('L1+R1')
  })
})
