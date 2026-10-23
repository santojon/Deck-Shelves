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

describe('buildShelfStylesheet — controller focus invalidation', () => {
  it('avoids document-root card-focus dependencies while retaining local focus and Round Compatibility rules', () => {
    const css = buildShelfStylesheet(CTX).replace(/\/\*[\s\S]*?\*\//g, '')
    // Root :has(card focus) caused whole-document recalculation on each move.
    // Keep this guard independent of Steam's current hashed FocusRing class.
    expect(css).not.toMatch(/(?:html|body|:root)\s*:has\([^)]*\.ds-card/)
    expect(css).toContain('#deck-shelves-home-root .ds-card.gpfocus')
    expect(css).toContain('html[data-ds-theme-focus-round-compat="true"] ._1wPplsegQqCoe06wXPhzKT')
  })
})

describe('buildShelfStylesheet — card tags on hover', () => {
  it('hides the inline tag only on cards the focus overlay draws over, never on a merely hovered card', () => {
    const css = buildShelfStylesheet(CTX).replace(/\/\*[\s\S]*?\*\//g, '')
    const rule = css.slice(0, css.indexOf('visibility: hidden', css.indexOf('.ds-card-badge-host--inline')))
    const selectors = rule.slice(rule.lastIndexOf('}') + 1)
    expect(selectors).toContain('.ds-card.gpfocus .ds-card-badge-host--inline')
    expect(selectors).toContain('.ds-card:focus .ds-card-badge-host--inline')
    expect(selectors).toContain('.ds-card.is-selected .ds-card-badge-host--inline')
    expect(selectors).not.toContain(':hover')
  })
})
