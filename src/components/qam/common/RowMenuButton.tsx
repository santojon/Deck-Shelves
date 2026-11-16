import type { ReactElement } from 'react'
import { DialogButton, showContextMenu } from '../../../runtime/host/decky'
import { BTN_ICON_COMPACT_STYLE } from '../../ui/buttonStyles'
import { icons } from '../icons'

type DataAttributes = { [attribute: `data-${string}`]: string }

const BUTTON_STYLE = { ...BTN_ICON_COMPACT_STYLE, flexShrink: 0 }

export function RowMenuButton({ hint, menu, ...data }: { hint: string; menu: () => ReactElement } & DataAttributes) {
  const open = (evt?: { currentTarget?: EventTarget | null }) => showContextMenu(menu(), evt?.currentTarget ?? undefined)
  return (
    <DialogButton {...data} data-ds-row-menu='1' style={BUTTON_STYLE} onClick={open} onOKButton={open} onOKActionDescription={hint} aria-label={hint}>
      {icons.ellipsis}
    </DialogButton>
  )
}
