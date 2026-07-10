import { describe, it, expect, beforeEach } from 'vitest'
import { resolveSmartShelf, invalidateSmartShelfCache } from '../../steam/smartShelves'
import type { AppOverview } from '../../steam'
import { SmartShelfModeSchema, FilterItemTypeSchema } from '../../types'
import { SHELF_TEMPLATES, ONLINE_SHELF_TEMPLATES } from '../../domain/templates'

/* Template audit (feature request): guarantees every smart-shelf mode resolves
   without throwing, and pins down which modes are DATA-dependent — i.e. they
   only surface games when review/metacritic/achievement metadata is present.
   Those are exactly the ones users report as "no games match" when the score
   isn't in the local overview (non-Steam, or uninstalled Steam titles). The
   online-metadata enrichment feeds them the data they need. */

const NOW = Math.floor(Date.now() / 1000)
const DAY = 86400

function app(o: Partial<AppOverview> & { appid: number }): AppOverview {
  return { display_name: `App ${o.appid}`, ...o } as AppOverview
}

// A diverse library covering the criteria of the deterministic modes.
function diverseLibrary(): AppOverview[] {
  return [
    app({ appid: 1, installed: true, deck_compatibility_category: 3, playtime_forever: 30, last_played: NOW - 3 * DAY }),
    app({ appid: 2, deck_compatibility_category: 3, playtime_forever: 0, last_played: 0, review_percentage: 92, metacritic_score: 88 } as any),
    app({ appid: 3, deck_compatibility_category: 2, playtime_forever: 0, last_played: 0, review_percentage: 90, metacritic_score: 85 } as any),
    app({ appid: 4, is_non_steam: true, size_on_disk: 4096 } as any),
    app({ appid: 5, playtime_forever: 0, last_played: 0, rt_purchased_time: NOW - 4 * 365 * DAY } as any),
    app({ appid: 6, deck_compatibility_category: 2, playtime_forever: 120, last_played: NOW - 210 * DAY }),
    app({ appid: 7, playtime_forever: 90, last_played: NOW - 40 * DAY }),
    app({ appid: 8, playtime_forever: 200, last_played: NOW - 5 * DAY }),
    app({ appid: 9, playtime_forever: 400, last_played: NOW - 2 * DAY }),
    app({ appid: 10, app_type: 8192 } as any), // soundtrack
    app({ appid: 11, app_type: 2048 } as any), // video
    app({ appid: 12, app_type: 8, last_played: NOW - DAY } as any), // demo
  ]
}

describe('smart templates — every mode resolves (smoke)', () => {
  beforeEach(() => invalidateSmartShelfCache())

  const modes = SmartShelfModeSchema.options.filter((m) => m !== 'custom')

  it.each(modes)('%s returns an array without throwing', (mode) => {
    const out = resolveSmartShelf(mode as any, diverseLibrary(), 20)
    expect(Array.isArray(out)).toBe(true)
  })
})

describe('smart templates — structural modes surface the right games', () => {
  beforeEach(() => invalidateSmartShelfCache())

  it('non_steam returns only non-Steam entries', () => {
    expect(resolveSmartShelf('non_steam', diverseLibrary(), 20)).toEqual([4])
  })
  it('soundtracks / videos / demos filter by app_type', () => {
    expect(resolveSmartShelf('soundtracks', diverseLibrary(), 20)).toEqual([10])
    expect(resolveSmartShelf('videos', diverseLibrary(), 20)).toEqual([11])
    expect(resolveSmartShelf('demos', diverseLibrary(), 20)).toEqual([12])
  })
  it('forgotten surfaces long-idle games', () => {
    expect(resolveSmartShelf('forgotten', diverseLibrary(), 20)).toContain(5)
  })
})

describe('smart templates — DATA-dependent modes (need review/metacritic)', () => {
  beforeEach(() => invalidateSmartShelfCache())

  it('hidden_gems is EMPTY without review data, POPULATES with it', () => {
    const noData = [app({ appid: 1, playtime_forever: 0, last_played: 0, deck_compatibility_category: 3 })]
    expect(resolveSmartShelf('hidden_gems', noData, 20)).toEqual([])

    invalidateSmartShelfCache()
    const withData = [app({ appid: 1, playtime_forever: 0, last_played: 0, deck_compatibility_category: 3, review_percentage: 90 } as any)]
    expect(resolveSmartShelf('hidden_gems', withData, 20)).toEqual([1])
  })

  it('forgotten_gems is EMPTY without metacritic+review, POPULATES with them', () => {
    const noData = [app({ appid: 1, playtime_forever: 0, last_played: 0 })]
    expect(resolveSmartShelf('forgotten_gems', noData, 20)).toEqual([])

    invalidateSmartShelfCache()
    const withData = [app({ appid: 1, playtime_forever: 0, last_played: 0, review_percentage: 90, metacritic_score: 85 } as any)]
    expect(resolveSmartShelf('forgotten_gems', withData, 20)).toContain(1)
  })
})

describe('regular templates — configs are well-formed (no impossible references)', () => {
  const KNOWN_SORTS = new Set([
    'alphabetical', 'recent', 'playtime', 'release_date', 'size_on_disk', 'metacritic',
    'review_score', 'added', 'random', 'manual', 'price_low', 'discount_high', 'original_price_high',
  ])
  const KNOWN_FILTER_TYPES = new Set<string>(FilterItemTypeSchema.options)
  const all = [...SHELF_TEMPLATES, ...ONLINE_SHELF_TEMPLATES]

  it.each(all.map((t) => [t.id, t] as const))('%s uses a known sort and known filter types', (_id, tpl) => {
    const src: any = tpl.source
    if (src?.type !== 'filter') return
    const f = src.filter ?? {}
    for (const s of (Array.isArray(f.sort) ? f.sort : [f.sort]).filter(Boolean)) {
      expect(KNOWN_SORTS.has(s)).toBe(true)
    }
    for (const item of f.filterGroup?.items ?? []) {
      expect(KNOWN_FILTER_TYPES.has(item.type)).toBe(true)
    }
  })
})
