import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf } from '../../../types'
import { ReorderableShelfList } from '../common/ReorderableShelfList'
import { ShelfActionsButton } from './ShelfActions'

export function ShelvesPanelSection({ controller }: { controller: SettingsController }) {
  const { shelves, actions, t } = controller
  return (
    <ReorderableShelfList<Shelf>
      items={shelves}
      emptyText={t('no_shelves')}
      renderActions={(shelf) => <ShelfActionsButton controller={controller} shelf={shelf} />}
      onReorder={actions.reorderShelfIds}
    />
  )
}
