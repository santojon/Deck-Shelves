import type { SettingsController } from '../../../features/settings/controller'
import type { Shelf, SmartShelf } from '../../../types'
import { ReorderableShelfList } from '../common/ReorderableShelfList'
import { ShelfActionsButton } from './ShelfActions'
import { Menu, MenuItem, DialogButton, showContextMenu } from '../../../runtime/host/decky'
import { DeleteConfirmSmartModal } from '../modals/DeleteConfirmSmartModal'
import { EditSmartShelfModal } from '../modals/EditSmartShelfModal'
import { icons } from '../icons'
import { openManagedModal } from '../common/openManagedModal'

type UnifiedItem = (Shelf | SmartShelf) & { _kind: 'normal' | 'smart' }

function SmartActions({ controller, shelf }: { controller: SettingsController; shelf: SmartShelf }) {
  const { t, settings, actions } = controller
  const list: SmartShelf[] = settings?.smartShelves ?? []
  const idx = list.findIndex((s) => s.id === shelf.id)
  const onClick = () => showContextMenu(
    <Menu label={shelf.title || t('actions')}>
      <MenuItem onSelected={() => openManagedModal((close) => <EditSmartShelfModal closeModal={close} controller={controller} shelf={shelf} />)}>{t('edit_shelf')}</MenuItem>
      <MenuItem onSelected={() => actions.toggleSmartShelfHidden(shelf.id)}>{shelf.hidden ? t('show_shelf') : t('hide_shelf')}</MenuItem>
      <MenuItem disabled={idx <= 0} onSelected={() => actions.moveSmartShelf(shelf.id, -1)}>{t('move_up')}</MenuItem>
      <MenuItem disabled={idx >= list.length - 1} onSelected={() => actions.moveSmartShelf(shelf.id, 1)}>{t('move_down')}</MenuItem>
      <MenuItem onSelected={() => openManagedModal((close) => <DeleteConfirmSmartModal closeModal={close} controller={controller} shelf={shelf} />)}>{t('delete_shelf')}</MenuItem>
    </Menu>
  )
  return (
    <DialogButton
      data-ds-smart-actions='true'
      style={{ height: '40px', minWidth: '40px', width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}
      onClick={onClick}
      onOKButton={onClick}
      onOKActionDescription={controller.t('open_options')}
    >
      {icons.ellipsis}
    </DialogButton>
  )
}

export function UnifiedShelvesPanelSection({ controller }: { controller: SettingsController }) {
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

  const handleReorder = (ids: string[]) => {
    void (controller.actions as any).setAllShelvesOrder?.(ids)
  }

  return (
    <ReorderableShelfList<UnifiedItem>
      items={ordered as any}
      emptyText={t('no_shelves')}
      renderActions={(item) =>
        item._kind === 'smart'
          ? <SmartActions controller={controller} shelf={item as SmartShelf} />
          : <ShelfActionsButton controller={controller} shelf={item as Shelf} />
      }
      onReorder={handleReorder}
    />
  )
}
