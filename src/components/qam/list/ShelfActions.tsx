import { Menu, MenuItem, DialogButton, showContextMenu } from '@decky/ui'
import { icons } from '../icons'
import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf } from '../../../types'
import { DeleteConfirmModal } from '../modals/DeleteConfirmModal'
import { EditShelfModal } from '../modals/EditShelfModal'
import { openManagedModal } from '../common/openManagedModal'
import { clearOnlineShelfCache } from '../../../core/shelfActions'
import { invalidateRandomSortCache } from '../../../steam'
import { invalidateSmartShelfCache } from '../../../steam/smartShelves'
import { triggerShelfRefresh } from '../../../core/shelfRefresh'

function isOnlineSource(source: any): boolean {
  return source?.type === 'wishlist' || source?.type === 'store'
}

function isRandomOrSmart(shelf: Shelf): boolean {
  const src: any = shelf.source
  if (src?.type === 'smart') return true
  if (shelf.sort === 'random') return true
  if (src?.type === 'filter' && src?.filter?.sort === 'random') return true
  return false
}

function refreshShelfCache(shelf: Shelf): void {
  if (isOnlineSource(shelf.source)) {
    clearOnlineShelfCache()
    return
  }
  if ((shelf.source as any)?.type === 'smart') {
    invalidateSmartShelfCache(shelf.id)
  } else {
    invalidateRandomSortCache(shelf.id)
  }
  try { triggerShelfRefresh() } catch {}
}

export function showDeleteConfirm(controller: SettingsController, shelf: Shelf) {
  openManagedModal((close) => <DeleteConfirmModal closeModal={close} controller={controller} shelf={shelf} />)
}

export function showEditShelfModal(controller: SettingsController, shelf: Shelf) {
  openManagedModal((close) => <EditShelfModal closeModal={close} controller={controller} shelf={shelf} />)
}

export function ShelfActionsContextMenu({ controller, shelf }: { controller: SettingsController; shelf: Shelf }) {
  const { t, shelves, actions } = controller
  const index = shelves.findIndex((s) => s.id === shelf.id)
  const showRefresh = isOnlineSource(shelf.source) || isRandomOrSmart(shelf)
  return (
    <Menu label={t('actions')}>
      <MenuItem onSelected={() => showEditShelfModal(controller, shelf)}>{t('editShelf')}</MenuItem>
      <MenuItem onSelected={() => actions.duplicateShelf(shelf.id)}>{t('duplicateShelf')}</MenuItem>
      <MenuItem onSelected={() => actions.toggleShelfHidden(shelf.id)}>{shelf.hidden ? t('show_shelf') : t('hide_shelf')}</MenuItem>
      <MenuItem disabled={index <= 0} onSelected={() => actions.moveShelf(shelf.id, -1)}>{t('move_up')}</MenuItem>
      <MenuItem disabled={index >= shelves.length - 1} onSelected={() => actions.moveShelf(shelf.id, 1)}>{t('move_down')}</MenuItem>
      {showRefresh && (
        <MenuItem onSelected={() => refreshShelfCache(shelf)}>
          {isOnlineSource(shelf.source) ? t('refresh_cache') : t('refresh')}
        </MenuItem>
      )}
      <MenuItem onSelected={() => showDeleteConfirm(controller, shelf)}>{t('deleteShelf')}</MenuItem>
    </Menu>
  )
}

export function ShelfActionsButton({ controller, shelf }: { controller: SettingsController; shelf: Shelf }) {
  const onClick = () => showContextMenu(<ShelfActionsContextMenu controller={controller} shelf={shelf} />)
  return (
    <DialogButton data-ds-shelf-actions='true' style={{ height: '40px', minWidth: '40px', width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }} onClick={onClick} onOKButton={onClick} onOKActionDescription={controller.t('open_shelf_options')}>
      {icons.ellipsis}
    </DialogButton>
  )
}
