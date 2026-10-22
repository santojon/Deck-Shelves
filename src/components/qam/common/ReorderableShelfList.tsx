import { useRef, type ReactNode } from 'react'
import { GrabReorderList } from '../../ui/GrabReorderList'
import { ShelfListLabel } from './ShelfListLabel'
import { useContainerDragReorder } from '../../../core/reorder'

export function ReorderableShelfList<T extends { id: string; title?: string; hidden?: boolean }>({
  items,
  emptyText,
  renderActions,
  onReorder,
  renderLabel,
}: {
  items: T[]
  emptyText: string
  renderActions: (item: T) => ReactNode
  onReorder: (ids: string[]) => void
  // Defaults to the shelf label; other lists (e.g. profiles) pass their own.
  renderLabel?: (item: T) => ReactNode
}) {
  const listRef = useRef<HTMLDivElement>(null)
  // Touch and mouse hold-drag; the controller grab lives in GrabReorderList.
  const { grabbedId } = useContainerDragReorder<string>({
    containerRef: listRef,
    itemSelector: '[data-ds-shelf-row]',
    getItemId: (el) => el.getAttribute('data-ds-shelf-row'),
    getOrder: () => items.map((s) => s.id),
    onReorder,
    axis: 'vertical',
    allowedPointerTypes: ['mouse', 'touch'],
  })

  const markedLabel = (item: T) => (
    <div
      data-ds-shelf-row={item.id}
      style={grabbedId === item.id ? { opacity: 0.6 } : undefined}
    >
      {renderLabel ? renderLabel(item) : <ShelfListLabel shelf={item} />}
    </div>
  )

  return (
    <div ref={listRef} className='deck-shelves-shelf-list'>
      {items.length ? (
        <GrabReorderList<T>
          items={items}
          getId={(item) => item.id}
          renderLabel={markedLabel}
          renderActions={renderActions}
          onReorder={onReorder}
        />
      ) : (
        <div className='deck-shelves-empty'>{emptyText}</div>
      )}
    </div>
  )
}
