import type { ReactElement } from 'react'
import { DialogButton, showContextMenu } from '../../../runtime/host/decky'
import { BTN_ICON_COMPACT_STYLE } from '../../ui/buttonStyles'
import { icons } from '../icons'

type DataAttributes = { [attribute: `data-${string}`]: string }

const BUTTON_STYLE = { ...BTN_ICON_COMPACT_STYLE, flexShrink: 0 }

/* The control at the end of a list row. The menu is built when it opens, so it
   reflects the item at that moment, and the client places it next to the control. */
export function RowMenuButton({ hint, menu, ...data }: { hint: string; menu: () => ReactElement } & DataAttributes) {
  const open = (evt?: { currentTarget?: EventTarget | null }) => showContextMenu(menu(), evt?.currentTarget ?? undefined)
  return (
    <DialogButton {...data} style={BUTTON_STYLE} onClick={open} onOKButton={open} onOKActionDescription={hint} aria-label={hint}>
      {icons.down}
    </DialogButton>
  )
}
