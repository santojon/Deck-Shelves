import { afterEach, describe, expect, it, vi } from 'vitest'

const g = globalThis as any

const GROUPS = [
  'gamepadDialogClasses',
  'quickAccessControlsClasses',
  'scrollPanelClasses',
  'gamepadContextMenuClasses',
  'quickAccessMenuClasses',
] as const

async function loadShim(lib: Record<string, unknown>) {
  vi.resetModules()
  g.DFL = lib
  return import('../../shims/host-ui') as Promise<Record<string, any>>
}

function realGroups(): Record<string, Record<string, string>> {
  return Object.fromEntries(GROUPS.map((name) => [name, { Title: `_${name}Title`, Field: `_${name}Field` }]))
}

afterEach(() => {
  delete g.DFL
  vi.resetModules()
})

describe('host-ui class groups', () => {
  it('come from the loader library, whose staticClasses is the Quick Access menu group', async () => {
    const groups = realGroups()
    const shim = await loadShim({ ...groups, staticClasses: groups.quickAccessMenuClasses })
    for (const name of GROUPS) expect(shim[name]).toBe(groups[name])
  })

  it('come from a neutral host that publishes them next to an empty staticClasses', async () => {
    const groups = realGroups()
    const shim = await loadShim({ ...groups, staticClasses: {} })
    for (const name of GROUPS) expect(shim[name]).toBe(groups[name])
  })

  it('still give a class name for every key when only staticClasses exists', async () => {
    const shim = await loadShim({ staticClasses: { QuickAccessMenu: '_qam' } })
    for (const name of GROUPS) expect(shim[name].Title).toBe('Title')
  })
})
