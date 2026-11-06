import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf } from '../../../types'
import { ReorderableShelfList } from '../common/ReorderableShelfList'
import { ShelfRowMenuButton } from './ShelfActions'

export function RegularShelfList({ controller }: { controller: SettingsController }) {
  const { shelves, actions, t } = controller
  return (
    <ReorderableShelfList<Shelf>
      items={shelves}
      emptyText={t('no_shelves')}
      renderActions={(shelf) => (
        <ShelfRowMenuButton
          controller={controller}
          shelf={shelf}
          index={shelves.indexOf(shelf)}
          count={shelves.length}
          onMove={(dir) => void actions.moveShelf(shelf.id, dir)}
        />
      )}
      onReorder={actions.reorderShelfIds}
    />
  )
}
