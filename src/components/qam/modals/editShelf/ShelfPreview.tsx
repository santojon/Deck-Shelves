import { useEffect, useMemo, useRef } from 'react'
import { Focusable } from '@decky/ui'
import { ShelfRow } from '../../../shelf/ShelfRow'
import type { DeckRowItem } from '../../../shelf/types'
import { shouldShowMoreCard, shouldShowRefreshCard } from '../../../shelf/trailingCards'
import type { PlatformAppMeta } from '../../../../runtime/platform'

const NEW_GAME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000
// Portrait card. Featured cards are 3.21× wider — same ratio the home shelf
// uses to keep landscape hero art at the right ~2.14:1 aspect.
const PREVIEW_CARD_W = 78
const PREVIEW_ART_H = 110
const FEATURED_CARD_W = Math.round(PREVIEW_CARD_W * 3.21)

// Scoped overrides — keep the modal preview visually flat (no native scale,
// no theme accent ring, no animated glow) while preserving the focus drop
// shadow + label fade behaviour the home shelf uses. Padding is gated to the
// text-only cards (More/Refresh share the `ds-more-card-text` child); game
// cards stay at zero padding so the image fills the focus area edge-to-edge.
const PREVIEW_STYLE_TAG = `
[data-ds-preview-row="1"] .ds-card-art:has(> .ds-more-card-text) { padding: 6px !important; }
[data-ds-preview-row="1"] .ds-more-card-text { font-size: 10px !important; line-height: 1.2 !important; }
[data-ds-preview-row="1"] .ds-refresh-card svg { width: 22px !important; height: 22px !important; }
[data-ds-preview-row="1"] .ds-card-status-icon svg { width: 11px !important; height: 11px !important; }
[data-ds-preview-row="1"] .ds-card-status { font-size: 11px !important; }
[data-ds-preview-row="1"] .ds-card-label-name { font-size: 12px !important; line-height: 1.2 !important; }
/* Strip every native/theme border + outline + scale on every state, on the
   card itself AND any nested element (the native landscape class draws its
   accent border on a child of the focused card, so the parent-only selector
   wasn't reaching it). */
[data-ds-preview-row="1"] .ds-card,
[data-ds-preview-row="1"] .ds-card *,
[data-ds-preview-row="1"] .ds-card.ds-card--featured,
[data-ds-preview-row="1"] .ds-card.ds-card--featured *,
[data-ds-preview-row="1"] .ds-card.is-selected,
[data-ds-preview-row="1"] .ds-card:hover,
[data-ds-preview-row="1"] .ds-card:focus,
[data-ds-preview-row="1"] .ds-card.gpfocus {
  outline: 0 !important;
  outline-color: transparent !important;
  border: 0 !important;
  border-color: transparent !important;
  transform: none !important;
}
[data-ds-preview-row="1"] .ds-card:hover,
[data-ds-preview-row="1"] .ds-card:focus,
[data-ds-preview-row="1"] .ds-card.gpfocus { box-shadow: rgba(0, 0, 0, 0.5) 0px 8px 16px 0px !important; filter: brightness(1) !important; z-index: 12; }
[data-ds-preview-row="1"] .ds-card::after,
[data-ds-preview-row="1"] .ds-card:hover::after,
[data-ds-preview-row="1"] .ds-card:focus::after,
[data-ds-preview-row="1"] .ds-card.gpfocus::after { animation: none !important; opacity: 0 !important; }
/* Badge sizing — the home defaults to 10 px / 24 px band assuming
   200+ px cards; the preview cards are 78 px wide, so the same
   band looks chunky and eats roughly 1/3 of the card height.
   Scale font + padding + band height down proportionally. */
[data-ds-preview-row="1"] .ds-new-badge { font: 700 8px/13px "Motiva Sans", Helvetica, Arial, sans-serif !important; padding: 1px 6px !important; letter-spacing: 0.3px !important; }
[data-ds-preview-row="1"] .ds-new-badge-band { height: 16px !important; }
/* Preview badge — kept inside the card top edge (top:0) so the modal
   stays bounded (the earlier overflow:visible cascade let the focus
   scale leak past the modal). z:9999 on the host AND on every descendant
   so it wins inside the focused card's z:12 stacking context against
   the position:absolute .ds-card-art fill that otherwise covers it. */
[data-ds-preview-row="1"] .ds-card-badge-host--inline { top: 0 !important; height: 16px !important; z-index: 9999 !important; }
[data-ds-preview-row="1"] .ds-card-badge-host--inline .ds-new-badge-band,
[data-ds-preview-row="1"] .ds-card-badge-host--inline .ds-new-badge { z-index: 9999 !important; position: relative !important; }
/* The band absolutely-positions itself at top:0 of the host. With the
   host at top:0 (no overhang), the band sits at the card's top edge
   and the bottom-of-card art is fully visible. */`

