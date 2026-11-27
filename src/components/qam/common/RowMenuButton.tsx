import type { ReactElement } from 'react'
import { DialogButton, showContextMenu } from '../../../runtime/host/decky'
import { BTN_ICON_COMPACT_STYLE } from '../../ui/buttonStyles'
import { icons } from '../icons'
import { collapseQamSidecar } from '../qamExpandedStore'

type DataAttributes = { [attribute: `data-${string}`]: string }

const BUTTON_STYLE = { ...BTN_ICON_COMPACT_STYLE, flexShrink: 0 }
const SIDECAR_CLOSE_MS = 250

// The menu opens in the main window and the panel steps aside, as for Steam's own menus. An open
// sidecar is a menu of the panel itself and keeps the panel up, so it closes first.
function openRowMenu(menu: ReactElement, anchor: EventTarget | undefined): void {
  if (collapseQamSidecar()) setTimeout(() => showContextMenu(menu, anchor), SIDECAR_CLOSE_MS)
  else showContextMenu(menu, anchor)
}

export function RowMenuButton({ hint, menu, ...data }: { hint: string; menu: () => ReactElement } & DataAttributes) {
  const open = (evt?: { currentTarget?: EventTarget | null }) => openRowMenu(menu(), evt?.currentTarget ?? undefined)
  return (
    <DialogButton {...data} data-ds-row-menu='1' style={BUTTON_STYLE} onClick={open} onOKButton={open} onOKActionDescription={hint} aria-label={hint}>
      {icons.ellipsis}
    </DialogButton>
  )
}
