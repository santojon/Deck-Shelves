import { Field, DialogButton, Menu, MenuItem, showContextMenu, Focusable } from '@decky/ui'
import { icons } from '../icons'
import type { SettingsController } from '../../../features/settings/controller'
import type { SavedSmartFilter } from '../../../types'
import { openManagedModal } from '../common/openManagedModal'
import { RenameSavedSmartFilterModal } from '../modals/RenameSavedSmartFilterModal'

/**
 * Single saved-smart-filter row in the QAM Saved Smart Filters section.
 * Mirrors `SavedFilterRow` shape so both lists look and focus identically.
 */
export function SavedSmartFilterRow({ controller, savedSmartFilter }: { controller: SettingsController; savedSmartFilter: SavedSmartFilter }) {
  const { t, actions } = controller
  const onActions = () => showContextMenu(
    <Menu label={t('actions')}>
      <MenuItem onSelected={() => openManagedModal((close) => <RenameSavedSmartFilterModal closeModal={close} controller={controller} savedSmartFilter={savedSmartFilter} />)}>
        {t('saved_smart_filter_rename' as any)}
      </MenuItem>
      <MenuItem onSelected={() => actions.deleteSavedSmartFilter(savedSmartFilter.id)}>
        {t('saved_smart_filter_delete' as any)}
      </MenuItem>
    </Menu>,
  )
  return (
    <Field className='no-sep'>
      <Focusable style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 16px', boxSizing: 'border-box' }}>
        <div className='deck-shelves-label-cont'>
          <span className='deck-shelves-label-text'>{savedSmartFilter.name}</span>
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