export interface ShelfPreviewProps {
  t: (k: any, opts?: any) => string
  ids: number[]
  meta: Map<number, PlatformAppMeta>
  // Cap shown cards to the configured shelf limit. Without it the preview
  // outpaces the resolver on `state.limit` changes between tabs.
  limit?: number
  // Source + sort drive whether the trailing MoreCard / RefreshCard render
  // (refreshable smart, random non-smart, etc.) — same rules as Shelf.tsx.
  shelfSource?: any
  shelfSort?: string | string[]
  hideStatusLine: boolean
  hideNewBadge: boolean
  hideCompatIcons: boolean
  hideNonSteamBadge: boolean
  hideGameNames: boolean
  hideInstallIndicator: boolean
  hideSeeMore: boolean
  hideRefreshCard: boolean
  highlightFirst: boolean
  highlightAll: boolean
  highlightedAppIds: number[]
  // When provided, the trailing RefreshCard is focusable + clickable and
  // invokes this callback to re-resolve the preview's app ids (matches the
  // behaviour the home shelf gives the user).
  onRefresh?: () => void
  // Emitted whenever focus moves between cards in the preview row.
  // Drives the Decoration tab's "insert at currently focused slot"
  // behaviour without coupling that tab to the preview's DOM.
  onFocusedIndexChange?: (idx: number) => void
  // Synthetic decoration cards to interleave at their `position` slots.
  // Same shape Shelf.tsx splices on the home — kept identical here so the
  // preview matches the real shelf 1:1.
  syntheticCards?: Array<{
    position: number;
    image?: string;
    text?: string;
    link?: { type: 'app' | 'url'; value: string };
    size: 'normal' | 'featured';
    alpha?: number;
    placeholder?: boolean;
  }>
}

