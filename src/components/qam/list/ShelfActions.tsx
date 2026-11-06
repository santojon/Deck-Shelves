import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf } from '../../../types'
import { Menu, MenuGroup, MenuItem, MenuSeparator } from '../../../runtime/host/decky'
import { DeleteConfirmModal } from '../modals/DeleteConfirmModal'
import { EditShelfModal } from '../modals/EditShelfModal'
import { confirmAction } from '../modals/ConfirmActionModal'
import { openManagedModal } from '../common/openManagedModal'
import { RowMenuButton } from '../common/RowMenuButton'
import { clearOnlineShelfCache } from '../../../core/shelfActions'
import { invalidateRandomSortCache } from '../../../steam'
import { invalidateSmartShelfCache } from '../../../steam/smartShelves'
import { triggerShelfRefresh } from '../../../core/shelfRefresh'
import { isOnlineSource } from '../../../domain/sourceUtils'

function isRandomOrSmart(shelf: Shelf): boolean {
  const src: any = shelf.source
  if (src?.type === 'smart') return true
  if (shelf.sort === 'random') return true
  if (src?.type === 'filter' && src?.filter?.sort === 'random') return true
  return false
}

function refreshShelfCache(shelf: Shelf): void {
  if (isOnlineSource(shelf.source)) clearOnlineShelfCache()
  if ((shelf.source as any)?.type === 'smart') invalidateSmartShelfCache(shelf.id)
  /* Always clear random-sort cache for THIS shelf so refresh genuinely
     re-shuffles; the previous code only ran this branch on offline,
     non-smart shelves, so a wishlist/store/smart shelf using random sort
     stayed in the same order until the 24h TTL expired. */
  invalidateRandomSortCache(shelf.id)
  try { triggerShelfRefresh({ manual: true, shelfId: shelf.id }) } catch {}
}

export function showDeleteConfirm(controller: SettingsController, shelf: Shelf) {
  openManagedModal((close) => <DeleteConfirmModal closeModal={close} controller={controller} shelf={shelf} />)
}

export function showEditShelfModal(controller: SettingsController, shelf: Shelf) {
  openManagedModal((close) => <EditShelfModal closeModal={close} controller={controller} shelf={shelf} />)
}

export function showComposeConfirm(controller: SettingsController, source: Shelf, target: Shelf) {
  const { t, actions } = controller
  confirmAction({
    title: t('compose_with_confirm_title'),
    body: t('compose_with_confirm_body', { source: source.title, target: target.title }),
    okText: t('compose_with'),
    cancelText: t('cancel'),
    onConfirm: () => void actions.composeShelfWith(source.id, target.id),
  })
}

type ShelfRowMenuProps = {
  controller: SettingsController
  shelf: Shelf
  // The row's place in the list it is shown in, and how that list moves it.
  index: number
  count: number
  onMove: (dir: -1 | 1) => void
}

export function ShelfRowMenu({ controller, shelf, index, count, onMove }: ShelfRowMenuProps) {
  const { t, actions, shelves } = controller
  const others = shelves.filter((other) => other.id !== shelf.id)
  const online = isOnlineSource(shelf.source)
  return (
    <Menu label={shelf.title.trim() || t('actions')} cancelText={t('cancel')}>
      <MenuItem onSelected={() => showEditShelfModal(controller, shelf)}>{t('edit_shelf')}</MenuItem>
      {others.length > 0 && (
        <MenuGroup label={t('compose_with')}>
          {others.map((target) => (
            <MenuItem key={target.id} onSelected={() => showComposeConfirm(controller, shelf, target)}>{target.title}</MenuItem>
          ))}
        </MenuGroup>
      )}
      <MenuSeparator />
      <MenuItem disabled={index <= 0} onSelected={() => onMove(-1)}>{t('move_up')}</MenuItem>
      <MenuItem disabled={index >= count - 1} onSelected={() => onMove(1)}>{t('move_down')}</MenuItem>
      <MenuSeparator />
      <MenuItem onSelected={() => void actions.toggleShelfHidden(shelf.id)}>{t(shelf.hidden ? 'show_shelf' : 'hide_shelf')}</MenuItem>
      {(online || isRandomOrSmart(shelf)) && (
        <MenuItem onSelected={() => refreshShelfCache(shelf)}>{t(online ? 'refresh_cache' : 'refresh')}</MenuItem>
      )}
      <MenuSeparator />
      <MenuItem onSelected={() => void actions.duplicateShelf(shelf.id)}>{t('duplicate_shelf')}</MenuItem>
      <MenuItem onSelected={() => showDeleteConfirm(controller, shelf)}>{t('delete_shelf')}</MenuItem>
    </Menu>
  )
}

export function ShelfRowMenuButton(props: ShelfRowMenuProps) {
  return <RowMenuButton hint={props.controller.t('actions')} data-ds-shelf-actions={props.shelf.id} menu={() => <ShelfRowMenu {...props} />} />
}
