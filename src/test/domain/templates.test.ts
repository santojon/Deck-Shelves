import { describe, it, expect } from 'vitest'
import { SHELF_TEMPLATES, DEFAULT_SHELF_TEMPLATES } from '../../domain/templates'

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
    const categories = new Set(['status', 'time', 'platform'])
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

  it('deck_verified template targets the "verified" compatibility level', () => {
    const verified = SHELF_TEMPLATES.find((t) => t.id === 'deck_verified')
    expect(verified).toBeDefined()
    if (verified!.source.type === 'filter') {
      const group = verified!.source.filter.filterGroup
      expect(group).toBeDefined()
      expect(group!.items[0].type).toBe('deckCompatibility')
      expect(group!.items[0].params?.levels).toEqual(['verified'])
    }
  })

  it('top_reviewed template sorts by review_score on installed games', () => {
    const top = SHELF_TEMPLATES.find((t) => t.id === 'top_reviewed')
    expect(top).toBeDefined()
    if (top!.source.type === 'filter') {
      expect(top!.source.filter.installed).toBe(true)
      expect(top!.source.filter.sort).toBe('review_score')
    }
  })

  it('default templates include favorites, recent, and recently_added', () => {
    const ids = DEFAULT_SHELF_TEMPLATES.map((t) => t.id)
    expect(ids).toEqual(['favorites', 'recent', 'recently_added'])
  })
})
