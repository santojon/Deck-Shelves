import { DialogButton, Focusable } from '../../../../runtime/host/decky'
import i18n from '../../../../i18n'
import { icons } from '../../icons'

const iconButtonStyle = {
  height: 40,
  minWidth: 40,
  width: 40,
  display: 'flex' as const,
  justifyContent: 'center' as const,
  alignItems: 'center' as const,
  padding: 0,
  flexShrink: 0,
}

export function SortDirectionButton({
  sort,
  reverse,
  onChange,
}: {
  sort: string
  reverse: boolean
  onChange: (next: boolean) => void
}) {
  if (sort === 'manual' || sort === 'random') return null
  const t = i18n.t.bind(i18n)
  const aria = t(reverse ? 'sort_direction_asc' : 'sort_direction_desc')
  return (
    <Focusable style={{ marginLeft: 8 }}>
      <DialogButton
        onClick={() => onChange(!reverse)}
        onOKButton={() => onChange(!reverse)}
        onOKActionDescription={aria}
        style={iconButtonStyle}
      >
        {reverse ? icons.sortAsc : icons.sortDesc}
      </DialogButton>
    </Focusable>
  )
}
