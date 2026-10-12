import { Field, DialogButton, Menu, MenuItem, showContextMenu, Focusable } from '../../../runtime/host/decky'
import { icons } from '../icons'

/* One list row for a saved preset (filter or smart filter): the name and an
   actions button whose menu offers rename and delete. */
export function SavedPresetRow({ t, name, renameLabel, deleteLabel, onRename, onDelete }: {
  t: (k: any) => string
  name: string
  renameLabel: string
  deleteLabel: string
  onRename: () => void
  onDelete: () => void
}) {
  const onActions = () => showContextMenu(
    <Menu label={t('actions')}>
      <MenuItem onSelected={onRename}>{renameLabel}</MenuItem>
      <MenuItem onSelected={onDelete}>{deleteLabel}</MenuItem>
    </Menu>,
  )
  return (
    <Field className='no-sep'>
      <Focusable style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '0 16px', boxSizing: 'border-box' }}>
        <div className='deck-shelves-label-cont'>
          <span className='deck-shelves-label-text'>{name}</span>
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
