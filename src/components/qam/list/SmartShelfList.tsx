import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelf } from '../../../types'
import { ReorderableShelfList } from '../common/ReorderableShelfList'
import { SmartShelfRowMenuButton } from './SmartShelfRowMenu'

export function SmartShelfList({ controller }: { controller: SettingsController }) {
  const { settings, actions, t } = controller
  const smartShelves: SmartShelf[] = settings?.smartShelves ?? []
  return (
    <ReorderableShelfList<SmartShelf>
      items={smartShelves}
      emptyText={t('smart_no_shelves')}
      renderActions={(shelf) => (
        <SmartShelfRowMenuButton
          controller={controller}
          shelf={shelf}
          index={smartShelves.indexOf(shelf)}
          count={smartShelves.length}
          onMove={(dir) => void actions.moveSmartShelf(shelf.id, dir)}
        />
      )}
      onReorder={actions.reorderSmartShelfIds}
    />
  )
}
