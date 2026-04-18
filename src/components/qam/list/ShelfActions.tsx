import { Menu, MenuItem, DialogButton, showContextMenu } from '@decky/ui'
import { icons } from '../icons'
import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf } from '../../../types'
import { DeleteConfirmModal } from '../modals/DeleteConfirmModal'
import { EditShelfModal } from '../modals/EditShelfModal'
import { openManagedModal } from '../common/openManagedModal'

export function showDeleteConfirm(controller: SettingsController, shelf: Shelf) {
  openManagedModal((close) => <DeleteConfirmModal closeModal={close} controller={controller} shelf={shelf} />)
}

export function showEditShelfModal(controller: SettingsController, shelf: Shelf) {
  openManagedModal((close) => <EditShelfModal closeModal={close} controller={controller} shelf={shelf} />)
}

export function ShelfActionsContextMenu({ controller, shelf }: { controller: SettingsController; shelf: Shelf }) {
  const { t, shelves, actions } = controller
  const index = shelves.findIndex((s) => s.id === shelf.id)
  return (
    <Menu label={t('actions')}>
      <MenuItem onSelected={() => showEditShelfModal(controller, shelf)}>{t('editShelf')}</MenuItem>
      <MenuItem onSelected={() => actions.duplicateShelf(shelf.id)}>{t('duplicateShelf')}</MenuItem>
      <MenuItem onSelected={() => actions.toggleShelfHidden(shelf.id)}>{shelf.hidden ? t('show_shelf') : t('hide_shelf')}</MenuItem>
      <MenuItem disabled={index <= 0} onSelected={() => actions.moveShelf(shelf.id, -1)}>{t('move_up')}</MenuItem>
      <MenuItem disabled={index >= shelves.length - 1} onSelected={() => actions.moveShelf(shelf.id, 1)}>{t('move_down')}</MenuItem>
      <MenuItem onSelected={() => showDeleteConfirm(controller, shelf)}>{t('deleteShelf')}</MenuItem>
    </Menu>
  )
}

export function ShelfActionsButton({ controller, shelf }: { controller: SettingsController; shelf: Shelf }) {
  const onClick = () => showContextMenu(<ShelfActionsContextMenu controller={controller} shelf={shelf} />)
  return (
    <DialogButton style={{ height: '40px', minWidth: '40px', width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }} onClick={onClick} onOKButton={onClick} onOKActionDescription='Open shelf options'>
      {icons.ellipsis}
    </DialogButton>
  )
}
