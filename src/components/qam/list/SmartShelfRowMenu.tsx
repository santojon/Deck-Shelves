import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelf } from '../../../types'
import { Menu, MenuItem } from '../../../runtime/host/decky'
import { openManagedModal } from '../common/openManagedModal'
import { RowMenuButton } from '../common/RowMenuButton'
import { DeleteConfirmSmartModal } from '../modals/DeleteConfirmSmartModal'
import { EditSmartShelfModal } from '../modals/EditSmartShelfModal'

type SmartShelfRowMenuProps = {
  controller: SettingsController
  shelf: SmartShelf
  index: number
  count: number
  onMove: (dir: -1 | 1) => void
}

export function SmartShelfRowMenu({ controller, shelf, index, count, onMove }: SmartShelfRowMenuProps) {
  const { t, actions } = controller
  const edit = () => openManagedModal((close) => <EditSmartShelfModal closeModal={close} controller={controller} shelf={shelf} />)
  const remove = () => openManagedModal((close) => <DeleteConfirmSmartModal closeModal={close} controller={controller} shelf={shelf} />)
  return (
    <Menu label={shelf.title.trim() || t('actions')} cancelText={t('cancel')}>
      <MenuItem onSelected={edit}>{t('edit_shelf')}</MenuItem>
      <MenuItem onSelected={() => void actions.toggleSmartShelfHidden(shelf.id)}>{t(shelf.hidden ? 'show_shelf' : 'hide_shelf')}</MenuItem>
      <MenuItem disabled={index <= 0} onSelected={() => onMove(-1)}>{t('move_up')}</MenuItem>
      <MenuItem disabled={index >= count - 1} onSelected={() => onMove(1)}>{t('move_down')}</MenuItem>
      <MenuItem onSelected={remove}>{t('delete_shelf')}</MenuItem>
    </Menu>
  )
}

export function SmartShelfRowMenuButton(props: SmartShelfRowMenuProps) {
  return <RowMenuButton hint={props.controller.t('actions')} data-ds-smart-actions={props.shelf.id} menu={() => <SmartShelfRowMenu {...props} />} />
}
