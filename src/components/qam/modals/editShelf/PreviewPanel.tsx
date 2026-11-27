import { ShelfPreview } from './ShelfPreview'
import type { PlatformAppMeta } from '../../../../runtime/platform'
import type { DiscountBadgeMode } from '../../../shelf/discountBadge'

export type PreviewPanelProps = {
  t: (...args: any[]) => any
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
  hideDiscountBadge?: boolean
  discountBadgeMode?: DiscountBadgeMode
  discountBadgeFocusMode?: DiscountBadgeMode | null

  limit?: number
  shelfSource?: any
  shelfSort?: string | string[]
  onRefresh?: () => void
  onFocusedIndexChange?: (idx: number) => void
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
  selectionMode?: 'highlight' | 'hidden'
  selectionSet?: Set<number>
  onToggleSelection?: (appid: number) => void
  removableSet?: Set<number>
  onRemoveCard?: (appid: number) => void
  note?: string
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
    hideDiscountBadge, discountBadgeMode, discountBadgeFocusMode,
    limit, shelfSource, shelfSort, onRefresh, onFocusedIndexChange,
    syntheticCards,
    selectionMode, selectionSet, onToggleSelection,
    removableSet, onRemoveCard,
    note,
  } = props

  const loading = (
    <div style={{ padding: '6px', fontSize: 12, opacity: 0.6 }}>{t('preview_loading')}</div>
  )

  let body: React.ReactNode
  if (resolvedIds.length === 0) {
    body = loading
  } else {
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
        hideDiscountBadge={hideDiscountBadge}
        discountBadgeMode={discountBadgeMode}
        discountBadgeFocusMode={discountBadgeFocusMode}
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
    <div style={{ flexShrink: 0, marginTop: 12 }}>
      {!hideShelfTitle && (
        <div style={{ fontSize: 16, fontWeight: 600, padding: '4px 6px 8px', opacity: 0.92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {title || t('new_shelf')}
        </div>
      )}
      {body}
      {note ? <div style={{ padding: '4px 6px 0', fontSize: 12, opacity: 0.6 }}>{note}</div> : null}
    </div>
  )
}
