import { SavedFilterRowMenuButton } from './SavedFilterRowMenu'

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
  return (
    <div className='deck-shelves-bare-row'>
      <div className='deck-shelves-nameplate'>
        <span className='deck-shelves-nameplate-text'>{name}</span>
      </div>
      <SavedFilterRowMenuButton t={t} renameLabel={renameLabel} deleteLabel={deleteLabel} onRename={onRename} onDelete={onDelete} />
    </div>
  )
}
