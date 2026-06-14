import { ShelfPreview } from './ShelfPreview'
import type { PlatformAppMeta } from '../../../../runtime/platform'

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

  // Picker selection drives `selectionMode` / `selectionSet` / `onToggleSelection`
  // forwarded below; the legacy `highlightPickerOpen` / `hiddenPickerOpen` +
  // alternating-mode + pre-pattern ref props used to drive a separate
  // mini-card render mode here. ShelfPreview now owns the whole picker flow
  // via the unified selection trio, so this surface only forwards what's
  // still consumed.
  alternatingMode: 'odd' | 'even' | null
  hiddenAppIds: number[]

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
    heroImage?: string;
    shadowMode?: 'never' | 'onFocus' | 'always';
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
    alternatingMode: _alternatingMode,
    hiddenAppIds,
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
  } else {
    // Single render path for ALL tabs. Source-tab manual sort just turns
    // ON drag mode; everything else (cap, trailing, synth splice, X
    // buttons, hide flags, discount gating, focus behaviour) renders
    // identically across every tab and across both shelf modal types.
    body = (
      <ShelfPreview
        manualSortMode={isManualSort && activeTab === 'source'}
        onReorder={onReorderManual}
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
        hiddenAppIds={hiddenAppIds}
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
          {title || t('new_shelf')}
        </div>
      )}
      {body}
    </div>
  )
}
