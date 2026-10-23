import { describe, it, expect } from 'vitest'
import { ShelfSchema, SmartShelfSchema, SettingsSchema, FilterSchema, FilterItemSchema, SavedSmartFilterSchema } from '../../types'

// Documents that went through an older cloud copy carry 0/1 in place of booleans.
const discount = (min: number, inverted: unknown) => ({
  mode: 'and', items: [{ type: 'discount', inverted, params: { minDiscount: min, maxDiscount: 100 } }],
})

const macComposite = {
  id: 's_comp',
  title: 'Deals',
  updatedAt: 1,
  source: {
    type: 'composite',
    combine: 'union',
    sources: [
      { type: 'store', childFilter: discount(100, 0), excludeOwned: 1, excludeOwnedNonSteam: 1 },
      { type: 'wishlist', childFilter: discount(50, 0), excludeOwned: 1, excludeOwnedNonSteam: 1, hideOwnedNonSteamCloud: 0 },
    ],
  },
}

describe('legacy 0/1 flags', () => {
  it('parses a composite whose store and wishlist children carry 0/1', () => {
    const r = SettingsSchema.safeParse({ shelves: [macComposite] })
    expect(r.success).toBe(true)
    const [store, wishlist] = (r.data!.shelves[0].source as any).sources
    expect(store.excludeOwned).toBe(true)
    expect(store.excludeOwnedNonSteam).toBe(true)
    expect(store.childFilter.items[0].inverted).toBe(false)
    expect(wishlist.excludeOwned).toBe(true)
    expect(wishlist.excludeOwnedNonSteam).toBe(true)
    expect(wishlist.hideOwnedNonSteamCloud).toBe(false)
  })

  it('reads 0/1 on shelf, smart shelf and filter booleans', () => {
    const shelf = ShelfSchema.parse({ ...macComposite, enabled: 0, hidden: 1, hideShelfTitle: 1, heroEnabled: 0, sortReverse: [1, 0] })
    expect(shelf.enabled).toBe(false)
    expect(shelf.hidden).toBe(true)
    expect(shelf.hideShelfTitle).toBe(true)
    expect(shelf.heroEnabled).toBe(false)
    expect(shelf.sortReverse).toEqual([true, false])
    const smart = SmartShelfSchema.parse({ id: 'm', title: 'M', mode: 'quick_play', enabled: 1, hideNewBadge: 1, manualBaseSortReverse: 0 })
    expect(smart.enabled).toBe(true)
    expect(smart.hideNewBadge).toBe(true)
    expect(smart.manualBaseSortReverse).toBe(false)
    const filter = FilterSchema.parse({ favorites: 1, installed: 0, hidden: 1, sortReverse: 1 })
    expect(filter).toMatchObject({ favorites: true, installed: false, hidden: true, sortReverse: true })
  })

  it('reads 0/1 on saved filters and synthetic cards', () => {
    expect(SavedSmartFilterSchema.parse({ id: 'f', name: 'F', mode: 'quick_play', sortReverse: [1, 0] }).sortReverse).toEqual([true, false])
    const shelf = ShelfSchema.parse({ ...macComposite, syntheticCards: [{ position: 0, text: 'Gap', placeholder: 1 }] })
    expect(shelf.syntheticCards?.[0]?.placeholder).toBe(true)
  })

  it('keeps the old shapes parsing as before', () => {
    const shelf = ShelfSchema.parse({ id: 's', title: 'S', source: { type: 'wishlist', excludeOwned: true } })
    expect(shelf.enabled).toBe(true)
    expect(shelf.hidden).toBe(false)
    expect(shelf.hideShelfTitle).toBe(false)
    expect(shelf.heroEnabled).toBeUndefined()
    expect(shelf.source).toEqual({ type: 'wishlist', excludeOwned: true })
    const smart = SmartShelfSchema.parse({ id: 'm', title: 'M', mode: 'quick_play' })
    expect(smart.enabled).toBe(true)
    expect(smart.hideNewBadge).toBeUndefined()
    expect(FilterSchema.parse({ hidden: 'only' }).hidden).toBe('only')
    expect(FilterItemSchema.parse({ type: 'installed' }).inverted).toBeUndefined()
  })

  it('still rejects values that are neither booleans nor 0/1', () => {
    expect(ShelfSchema.safeParse({ ...macComposite, enabled: 2 }).success).toBe(false)
    expect(ShelfSchema.safeParse({ ...macComposite, enabled: 'yes' }).success).toBe(false)
    expect(ShelfSchema.safeParse({ id: 's', title: 'S', source: { type: 'store', excludeOwned: 'true' } }).success).toBe(false)
  })
})
