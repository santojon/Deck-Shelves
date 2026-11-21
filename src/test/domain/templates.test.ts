import { describe, it, expect } from 'vitest'
import { SHELF_TEMPLATES, DEFAULT_SHELF_TEMPLATES, shelfSourceSignature, coveredTemplateIds, templateSourceForOrigin } from '../../domain/templates'

describe('template exclusion', () => {
  it('signature ignores sort so a re-sorted shelf still matches its template', () => {
    const a = shelfSourceSignature({ type: 'filter', filter: { maxPlaytimeMinutes: 0, sort: 'alphabetical' } })
    const b = shelfSourceSignature({ type: 'filter', filter: { maxPlaytimeMinutes: 0, sort: 'playtime' } })
    expect(a).toBe(b)
  })

  it('covers a template id when a matching shelf exists', () => {
    const neverPlayed = SHELF_TEMPLATES.find((t) => t.id === 'never_played')!
    const covered = coveredTemplateIds([{ source: { ...neverPlayed.source, sort: 'recent' } }], [])
    expect(covered).toContain('never_played')
    expect(covered).not.toContain('deck_verified')
  })

  it('covers existing smart modes', () => {
    expect(coveredTemplateIds([], ['best_unplayed'])).toContain('best_unplayed')
  })
})

describe('SHELF_TEMPLATES', () => {
  it('has unique template ids', () => {
    const ids = SHELF_TEMPLATES.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('every template has a non-empty titleKey', () => {
    for (const t of SHELF_TEMPLATES) {
      expect(t.titleKey).toMatch(/^template_/)
    }
  })

  it('every template uses a known category', () => {
    const categories = new Set(['status', 'time', 'platform', 'together'])
    for (const t of SHELF_TEMPLATES) {
      expect(categories.has(t.category)).toBe(true)
    }
  })

  it('recently played template uses a filter source — not the invalid tab "recent"', () => {
    const recent = SHELF_TEMPLATES.find((t) => t.id === 'recent')
    expect(recent).toBeDefined()
    expect(recent!.source.type).toBe('filter')
    if (recent!.source.type === 'filter') {
      expect(recent!.source.filter.sort).toBe('recent')
    }
  })

  it('steam_cloud template wraps cloudAvailable in a filterGroup', () => {
    const cloud = SHELF_TEMPLATES.find((t) => t.id === 'steam_cloud')
    expect(cloud).toBeDefined()
    expect(cloud!.source.type).toBe('filter')
    if (cloud!.source.type === 'filter') {
      const group = cloud!.source.filter.filterGroup
      expect(group).toBeDefined()
      expect(group!.items[0].type).toBe('cloudAvailable')
    }
  })

  it('deck_verified template targets the "verified" level of the device in use', () => {
    const verified = SHELF_TEMPLATES.find((t) => t.id === 'deck_verified')
    expect(verified).toBeDefined()
    if (verified!.source.type === 'filter') {
      const group = verified!.source.filter.filterGroup
      expect(group).toBeDefined()
      expect(group!.items[0].type).toBe('deviceCompatibility')
      expect(group!.items[0].params?.levels).toEqual(['verified'])
    }
  })

  it('VR templates key on the VR support levels', () => {
    const games = SHELF_TEMPLATES.find((t) => t.id === 'vr_games')
    const only = SHELF_TEMPLATES.find((t) => t.id === 'vr_only')
    expect(games && games.source.type === 'filter' && games.source.filter.filterGroup?.items[0]).toMatchObject({ type: 'vrSupport', params: { levels: ['only', 'supported'] } })
    expect(only && only.source.type === 'filter' && only.source.filter.filterGroup?.items[0]).toMatchObject({ type: 'vrSupport', params: { levels: ['only'] } })
  })

  it('never_played template targets the backlog via maxPlaytimeMinutes:0', () => {
    const np = SHELF_TEMPLATES.find((t) => t.id === 'never_played')
    expect(np).toBeDefined()
    if (np!.source.type === 'filter') {
      expect(np!.source.filter.maxPlaytimeMinutes).toBe(0)
      expect(np!.source.filter.sort).toBe('alphabetical')
    }
  })

  it('deck_playable template targets the "playable" level of the device in use', () => {
    const dp = SHELF_TEMPLATES.find((t) => t.id === 'deck_playable')
    expect(dp).toBeDefined()
    if (dp!.source.type === 'filter') {
      const group = dp!.source.filter.filterGroup
      expect(group!.items[0].type).toBe('deviceCompatibility')
      expect(group!.items[0].params?.levels).toEqual(['playable'])
    }
  })

  it('top_reviewed template sorts by review_score across all library games', () => {
    const top = SHELF_TEMPLATES.find((t) => t.id === 'top_reviewed')
    expect(top).toBeDefined()
    if (top!.source.type === 'filter') {
      expect(top!.source.filter.installed).toBeUndefined()
      expect(top!.source.filter.sort).toBe('review_score')
    }
  })

  it('default templates include favorites, recent, and recently_added', () => {
    const ids = DEFAULT_SHELF_TEMPLATES.map((t) => t.id)
    expect(ids).toEqual(['favorites', 'recent', 'recently_added'])
  })
})

describe('play-together templates', () => {
  const tpl = (id: string) => SHELF_TEMPLATES.find((t) => t.id === id)!
  const kindOf = (id: string) => (tpl(id).source as any).filter.filterGroup.items[0].params.kind
  const BORROWED = { type: 'familySharing', inverted: false, params: {} }

  it('each local template keys on its own same-screen choice and asks for an origin', () => {
    expect(['local_multiplayer', 'local_coop', 'local_versus'].map(kindOf)).toEqual(['local', 'local_coop', 'local_versus'])
    expect(['local_multiplayer', 'local_coop', 'local_versus'].every((id) => tpl(id).chooseOrigin === true)).toBe(true)
  })

  it('borrowed games reads the existing family sharing condition and opens directly', () => {
    expect((tpl('borrowed_games').source as any).filter.filterGroup.items).toEqual([BORROWED])
    expect(tpl('borrowed_games').chooseOrigin).toBeUndefined()
  })

  it('the library origin is the template itself, with borrowed games added only when asked', () => {
    expect(templateSourceForOrigin(tpl('local_coop'), 'library')).toEqual(tpl('local_coop').source)
    const borrowed = templateSourceForOrigin(tpl('local_coop'), 'library', true) as any
    expect(borrowed.filter.filterGroup.items.map((i: any) => i.type)).toEqual(['multiplayerType', 'familySharing'])
    expect((tpl('local_coop').source as any).filter.filterGroup.items).toHaveLength(1)
  })

  it('the store origin filters store games by the same condition and never by borrowed', () => {
    const store = templateSourceForOrigin(tpl('local_versus'), 'store', true) as any
    expect(store.type).toBe('store')
    expect(store.childFilter.items).toEqual([{ type: 'multiplayerType', inverted: false, params: { kind: 'local_versus' } }])
  })

  it('both origins join the library and the store, with borrowed games narrowing the library part only', () => {
    const both = templateSourceForOrigin(tpl('local_multiplayer'), 'both', true) as any
    expect(both).toMatchObject({ type: 'composite', combine: 'union' })
    expect(both.sources[0].filter.filterGroup.items.map((i: any) => i.type)).toEqual(['multiplayerType', 'familySharing'])
    expect(both.sources[1]).toMatchObject({ type: 'store', excludeOwned: true })
    expect(both.sources[1].childFilter.items.map((i: any) => i.type)).toEqual(['multiplayerType'])
  })

  it('the three local templates are told apart when checking which ones a user already has', () => {
    const covered = coveredTemplateIds([{ source: tpl('local_coop').source }], [])
    expect(covered).toContain('local_coop')
    expect(covered).not.toContain('local_versus')
    expect(covered).not.toContain('local_multiplayer')
  })
})
