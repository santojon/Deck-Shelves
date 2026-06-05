import { Field, DialogButton, Menu, MenuItem, showContextMenu, Focusable } from '@decky/ui'
import { icons } from '../icons'
import type { SettingsController } from '../../../features/settings/controller'
import type { SavedFilter } from '../../../types'
import { openManagedModal } from '../common/openManagedModal'
import { RenameSavedFilterModal } from '../modals/RenameSavedFilterModal'

/**
 * Single saved-filter row in the QAM Saved Filters section.
 *
 * Mirrors the shelves list visual: label on the left (filter name) and an
 * ellipsis (⋯) button on the right that opens a context menu with Rename
 * and Delete. Reuses the same `Field`/`Focusable`/`DialogButton`/icon
 * primitives that `ShelfActionsButton` and `ShelfListLabel` use, so the
 * two lists look and focus identically.
 */
export function SavedFilterRow({ controller, savedFilter }: { controller: SettingsController; savedFilter: SavedFilter }) {
  const { t, actions } = controller
  const onActions = () => showContextMenu(
    <Menu label={t('actions')}>
      <MenuItem onSelected={() => openManagedModal((close) => <RenameSavedFilterModal closeModal={close} controller={controller} savedFilter={savedFilter} />)}>
        {t('saved_filter_rename')}
      </MenuItem>
      <MenuItem onSelected={() => actions.deleteSavedFilter(savedFilter.id)}>
        {t('saved_filter_delete')}
      </MenuItem>
    </Menu>,
  )
  return (
    <Field className='no-sep'>
      <Focusable style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 16px', boxSizing: 'border-box' }}>
        <div className='deck-shelves-label-cont'>
          <span className='deck-shelves-label-text'>{savedFilter.name}</span>
        </div>
        <DialogButton
          style={{ height: '40px', minWidth: '40px', width: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '10px' }}
          onClick={onActions}
          onOKButton={onActions}
          onOKActionDescription={t('actions')}
        >
          {icons.ellipsis}
        </DialogButton>
      </Focusable>
    </Field>
  )
}
