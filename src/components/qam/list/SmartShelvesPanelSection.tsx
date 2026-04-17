import React from 'react'
import { ReorderableList, ReorderableEntry, Menu, MenuItem, DialogButton, showContextMenu, showModal } from '@decky/ui'
import type { SettingsController } from '../../../features/settings/controller'
import type { SmartShelf } from '../../../types'
import { logInfo } from '../../../runtime/logger'
import { DeleteConfirmSmartModal } from '../modals/DeleteConfirmSmartModal'
import { ShelfListLabel } from '../common/ShelfListLabel'
import { icons } from '../icons'

function openManagedModal(render: (close: () => void) => React.ReactElement) {
  let handle: any = null
  const close = () => {
    try {
      if (typeof handle === 'function') return handle()
      if (handle?.Close) return handle.Close()
      if (handle?.closeModal) return handle.closeModal()
      if (handle?.props?.closeModal) return handle.props.closeModal()
    } catch (e) { logInfo("SETTINGS", "modal close failed", String(e)) }
  }
  handle = showModal(render(close))
  return close
}

type EntryData = { id: string }

function SmartShelfActionsContextMenu({ controller, shelf }: { controller: SettingsController; shelf: SmartShelf }) {
  const { t, settings, actions } = controller
  const smartShelves: SmartShelf[] = settings?.smartShelves ?? []
  const index = smartShelves.findIndex((s) => s.id === shelf.id)
  return (
    <Menu label={t('actions')}>
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

  function SmartEntryInteractables({ entry }: { entry: ReorderableEntry<EntryData> }) {
    const shelf = smartShelves.find((s) => s.id === entry.data!.id)
    return shelf ? <SmartShelfActionsButton controller={controller} shelf={shelf} /> : null
  }

  const entries: ReorderableEntry<EntryData>[] = smartShelves.map((shelf, idx) => ({
    label: <ShelfListLabel shelf={shelf} />,
    position: idx,
    data: { id: shelf.id },
  }))

  return (
    <div className='deck-shelves-shelf-list'>
      {entries.length ? (
        <ReorderableList<EntryData>
          entries={entries}
          interactables={SmartEntryInteractables}
          onSave={(nextEntries: ReorderableEntry<EntryData>[]) =>
            actions.reorderSmartShelfIds(nextEntries.map((e) => e.data!.id))
          }
        />
      ) : (
        <div className='deck-shelves-empty'>{t('smart_no_shelves')}</div>
      )}
    </div>
  )
}
