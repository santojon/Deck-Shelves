import { useEffect, useRef } from 'react'
import { Focusable } from '@decky/ui'
import { GameCard } from '../../../shelf/GameCard'
import { MoreCard } from '../../../shelf/MoreCard'
import { RefreshCard } from '../../../shelf/RefreshCard'
import type { DeckRowItem } from '../../../shelf/types'
import type { PlatformAppMeta } from '../../../../runtime/platform'

const NEW_GAME_WINDOW_MS = 30 * 24 * 60 * 60 * 1000
// Portrait card. Featured cards are 3.21× wider — same ratio the home shelf
// uses to keep landscape hero art at the right ~2.14:1 aspect.
const PREVIEW_CARD_W = 78
const PREVIEW_CARD_H = 168
const PREVIEW_ART_H = 110
const FEATURED_CARD_W = Math.round(PREVIEW_CARD_W * 3.21)

// Scoped overrides — shrink MoreCard/RefreshCard text and the refresh icon to
// match the smaller preview footprint without touching the home-screen
// originals (which need their full sizes).
const PREVIEW_STYLE_TAG = `
[data-ds-preview-row="1"] .ds-card-art { padding: 6px !important; }
[data-ds-preview-row="1"] .ds-more-card-text { font-size: 10px !important; line-height: 1.2 !important; }
[data-ds-preview-row="1"] .ds-refresh-card svg { width: 22px !important; height: 22px !important; }
[data-ds-preview-row="1"] .ds-card-status-icon svg { width: 11px !important; height: 11px !important; }
[data-ds-preview-row="1"] .ds-card-status { font-size: 11px !important; }
[data-ds-preview-row="1"] .ds-card-label-name { font-size: 12px !important; line-height: 1.2 !important; }
`

export interface ShelfPreviewProps {
  t: (k: any, opts?: any) => string
  ids: number[]
  meta: Map<number, PlatformAppMeta>
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
}

export function ShelfPreview({
  t, ids, meta,
  hideStatusLine, hideNewBadge, hideCompatIcons, hideNonSteamBadge,
  hideGameNames, hideInstallIndicator, hideSeeMore, hideRefreshCard,
  highlightFirst, highlightAll, highlightedAppIds,
}: ShelfPreviewProps) {
  const rowRef = useRef<HTMLDivElement>(null)
  const highlightedSet = new Set(highlightedAppIds)

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
          overflowY: 'hidden',
          scrollbarWidth: 'none',
          padding: '8px 0 16px',
          alignItems: 'flex-start',
        }}
      >
        {ids.map((id, idx) => {
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
              cardH={PREVIEW_CARD_H}
              artH={PREVIEW_ART_H}
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
        {!hideSeeMore && (
          <MoreCard
            key="__more"
            item={{ id: '__more', name: t('view_more') }}
            cardW={PREVIEW_CARD_W}
            cardH={PREVIEW_ART_H}
          />
        )}
        {!hideRefreshCard && (
          <RefreshCard
            key="__refresh"
            item={{ id: '__refresh', name: t('refresh') }}
            cardW={PREVIEW_CARD_W}
            cardH={PREVIEW_ART_H}
          />
        )}
      </Focusable>
    </div>
  )
}
