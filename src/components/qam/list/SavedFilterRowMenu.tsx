import { Menu, MenuItem } from '../../../runtime/host/decky'
import { RowMenuButton } from '../common/RowMenuButton'

type SavedFilterRowMenuProps = {
  t: (k: any) => string
  renameLabel: string
  deleteLabel: string
  onRename: () => void
  onDelete: () => void
}

export function SavedFilterRowMenu({ t, renameLabel, deleteLabel, onRename, onDelete }: SavedFilterRowMenuProps) {
  return (
    <Menu label={t('actions')} cancelText={t('cancel')}>
      <MenuItem onSelected={onRename}>{renameLabel}</MenuItem>
      <MenuItem onSelected={onDelete}>{deleteLabel}</MenuItem>
    </Menu>
  )
}

export function SavedFilterRowMenuButton(props: SavedFilterRowMenuProps) {
  return <RowMenuButton hint={props.t('actions')} menu={() => <SavedFilterRowMenu {...props} />} />
}
