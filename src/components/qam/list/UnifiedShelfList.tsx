import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf, SmartShelf } from '../../../types'
import { ReorderableShelfList } from '../common/ReorderableShelfList'
import { ShelfRowMenuButton } from './ShelfActions'
import { SmartShelfRowMenuButton } from './SmartShelfRowMenu'

type UnifiedItem = (Shelf | SmartShelf) & { _kind: 'normal' | 'smart' }

export function UnifiedShelfList({ controller }: { controller: SettingsController }) {
  const { settings, shelves, t } = controller
  const smarts: SmartShelf[] = (settings as any)?.smartShelves ?? []
  const order: string[] = ((settings as any)?.allShelvesOrder ?? []) as string[]
  const combined: UnifiedItem[] = [
    ...shelves.map((s) => ({ ...s, _kind: 'normal' as const })),
    ...smarts.map((s) => ({ ...s, _kind: 'smart'  as const })),
  ]
  const byId = new Map(combined.map((s) => [s.id, s]))
  const ordered: UnifiedItem[] = order.length > 0
    ? order.map((id) => byId.get(id)).filter(Boolean).concat(combined.filter((s) => !order.includes(s.id))) as UnifiedItem[]
    : combined
  const listIds = ordered.map((item) => item.id)

  const handleReorder = (ids: string[]) => {
    void (controller.actions as any).setAllShelvesOrder?.(ids)
  }
  // Up and down walk this list's own order, the one a drag saves.
  const moveInList = (id: string, dir: -1 | 1) => {
    const from = listIds.indexOf(id)
    const to = from + dir
    if (from < 0 || to < 0 || to >= listIds.length) return
    const next = listIds.slice()
    next[from] = listIds[to]
    next[to] = id
    handleReorder(next)
  }

  return (
    <ReorderableShelfList<UnifiedItem>
      items={ordered as any}
      emptyText={t('no_shelves')}
      renderActions={(item) => {
        const place = { index: listIds.indexOf(item.id), count: listIds.length, onMove: (dir: -1 | 1) => moveInList(item.id, dir) }
        return item._kind === 'smart'
          ? <SmartShelfRowMenuButton controller={controller} shelf={item as SmartShelf} {...place} />
          : <ShelfRowMenuButton controller={controller} shelf={item as Shelf} {...place} />
      }}
      onReorder={handleReorder}
    />
  )
}
