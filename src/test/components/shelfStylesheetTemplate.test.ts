import { describe, it, expect } from 'vitest'
import { buildShelfStylesheet, type ShelfStylesheetCtx } from '../../components/shelf/shelfStylesheetTemplate'

const CTX: ShelfStylesheetCtx = {
  cardRadius: '4px', cardW: 134, cardH: 60, cardArtH: 60, cardGap: 11,
  featuredW: 300, featuredH: 140, featuredArtH: 140,
}

describe('buildShelfStylesheet — .ds-new-badge color', () => {
  // Regression for a third-party report on the Decky Store update PR: under
  // CSS Loader's Colored Toggles theme (White option), the badge background
  // resolves through --colored-toggles-main-color to white, and the text
  // was a hardcoded #fff fallback — white-on-white, unreadable.
  it('falls back through the Colored Toggles contrasting-text var before #fff', () => {
    const css = buildShelfStylesheet(CTX)
    expect(css).toContain('color: var(--ds-new-badge-color, var(--colored-toggles-friends-text-color, #fff));')
  })
})
