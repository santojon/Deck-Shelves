import { ShelfPreview } from './ShelfPreview'
import { ManualSortRow } from './ManualSortRow'
import { HighlightRow } from './HighlightRow'
import { HighlightMiniCard } from './HighlightMiniCard'
import type { PlatformAppMeta } from '../../../../runtime/platform'
import type { MutableRefObject } from 'react'

/**
 * Bottom preview region rendered by both `EditShelfModal` and
 * `EditSmartShelfModal`. Picks one of five render modes based on the
 * active tab and which picker is open:
 * - hidden picker (Display tab): mini-card row of overshoot candidates
 * - loading: when the shelf hasn't resolved any apps yet
 * - manual sort (Source tab + sort='manual'): drag-to-reorder row
 * - highlight picker (Visual tab): mini-card row for selecting featured games
 * - default: the shared `ShelfPreview` with display flags applied
 *
 * State is owned by the parent — every callback / id list flows in through
 * props. Adding a new mode means editing one place instead of two modals.
 */
export type PreviewPanelProps = {
  t: (k: any, opts?: any) => string
  title: string
  hideShelfTitle: boolean
  activeTab: string

  resolvedIds: number[]
  effectiveManualOrder: number[]
  resolvedMeta: Map<number, PlatformAppMeta>

  isManualSort: boolean
  onReorderManual: (next: number[]) => void

  highlightFirst: boolean
  highlightAll: boolean
  highlightedAppIds: number[]

  highlightPickerOpen: boolean
  setHighlightedAppIds: (next: number[]) => void
  alternatingMode: 'odd' | 'even' | null
  setAlternatingMode: (m: 'odd' | 'even' | null) => void
  prePatternHighlightsRef: MutableRefObject<number[] | null>

  hiddenPickerOpen: boolean
  hiddenAppIds: number[]
  setHiddenAppIds: (next: number[]) => void
  hiddenCandidateIds: number[]
  hiddenCandidateMeta: Map<number, { name: string; portraitUrl?: string; heroUrl?: string }>

  hideStatusLine: boolean
  hideNewBadge: boolean
  hideCompatIcons: boolean
  hideNonSteamBadge: boolean
  hideGameNames: boolean
  hideInstallIndicator: boolean
  hideSeeMore: boolean
  hideRefreshCard: boolean

  // Forwarded to ShelfPreview so it caps the rendered count to the active
  // limit and applies the same trailing-card rules as Shelf.tsx (refreshable
  // smart, random non-smart, deterministic smart, etc.).
  limit?: number
  shelfSource?: any
  shelfSort?: string | string[]
  // When provided, the preview's RefreshCard becomes focusable and clicking
  // it re-resolves the preview's app ids (parent owns the resolver).
  onRefresh?: () => void
}

export function PreviewPanel(props: PreviewPanelProps) {
  const {
    t, title, hideShelfTitle, activeTab,
    resolvedIds, effectiveManualOrder, resolvedMeta,
    isManualSort, onReorderManual,
    highlightFirst, highlightAll, highlightedAppIds,
    highlightPickerOpen, setHighlightedAppIds,
    alternatingMode: _alternatingMode, setAlternatingMode, prePatternHighlightsRef,
    hiddenPickerOpen, hiddenAppIds, setHiddenAppIds,
    hiddenCandidateIds, hiddenCandidateMeta,
    hideStatusLine, hideNewBadge, hideCompatIcons, hideNonSteamBadge,
    hideGameNames, hideInstallIndicator, hideSeeMore, hideRefreshCard,
    limit, shelfSource, shelfSort, onRefresh,
  } = props

  const loading = (
    <div style={{ padding: '6px 0', fontSize: 12, opacity: 0.6 }}>{t('preview_loading')}</div>
  )

  let body: React.ReactNode
  if (activeTab === 'display' && hiddenPickerOpen) {
    body = hiddenCandidateIds.length === 0 ? loading : (
      <HighlightRow>
        {hiddenCandidateIds.map((id, idx) => {
          const isHidden = hiddenAppIds.includes(id)
          const inHighlighted = highlightedAppIds.includes(id)
          const featured = highlightAll || (highlightFirst && idx === 0) || inHighlighted
          const meta = hiddenCandidateMeta.get(id)
          return (
            <HighlightMiniCard
              key={id}
              appid={id}
              name={meta?.name ?? `App ${id}`}
              portraitUrl={meta?.portraitUrl}
              heroUrl={meta?.heroUrl}
              featured={featured}
              selected={false}
              hiddenMark={isHidden}
              width={featured ? 250 : 78}
              height={110}
              onToggle={() => setHiddenAppIds(
                isHidden
                  ? hiddenAppIds.filter((x) => x !== id)
                  : [...hiddenAppIds, id]
              )}
            />
          )
        })}
      </HighlightRow>
    )
  } else if (resolvedIds.length === 0) {
    body = loading
  } else if (isManualSort && activeTab === 'source') {
    body = (
      <ManualSortRow
        order={effectiveManualOrder}
        meta={resolvedMeta as any}
        onReorder={onReorderManual}
        t={t}
        highlightFirst={highlightFirst}
        highlightAll={highlightAll}
        highlightedAppIds={highlightedAppIds}
        highlightPickerOpen={highlightPickerOpen}
      />
    )
  } else if (activeTab === 'visual' && highlightPickerOpen) {
    body = (
      <HighlightRow>
        {effectiveManualOrder.map((id, idx) => {
          const inHighlighted = highlightedAppIds.includes(id)
          const selected = inHighlighted
          const featured = highlightAll || (highlightFirst && idx === 0) || inHighlighted
          const meta = resolvedMeta.get(id)
          const toggle = () => {
            setAlternatingMode(null)
            prePatternHighlightsRef.current = null
            setHighlightedAppIds(
              highlightedAppIds.includes(id)
                ? highlightedAppIds.filter((x) => x !== id)
                : [...highlightedAppIds, id]
            )
          }
          return (
            <HighlightMiniCard
              key={id}
              appid={id}
              name={meta?.name ?? `App ${id}`}
              portraitUrl={meta?.portraitUrl}
              heroUrl={meta?.heroUrl}
              featured={featured}
              selected={selected}
              width={featured ? 250 : 78}
              height={110}
              onToggle={toggle}
            />
          )
        })}
      </HighlightRow>
    )
  } else {
    body = (
      <ShelfPreview
        t={t}
        ids={effectiveManualOrder}
        meta={resolvedMeta}
        limit={limit}
        shelfSource={shelfSource}
        shelfSort={shelfSort}
        hideStatusLine={hideStatusLine}
        hideNewBadge={hideNewBadge}
        hideCompatIcons={hideCompatIcons}
        hideNonSteamBadge={hideNonSteamBadge}
        hideGameNames={hideGameNames}
        hideInstallIndicator={hideInstallIndicator}
        hideSeeMore={hideSeeMore}
        hideRefreshCard={hideRefreshCard}
        highlightFirst={highlightFirst}
        highlightAll={highlightAll}
        highlightedAppIds={highlightedAppIds}
        onRefresh={onRefresh}
      />
    )
  }

  return (
    <div style={{ flexShrink: 0, padding: '0 24px' }}>
      {!hideShelfTitle && (
        <div style={{ fontSize: 16, fontWeight: 600, padding: '4px 0 8px', opacity: 0.92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title || t('newShelf')}
        </div>
      )}
      {body}
    </div>
  )
}
