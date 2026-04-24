import { Menu, MenuItem, DialogButton, showContextMenu } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelf } from '../../../types'
import { DeleteConfirmSmartModal } from '../modals/DeleteConfirmSmartModal'
import { EditSmartShelfModal } from '../modals/EditSmartShelfModal'
import { icons } from '../icons'
import { openManagedModal } from '../common/openManagedModal'
import { ReorderableShelfList } from '../common/ReorderableShelfList'

function SmartShelfActionsContextMenu({ controller, shelf }: { controller: SettingsController; shelf: SmartShelf }) {
  const { t, settings, actions } = controller
  const smartShelves: SmartShelf[] = settings?.smartShelves ?? []
  const index = smartShelves.findIndex((s) => s.id === shelf.id)
  return (
    <Menu label={t('actions')}>
      <MenuItem onSelected={() => openManagedModal((close) => <EditSmartShelfModal closeModal={close} controller={controller} shelf={shelf} />)}>
        {t('editShelf')}
      </MenuItem>
      <MenuItem onSelected={() => actions.toggleSmartShelfHidden(shelf.id)}>
        {shelf.hidden ? t('show_shelf') : t('hide_shelf')}
      </MenuItem>
      <MenuItem disabled={index <= 0} onSelected={() => actions.moveSmartShelf(shelf.id, -1)}>
        {t('move_up')}
      </MenuItem>
      <MenuItem disabled={index >= smartShelves.length - 1} onSelected={() => actions.moveSmartShelf(shelf.id, 1)}>
        {t('move_down')}
      </MenuItem>
      <MenuItem onSelected={() => openManagedModal((close) => <DeleteConfirmSmartModal closeModal={close} controller={controller} shelf={shelf} />)}>
        {t('deleteShelf')}
      </MenuItem>
    </Menu>
  )
}

function SmartShelfActionsButton({ controller, shelf }: { controller: SettingsController; shelf: SmartShelf }) {
  const onClick = () => showContextMenu(<SmartShelfActionsContextMenu controller={controller} shelf={shelf} />)
  return (
    <DialogButton
      style={{ height: '40px', minWidth: '40px', width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}
      onClick={onClick}
      onOKButton={onClick}
      onOKActionDescription='Open options'
    >
      {icons.ellipsis}
    </DialogButton>
  )
}

export function SmartShelvesPanelSection({ controller }: { controller: SettingsController }) {
  const { settings, actions, t } = controller
  const smartShelves: SmartShelf[] = settings?.smartShelves ?? []
  return (
    <ReorderableShelfList<SmartShelf>
      items={smartShelves}
      emptyText={t('smart_no_shelves')}
      renderActions={(shelf) => <SmartShelfActionsButton controller={controller} shelf={shelf} />}
      onReorder={actions.reorderSmartShelfIds}
    />
  )
}
