import { useEffect, useRef } from 'react'
import { Focusable } from '@decky/ui'
import { GameCard } from '../../../shelf/GameCard'
import { MoreCard } from '../../../shelf/MoreCard'
import { RefreshCard } from '../../../shelf/RefreshCard'
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
`

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
  shelfSort?: string
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
}

export function ShelfPreview({
  t, ids, meta, limit, shelfSource, shelfSort,
  hideStatusLine, hideNewBadge, hideCompatIcons, hideNonSteamBadge,
  hideGameNames, hideInstallIndicator, hideSeeMore, hideRefreshCard,
  highlightFirst, highlightAll, highlightedAppIds, onRefresh,
}: ShelfPreviewProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const highlightedSet = new Set(highlightedAppIds)
  const cappedIds = (typeof limit === 'number' && limit >= 0) ? ids.slice(0, limit) : ids
  const trailingInput = { source: shelfSource, sort: shelfSort, hideSeeMore, hideRefreshCard }
  const showRefresh = shelfSource ? shouldShowRefreshCard(trailingInput) : !hideRefreshCard
  const showMore = shelfSource ? shouldShowMoreCard(trailingInput) : !hideSeeMore

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
  }, [])

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
        {cappedIds.map((id, idx) => {
          // Always render — fall back to a minimal record if meta hasn't
          // landed yet (shelf type / cold cache) so the user still sees the
          // card slot rather than nothing.
          const m: PlatformAppMeta = meta.get(id) ?? { appid: id, name: `App ${id}` }
          const isNew = m.addedTimestamp ? (Date.now() - m.addedTimestamp * 1000) < NEW_GAME_WINDOW_MS : false
          const item: DeckRowItem = {
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
          }
          const isFeatured = highlightAll || (highlightFirst && idx === 0) || highlightedSet.has(id)
          return (
            <GameCard
              key={id}
              item={item}
              cardW={isFeatured ? FEATURED_CARD_W : PREVIEW_CARD_W}
              // Wrapper = image only; label sits absolutely at top:100% so the
              // focus ring stays on the image (matches home shelf behaviour).
              cardH={PREVIEW_ART_H}
              featured={isFeatured}
              hideStatusLine={hideStatusLine}
              hideNewBadge={hideNewBadge}
              hideCompatIcons={hideCompatIcons}
              hideNonSteamBadge={hideNonSteamBadge}
              hideGameName={hideGameNames}
              hideInstallIndicator={hideInstallIndicator}
            />
          )
        })}
        {showRefresh && (
          <RefreshCard
            key="__refresh"
            item={{ id: '__refresh', name: t('refresh'), onActivate: onRefresh }}
            cardW={PREVIEW_CARD_W}
            cardH={PREVIEW_ART_H}
            interactive={!!onRefresh}
          />
        )}
        {showMore && (
          <MoreCard
            key="__more"
            item={{ id: '__more', name: t('view_more') }}
            cardW={PREVIEW_CARD_W}
            cardH={PREVIEW_ART_H}
            interactive={false}
          />
        )}
      </Focusable>
    </div>
  )
}
