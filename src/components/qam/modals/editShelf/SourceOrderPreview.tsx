import { useEffect, useMemo, useState } from 'react'
import { applySourceManualOrder, resolveShelfAppIds } from '../../../../steam'
import type { PlatformApi, PlatformAppMeta } from '../../../../runtime/platform'
import { PreviewPanel } from './PreviewPanel'
import { enrichOnlineNames, fetchMetaForIds } from './usePreviewResolution'
import { placedPrefix } from './compositeSourceUtils'
import type { previewHideFlags } from './sharedEditProps'

// Enough to pick a few games from a long list; a source keeps 50 at most.
const ORDER_VIEW_CAP = 100
const NO_IDS: number[] = []

const isOnlineSource = (s: any): boolean => s?.type === 'wishlist' || s?.type === 'store'

// The source alone, read the way the shelf reads it, without its limit or its placed games.
function readSourceGames(source: any, shelfId: string, hiddenKey: string): Promise<number[]> {
  const { manualOrder: _m, limit: _l, ...rest } = source
  const hiddenAppIds = hiddenKey ? hiddenKey.split(',').map(Number) : undefined
  return resolveShelfAppIds({ type: 'composite', combine: 'union', sources: [rest] } as any, ORDER_VIEW_CAP, 'source_order', shelfId, undefined, { hiddenAppIds })
}

export type SourceOrdering = {
  active: boolean
  ids: number[]
  meta: Map<number, PlatformAppMeta>
  onReorder: (next: number[]) => void
}

export function useSourceOrdering({ child, shelfId, platform, nonce, hiddenAppIds, onChange }: {
  child: any
  shelfId: string
  platform: PlatformApi
  nonce: number
  hiddenAppIds: number[]
  onChange: (manualOrder: number[]) => void
}): SourceOrdering {
  const baseKey = child ? JSON.stringify({ ...child, manualOrder: undefined }) : ''
  const hiddenKey = hiddenAppIds.join(',')
  const [baseIds, setBaseIds] = useState<number[]>(NO_IDS)
  const [meta, setMeta] = useState<Map<number, PlatformAppMeta>>(() => new Map())

  useEffect(() => {
    setBaseIds(NO_IDS)
    if (!baseKey) return
    let cancelled = false
    const timer = setTimeout(() => {
      readSourceGames(JSON.parse(baseKey), shelfId, hiddenKey)
        .then((ids) => { if (!cancelled) setBaseIds(ids) })
        .catch(() => { if (!cancelled) setBaseIds(NO_IDS) })
    }, 150)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [baseKey, shelfId, nonce, hiddenKey])

  const online = isOnlineSource(child)
  useEffect(() => {
    if (!baseIds.length) { setMeta((m) => (m.size ? new Map() : m)); return }
    let cancelled = false
    void fetchMetaForIds(platform, baseIds).then((rows) => {
      if (!cancelled) setMeta(online ? enrichOnlineNames(rows).meta : new Map(rows))
    })
    return () => { cancelled = true }
  }, [platform, baseIds, online])

  const placed: number[] | undefined = child?.manualOrder
  const placedKey = placed ? placed.join(',') : ''
  const ids = useMemo(() => applySourceManualOrder(baseIds, placed), [baseIds, placedKey])
  return { active: !!child, ids, meta, onReorder: (next) => onChange(placedPrefix(next, baseIds)) }
}

// The preview while one source is ordered by hand: its games alone, in a row the user rearranges.
export function SourceOrderPreview({ t, row, limit, source, ordering, look }: {
  t: (...args: any[]) => any
  row: number
  limit: number | undefined
  source: any
  ordering: SourceOrdering
  look: ReturnType<typeof previewHideFlags>
}) {
  const name = `${t('composite_source_label')} ${row + 2}`
  const title = limit ? t('composite_source_ordering_limit', { source: name, limit }) : t('composite_source_ordering', { source: name })
  return (
    <PreviewPanel
      t={t}
      title={title}
      hideShelfTitle={false}
      activeTab='source'
      resolvedIds={ordering.ids}
      effectiveManualOrder={ordering.ids}
      resolvedMeta={ordering.meta}
      isManualSort
      onReorderManual={ordering.onReorder}
      highlightFirst={false}
      highlightAll={false}
      highlightedAppIds={NO_IDS}
      alternatingMode={null}
      hiddenAppIds={NO_IDS}
      {...look}
      hideSeeMore
      hideRefreshCard
      shelfSource={source}
    />
  )
}