export function ShelfPreview({
  t, ids, meta, limit, shelfSource, shelfSort,
  hideStatusLine, hideNewBadge, hideCompatIcons, hideNonSteamBadge,
  hideGameNames, hideInstallIndicator, hideSeeMore, hideRefreshCard,
  highlightFirst, highlightAll, highlightedAppIds, onRefresh, onFocusedIndexChange,
  syntheticCards,
}: ShelfPreviewProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const highlightedSet = useMemo(() => new Set(highlightedAppIds), [highlightedAppIds.join(',')])
  // Filter out synthetic sentinels (negative ids) the modal injects into
  // `effectiveManualOrder` for the manual-sort drag grid. The preview
  // splices its own synthetic items below from `syntheticCards[].position`
  // so they appear regardless of the sort mode.
  const gameOnlyIds = useMemo(() => ids.filter((id) => id >= 0), [ids])
  const cappedIds = (typeof limit === 'number' && limit >= 0) ? gameOnlyIds.slice(0, limit) : gameOnlyIds
  const trailingInput = { source: shelfSource, sort: shelfSort, hideSeeMore, hideRefreshCard }
  const showRefresh = shelfSource ? shouldShowRefreshCard(trailingInput) : !hideRefreshCard
  const showMore = shelfSource ? shouldShowMoreCard(trailingInput) : !hideSeeMore

  // Build the items list (game cards + trailing refresh/more) so the
  // shared <ShelfRow> can drive the entire row. Featured sizing comes
  // from the per-game-card branch (preview uses 3.21× cardW for
  // highlighted items, art height stays constant).
  //
  // `discountPercent` is pulled from the same localStorage price cache
  // the home shelf consults — without it the preview's cards would
  // never have discount data, so the green discount badge wouldn't
  // render even when `inlineBadges` is on.
  const rowItems = useMemo<DeckRowItem[]>(() => {
    let priceCache: any = null
    try {
      const raw = (globalThis as any).localStorage?.getItem?.('ds-price-cache-v1')
      if (raw) priceCache = JSON.parse(raw)
    } catch {}
    const readDiscount = (id: number): number | undefined => {
      const d = priceCache?.[id]?.data?.discount
      return typeof d === 'number' && d > 0 ? d : undefined
    }
    const out: DeckRowItem[] = []
    for (const id of cappedIds) {
      const m = meta.get(id)
      if (!m) continue
      const isNew = m.addedTimestamp ? (Date.now() - m.addedTimestamp * 1000) < NEW_GAME_WINDOW_MS : false
      out.push({
        id,
        appid: id,
        name: m.name,
        portraitUrl: m.portraitUrl,
        heroUrl: m.heroUrl,
        isInstalled: m.installed,
        isSteam: m.isSteam,
        deckCompatCategory: m.deckCompatCategory,
        playtimeMinutes: m.playtimeMinutes,
        updatePending: m.updatePending,
        isNew,
        discountPercent: readDiscount(id),
      })
    }
    if (showRefresh) out.push({ id: '__refresh', name: t('refresh'), isRefresh: true, onActivate: onRefresh })
    if (showMore) out.push({ id: '__more', name: t('view_more'), isMoreLink: true })
    // Splice synthetic decoration cards at their persisted `position`
    // slots. Sorted asc so earlier slots splice before later ones (later
    // splice positions stay valid as the array grows). Same logic as
    // Shelf.tsx's home rowItems builder — keeps the preview 1:1 with
    // what the user will see on the home shelf.
    if (syntheticCards && syntheticCards.length) {
      const sorted = syntheticCards.slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      sorted.forEach((c, i) => {
        const pos = Math.max(0, Math.min(out.length, Number(c.position) || 0))
        out.splice(pos, 0, {
          id: `__synth_preview_${i}_${pos}`,
          name: c.text ?? '',
          synthetic: {
            image: c.image,
            text: c.text,
            link: c.link,
            size: c.size === 'featured' ? 'featured' : 'normal',
            alpha: c.alpha,
            placeholder: c.placeholder === true,
          },
        })
      })
    }
    return out
  }, [cappedIds.join(','), meta, showRefresh, showMore, onRefresh, t, JSON.stringify(syntheticCards ?? null)])

  // Keep the focused card in view as the user navigates horizontally — same
  // pattern HighlightRow uses on the home shelf. Without this, fast L/R input
  // scrolls focus past the visible window and Steam's nav loses the card.
  // Instant scroll keeps focus and view in sync at every direction press.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    let raf: number | null = null
    const onFocusIn = (e: Event) => {
      const target = e.target as HTMLElement | null
      const card = target?.closest('.ds-card') as HTMLElement | null
      if (!card || !row.contains(card)) return
      // Emit the focused card's index (sibling position among .ds-card
      // children of the row). Used by EditShelfModal's Decoration tab
      // to decide where to insert the next synthetic card.
      try {
        const cards = Array.from(row.querySelectorAll('.ds-card'))
        const idx = cards.indexOf(card)
        if (idx >= 0) onFocusedIndexChange?.(idx)
      } catch {}
      if (raf !== null) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        raf = null
        try {
          card.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'nearest', inline: 'center' })
        } catch {
          try { card.scrollIntoView({ block: 'nearest', inline: 'center' }) } catch {}
        }
      })
    }
    row.addEventListener('focusin', onFocusIn)
    return () => {
      row.removeEventListener('focusin', onFocusIn)
      if (raf !== null) cancelAnimationFrame(raf)
    }
  }, [onFocusedIndexChange])

  return (
    <div data-ds-shelf-preview="1">
      <style>{PREVIEW_STYLE_TAG}</style>
      <Focusable
        ref={rowRef}
        data-ds-preview-row="1"
        noFocusRing
        onFocus={(e: any) => {
          // When Steam's nav lands on the wrapper, delegate to the first card —
          // same pattern as DeckRow on the home screen.
          if (e.target === e.currentTarget) {
            requestAnimationFrame(() => {
              const first = rowRef.current?.querySelector<HTMLElement>('.ds-card')
              if (first) first.focus()
            })
          }
        }}
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 8,
          overflowX: 'auto',
          overflowY: 'visible',
          scrollbarWidth: 'none',
          // Extra padding-bottom so labels (which sit absolutely below each
          // 110px-tall wrapper at top:100%) aren't clipped by the modal.
          padding: '8px 0 56px',
          alignItems: 'flex-start',
        }}
      >
        <ShelfRow
          items={rowItems}
          cardW={PREVIEW_CARD_W}
          cardH={PREVIEW_ART_H}
          featuredW={FEATURED_CARD_W}
          featuredH={PREVIEW_ART_H}
          highlightFirst={highlightFirst}
          highlightAll={highlightAll}
          highlightedSet={highlightedSet}
          hideStatusLine={hideStatusLine}
          hideNewBadge={hideNewBadge}
          hideCompatIcons={hideCompatIcons}
          hideNonSteamBadge={hideNonSteamBadge}
          hideGameName={hideGameNames}
          hideInstallIndicator={hideInstallIndicator}
          refreshInteractive={!!onRefresh}
          moreInteractive={false}
          inlineBadges
        />
      </Focusable>
    </div>
  )
}
