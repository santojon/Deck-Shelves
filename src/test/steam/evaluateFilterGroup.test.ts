import { describe, it, expect, vi, afterEach } from 'vitest'
import { evaluateFilterGroup, type AppOverview } from '../../steam'
import type { FilterGroup, FilterItem } from '../../types'

function app(overrides: Partial<AppOverview> & { appid: number; display_name?: string }): AppOverview {
  return { display_name: `App ${overrides.appid}`, ...overrides } as AppOverview
}

const installed = (id: number) => app({ appid: id, installed: true })
const notInstalled = (id: number) => app({ appid: id, installed: false })

function group(items: FilterItem[], mode: 'and' | 'or' = 'and'): FilterGroup {
  return { mode, items }
}

describe('evaluateFilterGroup — empty / mode semantics', () => {
  it('returns the input unchanged when items is empty', () => {
    const apps = [installed(1), notInstalled(2)]
    expect(evaluateFilterGroup({ mode: 'and', items: [] }, apps)).toEqual(apps)
  })

  it('AND keeps only apps matching every item', () => {
    const apps = [installed(1), notInstalled(2), installed(3)]
    const g = group([
      { type: 'installed', params: {} },
    ])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1, 3])
  })

  it('OR keeps apps matching any item', () => {
    const apps = [
      app({ appid: 1, installed: true, is_favorite: false } as any),
      app({ appid: 2, installed: false, is_favorite: true } as any),
      app({ appid: 3, installed: false, is_favorite: false } as any),
    ]
    const g = group([
      { type: 'installed', params: {} },
      { type: 'favorites', params: {} },
    ], 'or')
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1, 2])
  })

  it('inverted item negates the match', () => {
    const apps = [installed(1), notInstalled(2)]
    const g = group([{ type: 'installed', inverted: true, params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([2])
  })
})

describe('evaluateFilterGroup — per filter type', () => {
  it('favorites uses the is_favorite flag', () => {
    const apps = [
      app({ appid: 1, is_favorite: true } as any),
      app({ appid: 2, is_favorite: false } as any),
    ]
    const g = group([{ type: 'favorites', params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('nonSteam uses the is_non_steam flag', () => {
    const apps = [app({ appid: 1, is_non_steam: true }), app({ appid: 2, is_non_steam: false })]
    const g = group([{ type: 'nonSteam', params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('hidden mode=only returns hidden apps', () => {
    const apps = [
      app({ appid: 1, is_hidden: true } as any),
      app({ appid: 2, is_hidden: false } as any),
    ]
    const g = group([{ type: 'hidden', params: { mode: 'only' } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('hidden mode=exclude removes hidden apps', () => {
    const apps = [
      app({ appid: 1, is_hidden: true } as any),
      app({ appid: 2, is_hidden: false } as any),
    ]
    const g = group([{ type: 'hidden', params: { mode: 'exclude' } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([2])
  })

  it('updatePending matches apps with update_pending=true', () => {
    const apps = [app({ appid: 1, update_pending: true }), app({ appid: 2, update_pending: false })]
    const g = group([{ type: 'updatePending', params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('isNew matches apps added within 30 days', () => {
    const recent = Math.floor(Date.now() / 1000) - 5 * 86400
    const old = Math.floor(Date.now() / 1000) - 365 * 86400
    const apps = [
      app({ appid: 1, rt_purchased_time: recent } as any),
      app({ appid: 2, rt_purchased_time: old } as any),
    ]
    const g = group([{ type: 'isNew', params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('deckCompatibility filters by levels (verified=3, playable=2, unsupported=1, unknown=0)', () => {
    const apps = [
      app({ appid: 1, deck_compatibility_category: 3 } as any),
      app({ appid: 2, deck_compatibility_category: 2 } as any),
      app({ appid: 3, deck_compatibility_category: 1 } as any),
    ]
    const g = group([{ type: 'deckCompatibility', params: { levels: ['verified'] } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('playedWithinDays uses last_played seconds', () => {
    const now = Math.floor(Date.now() / 1000)
    const apps = [
      app({ appid: 1, last_played: now - 3 * 86400 } as any),
      app({ appid: 2, last_played: now - 30 * 86400 } as any),
    ]
    const g = group([{ type: 'playedWithinDays', params: { days: 7 } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('playtimeRange minHours / maxHours work in minutes', () => {
    const apps = [
      app({ appid: 1, playtime_forever: 30 } as any),
      app({ appid: 2, playtime_forever: 120 } as any),
      app({ appid: 3, playtime_forever: 600 } as any),
    ]
    const g = group([{ type: 'playtimeRange', params: { minHours: 1, maxHours: 5 } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([2])
  })

  it('nameIncludes is case-insensitive', () => {
    const apps = [
      app({ appid: 1, display_name: 'Elden Ring' }),
      app({ appid: 2, display_name: 'Hades' }),
    ]
    const g = group([{ type: 'nameIncludes', params: { text: 'elden' } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('nameRegex matches via case-insensitive regex', () => {
    const apps = [
      app({ appid: 1, display_name: 'The Witness' }),
      app({ appid: 2, display_name: 'Stardew Valley' }),
    ]
    const g = group([{ type: 'nameRegex', params: { pattern: '^the' } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('nameRegex passes through invalid regex (does not crash the whole filter)', () => {
    const apps = [app({ appid: 1, display_name: 'Anything' })]
    const g = group([{ type: 'nameRegex', params: { pattern: '[invalid' } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('appIdList filters by explicit ids', () => {
    const apps = [app({ appid: 1 }), app({ appid: 2 }), app({ appid: 3 })]
    const g = group([{ type: 'appIdList', params: { appIds: [1, 3] } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1, 3])
  })

  it('cloudAvailable matches apps with cloud_available=true', () => {
    const apps = [
      app({ appid: 1, cloud_available: true } as any),
      app({ appid: 2, cloud_available: false } as any),
    ]
    const g = group([{ type: 'cloudAvailable', params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('controllerSupport defaults to min=1 (partial or full)', () => {
    const apps = [
      app({ appid: 1, controller_support: 0 } as any),
      app({ appid: 2, controller_support: 1 } as any),
      app({ appid: 3, controller_support: 2 } as any),
    ]
    const g = group([{ type: 'controllerSupport', params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([2, 3])
  })

  it('controllerSupport with min=2 matches only full support', () => {
    const apps = [
      app({ appid: 1, controller_support: 1 } as any),
      app({ appid: 2, controller_support: 2 } as any),
    ]
    const g = group([{ type: 'controllerSupport', params: { min: 2 } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([2])
  })

  it('merge evaluates a nested group', () => {
    const apps = [
      app({ appid: 1, installed: true, is_favorite: true } as any),
      app({ appid: 2, installed: true, is_favorite: false } as any),
      app({ appid: 3, installed: false, is_favorite: true } as any),
    ]
    const g = group([
      { type: 'installed', params: {} },
      {
        type: 'merge',
        params: {
          mode: 'or',
          items: [
            { type: 'favorites', params: {} },
            { type: 'nonSteam', params: {} },
          ],
        },
      },
    ])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('merge with empty children passes through (no exclusion)', () => {
    const apps = [installed(1), notInstalled(2)]
    const g = group([{ type: 'merge', params: { mode: 'and', items: [] } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1, 2])
  })

  it('merge "or" of installed + nonSteam selects either', () => {
    const apps = [
      app({ appid: 1, installed: true, is_non_steam: false } as any),
      app({ appid: 2, installed: false, is_non_steam: true } as any),
      app({ appid: 3, installed: false, is_non_steam: false } as any),
    ]
    const g = group([
      {
        type: 'merge',
        params: {
          mode: 'or',
          items: [
            { type: 'installed', params: {} },
            { type: 'nonSteam', params: {} },
          ],
        },
      },
    ])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1, 2])
  })

  it('merge "and" of multiple predicates intersects', () => {
    const apps = [
      app({ appid: 1, installed: true, is_favorite: true } as any),
      app({ appid: 2, installed: true, is_favorite: false } as any),
      app({ appid: 3, installed: false, is_favorite: true } as any),
    ]
    const g = group([
      {
        type: 'merge',
        params: {
          mode: 'and',
          items: [
            { type: 'installed', params: {} },
            { type: 'favorites', params: {} },
          ],
        },
      },
    ])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('merge with inverted child negates that child only', () => {
    const apps = [
      app({ appid: 1, installed: true, is_favorite: true } as any),
      app({ appid: 2, installed: true, is_favorite: false } as any),
      app({ appid: 3, installed: false, is_favorite: false } as any),
    ]
    const g = group([
      {
        type: 'merge',
        params: {
          mode: 'and',
          items: [
            { type: 'installed', params: {} },
            { type: 'favorites', inverted: true, params: {} },
          ],
        },
      },
    ])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([2])
  })

  it('nested merge inside merge evaluates recursively', () => {
    const apps = [
      app({ appid: 1, installed: true, is_favorite: true, is_non_steam: false } as any),
      app({ appid: 2, installed: false, is_favorite: false, is_non_steam: true } as any),
      app({ appid: 3, installed: false, is_favorite: false, is_non_steam: false } as any),
    ]
    const g = group([
      {
        type: 'merge',
        params: {
          mode: 'or',
          items: [
            {
              type: 'merge',
              params: {
                mode: 'and',
                items: [
                  { type: 'installed', params: {} },
                  { type: 'favorites', params: {} },
                ],
              },
            },
            { type: 'nonSteam', params: {} },
          ],
        },
      },
    ])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1, 2])
  })

  it('merge result has no duplicates because each app is tested once', () => {
    const apps = [
      app({ appid: 1, installed: true, is_favorite: true } as any),
      app({ appid: 2, installed: true, is_favorite: true } as any),
    ]
    const g = group([
      {
        type: 'merge',
        params: {
          mode: 'or',
          items: [
            { type: 'installed', params: {} },
            { type: 'favorites', params: {} },
          ],
        },
      },
    ])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1, 2])
  })

  it('unknown filter type passes through (does not exclude apps)', () => {
    const apps = [app({ appid: 1 }), app({ appid: 2 })]
    const g = group([{ type: 'storeTag' as any, params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1, 2])
  })
})

describe('evaluateFilterGroup — appStatus on non-Steam (synthesized display_status)', () => {
  const ns = (id: number, over: Partial<AppOverview> = {}) =>
    app({ appid: id, is_non_steam: true, ...over } as any)

  it('installed non-Steam (size on disk) matches installed_idle', () => {
    const apps = [ns(1, { size_on_disk: 4096 } as any), ns(2, { size_on_disk: 0 } as any)]
    const g = group([{ type: 'appStatus', params: { groups: ['installed_idle'] } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('not-installed non-Steam (no size / no local play) matches not_installed', () => {
    const apps = [ns(1, { size_on_disk: 4096 } as any), ns(2, { size_on_disk: 0 } as any)]
    const g = group([{ type: 'appStatus', params: { groups: ['not_installed'] } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([2])
  })

  it('local last-play time marks a non-Steam shortcut installed', () => {
    const apps = [ns(1, { rt_last_time_locally_played: 1700000000 } as any)]
    const g = group([{ type: 'appStatus', params: { groups: ['installed_idle'] } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })

  it('inverting installed on non-Steam yields the not-installed ones', () => {
    const apps = [ns(1, { size_on_disk: 4096 } as any), ns(2, { size_on_disk: 0 } as any)]
    const g = group([{ type: 'installed', inverted: true, params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([2])
  })

  it('Steam apps keep their real display_status (no synthesis)', () => {
    const apps = [app({ appid: 1, display_status: 9 } as any), app({ appid: 2, display_status: 11 } as any)]
    const g = group([{ type: 'appStatus', params: { groups: ['not_installed'] } }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1])
  })
})

describe('systemCompatibility filter', () => {
  it('keeps apps available on the current platform (and unknown), drops incompatible', () => {
    const apps = [
      app({ appid: 1, available_on_current_platform: true } as any),
      app({ appid: 2, available_on_current_platform: false } as any),
      app({ appid: 3 } as any), // no data (non-Steam) → kept
    ]
    const g = group([{ type: 'systemCompatibility', params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([1, 3])
  })

  it('inverts to keep only incompatible apps', () => {
    const apps = [
      app({ appid: 1, available_on_current_platform: true } as any),
      app({ appid: 2, available_on_current_platform: false } as any),
    ]
    const g = group([{ type: 'systemCompatibility', inverted: true, params: {} }])
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([2])
  })
})

describe('remotePlayLocation filter', () => {
  const apps = () => [
    app({ appid: 1, installed: true, installed_remote: false } as any),  // local only
    app({ appid: 2, installed: false, installed_remote: true } as any),  // remote only
    app({ appid: 3, installed: true, installed_remote: true } as any),   // both
    app({ appid: 4, installed: false, installed_remote: false } as any), // neither
  ]
  const run = (mode: string) =>
    evaluateFilterGroup(group([{ type: 'remotePlayLocation', params: { mode } }]), apps()).map((a) => a.appid)

  it('local = installed here', () => expect(run('local')).toEqual([1, 3]))
  it('remote = installed on another client', () => expect(run('remote')).toEqual([2, 3]))
  it('remote-only = elsewhere and not here (play-from-remote shelf)', () => expect(run('remote-only')).toEqual([2]))
  it('both = installed here and elsewhere', () => expect(run('both')).toEqual([3]))
})

describe('priceRange filter', () => {
  const seedPrices = (m: Record<number, { price?: number; unpriced?: boolean }>) => {
    const cache: Record<number, any> = {}
    for (const [id, d] of Object.entries(m)) cache[Number(id)] = { ts: Date.now(), data: { currency: 'BRL', ...d } }
    const store = new Map<string, string>([['ds-price-cache-v1', JSON.stringify(cache)]])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
      removeItem: (k: string) => { store.delete(k) },
    })
  }
  afterEach(() => vi.unstubAllGlobals())

  it('keeps games within [min,max] currency units; excludes unpriced', () => {
    // prices are cents: 5.00 / 25.00 / 99.00 / free
    seedPrices({ 1: { price: 500 }, 2: { price: 2500 }, 3: { price: 9900 }, 4: { unpriced: true } })
    const g = group([{ type: 'priceRange', params: { minPrice: 10, maxPrice: 50 } }])
    const apps = [app({ appid: 1 }), app({ appid: 2 }), app({ appid: 3 }), app({ appid: 4 })]
    expect(evaluateFilterGroup(g, apps).map((a) => a.appid)).toEqual([2])
  })

  it('open-ended min only', () => {
    seedPrices({ 1: { price: 500 }, 2: { price: 9900 } })
    const g = group([{ type: 'priceRange', params: { minPrice: 10 } }])
    expect(evaluateFilterGroup(g, [app({ appid: 1 }), app({ appid: 2 })]).map((a) => a.appid)).toEqual([2])
  })

  it('open-ended max only', () => {
    seedPrices({ 1: { price: 500 }, 2: { price: 9900 } })
    const g = group([{ type: 'priceRange', params: { maxPrice: 10 } }])
    expect(evaluateFilterGroup(g, [app({ appid: 1 }), app({ appid: 2 })]).map((a) => a.appid)).toEqual([1])
  })
})
