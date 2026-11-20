import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import '../../core/internalRegistry'
import i18n, { initI18n } from '../../i18n'
import {
  installPluginApi, makeApi, applyExternalSort,
  getThirdPartySources, getThirdPartySmartSources, getThirdPartyFilterTypes, getThirdPartySortOptions,
} from '../../core/pluginApi'
import { ALL_FILTER_TYPES, getTypeLabel } from '../../components/conditions/utils'
import { SMART_MODE_OPTIONS, SORT_OPTIONS, V3_SOURCE_OPTIONS } from '../../components/qam/modals/editShelf/constants'

const api = makeApi()
let uninstall: () => void = () => {}

beforeAll(() => {
  initI18n()
  uninstall = installPluginApi()
})
afterAll(() => uninstall())

const ids = (list: ReadonlyArray<{ id: string }>) => new Set(list.map((d) => d.id))
const named = (list: ReadonlyArray<{ id: string; displayName?: string }>, id: string) =>
  list.find((d) => d.id === id)?.displayName

const smartIds = [...SMART_MODE_OPTIONS, 'custom']
const sortIds = SORT_OPTIONS.map((o) => o.value as string)
const sourceIds = V3_SOURCE_OPTIONS.map((o) => o.value)

describe('built-in registry entries', () => {
  it('lists exactly the conditions, sort keys, smart modes and sources the editors offer', () => {
    expect(ids(api.getRegisteredFilterTypes())).toEqual(new Set(ALL_FILTER_TYPES))
    expect(ids(api.getRegisteredSortOptions())).toEqual(new Set(sortIds))
    expect(ids(api.getRegisteredSmartSources())).toEqual(new Set(smartIds))
    expect(ids(api.getRegisteredSources())).toEqual(new Set(sourceIds))
  })

  it('names each built-in entry with the editor label, and in another language once the interface switches', async () => {
    expect(named(api.getRegisteredFilterTypes(), 'genres')).toBe(getTypeLabel('genres'))
    expect(named(api.getRegisteredSortOptions(), 'playtime')).toBe(i18n.t('sort_playtime'))
    expect(named(api.getRegisteredSmartSources(), 'daily_pick')).toBe(i18n.t('smart_template_daily_pick'))
    expect(named(api.getRegisteredSources(), 'pinned_games')).toBe(i18n.t('source_v3_pinned'))
    const before = i18n.language
    i18n.addResourceBundle('xx-XX', 'translation', {
      filter_type_genres: 'Genres (test)', sort_playtime: 'Playtime (test)',
      smart_template_daily_pick: 'Daily (test)', source_v3_pinned: 'Pinned (test)',
    }, true, true)
    await i18n.changeLanguage('xx-XX')
    try {
      expect(named(api.getRegisteredFilterTypes(), 'genres')).toBe('Genres (test)')
      expect(named(api.getRegisteredSortOptions(), 'playtime')).toBe('Playtime (test)')
      expect(named(api.getRegisteredSmartSources(), 'daily_pick')).toBe('Daily (test)')
      expect(named(api.getRegisteredSources(), 'pinned_games')).toBe('Pinned (test)')
    } finally {
      await i18n.changeLanguage(before)
    }
  })

  it('refuses a plugin entry under every built-in id and keeps the built-in entry', () => {
    const plugin = (id: string): any => ({
      id, displayName: 'plugin', resolve: async () => [1], evaluate: () => true, sort: (a: number[]) => a.slice().reverse(),
    })
    for (const id of ALL_FILTER_TYPES) api.registerFilterType(plugin(id))
    for (const id of sortIds) api.registerSortOption(plugin(id))
    for (const id of smartIds) api.registerSmartShelfSource(plugin(id))
    for (const id of sourceIds) api.registerShelfSource(plugin(id))
    const all = [
      ...api.getRegisteredFilterTypes(), ...api.getRegisteredSortOptions(),
      ...api.getRegisteredSmartSources(), ...api.getRegisteredSources(),
    ]
    expect(all.filter((d) => d.displayName === 'plugin').map((d) => d.id)).toEqual([])
    expect(all).toHaveLength(ALL_FILTER_TYPES.length + sortIds.length + smartIds.length + sourceIds.length)
  })

  it('sorting by manual keeps the given order while the built-in entries are installed', () => {
    expect(applyExternalSort('manual', [3, 1, 2], [])).toEqual([3, 1, 2])
  })
})

describe('third-party registry lists', () => {
  const entry = (id: string): any => ({ id, displayName: id, resolve: async () => [], evaluate: () => true, sort: (a: number[]) => a })

  it('leave the built-in entries out and keep a plugin entry', () => {
    const offs = [
      api.registerShelfSource(entry('acme.source')),
      api.registerSmartShelfSource(entry('acme.mode')),
      api.registerFilterType(entry('acme.condition')),
      api.registerSortOption(entry('acme.sort')),
    ]
    try {
      expect(getThirdPartySources().map((d) => d.id)).toEqual(['acme.source'])
      expect(getThirdPartySmartSources().map((d) => d.id)).toEqual(['acme.mode'])
      expect(getThirdPartyFilterTypes().map((d) => d.id)).toEqual(['acme.condition'])
      expect(getThirdPartySortOptions().map((d) => d.id)).toEqual(['acme.sort'])
    } finally {
      for (const off of offs) off()
    }
  })

  it('count a context-aware source as a plugin source', () => {
    const off = api.registerContextAwareShelfSource({ ...entry('acme.focused'), context: { requiresFocusedApp: true } })
    try {
      expect(getThirdPartySources().map((d) => d.id)).toEqual(['acme.focused'])
    } finally {
      off()
    }
  })

  it('do not hand an id over 64 characters to the editors', () => {
    const long = `acme.${'x'.repeat(60)}`
    const offs = [
      api.registerSmartShelfSource(entry(long)),
      api.registerFilterType(entry(long)),
      api.registerSortOption(entry(long)),
    ]
    try {
      expect(getThirdPartySmartSources()).toEqual([])
      expect(getThirdPartyFilterTypes()).toEqual([])
      expect(getThirdPartySortOptions()).toEqual([])
      expect(api.getRegisteredSortOptions().some((d) => d.id === long)).toBe(true)
    } finally {
      for (const off of offs) off()
    }
  })
})
