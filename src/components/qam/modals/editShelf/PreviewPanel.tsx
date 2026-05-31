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
  // Emitted by the ShelfPreview row whenever focus moves between cards.
  // Used by the Decoration tab to decide where the "+ Add decoration"
  // button should insert the next synthetic card.
  onFocusedIndexChange?: (idx: number) => void
  // Synthetic decoration cards persisted on the shelf — forwarded to
  // ShelfPreview so it can splice them into its row at the right slots.
  syntheticCards?: Array<{
    position: number;
    image?: string;
    text?: string;
    link?: { type: 'app' | 'url'; value: string };
    size: 'normal' | 'featured';
    alpha?: number;
    placeholder?: boolean;
  }>
  // Picker mode for the highlight / hidden tabs. When set, the preview
  // renders the same real cards as every other tab but with a tinted
  // overlay + a click handler that toggles selection. Lets the editor
  // share one render path across tabs instead of branching into mini-
  // card rows that lost the source-tab order.
  selectionMode?: 'highlight' | 'hidden'
  selectionSet?: Set<number>
  onToggleSelection?: (appid: number) => void
  // Forwarded to ShelfPreview's X-button "Remove from shelf" binding +
  // the limit-cap carve-out that always keeps menu-added games visible.
  removableSet?: Set<number>
  onRemoveCard?: (appid: number) => void
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
    limit, shelfSource, shelfSort, onRefresh, onFocusedIndexChange,
    syntheticCards,
    selectionMode, selectionSet, onToggleSelection,
    removableSet, onRemoveCard,
  } = props

  const loading = (
    <div style={{ padding: '6px 0', fontSize: 12, opacity: 0.6 }}>{t('preview_loading')}</div>
  )

  let body: React.ReactNode
  // Manual sort grab mode is the only branch with truly custom UX
  // (long-press grab + L/R shift). Highlight + hidden pickers used to
  // diverge into mini-card rows that didn't share the source-tab order;
  // now they reuse the same ShelfPreview render with a selectionMode
  // overlay so the row stays identical across every editor tab.
  if (resolvedIds.length === 0) {
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
        shelfSource={shelfSource}
        hideStatusLine={hideStatusLine}
        hideNewBadge={hideNewBadge}
        hideCompatIcons={hideCompatIcons}
        hideNonSteamBadge={hideNonSteamBadge}
        hideGameNames={hideGameNames}
        hideInstallIndicator={hideInstallIndicator}
        syntheticCards={syntheticCards}
        removableSet={removableSet}
        onRemoveCard={onRemoveCard}
      />
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
        onFocusedIndexChange={onFocusedIndexChange}
        syntheticCards={syntheticCards}
        selectionMode={selectionMode}
        selectionSet={selectionSet}
        onToggleSelection={onToggleSelection}
        removableSet={removableSet}
        onRemoveCard={onRemoveCard}
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
