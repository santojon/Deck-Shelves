import { createContext, forwardRef, useContext, useMemo, type ComponentType, type Context, type ReactNode } from 'react'
import { DialogButton, Dropdown } from '../../runtime/host/decky'

export type DropdownOption = { data: unknown; label: ReactNode }

export type ListRequest = {
  options: DropdownOption[]
  selected: unknown
  label?: string
  anchor: HTMLElement | null
  choose: (option: DropdownOption) => void
}

// Set where a dropdown's list opens somewhere else than Steam's own spot (inside the sidecar).
export const ListOpenerContext = createContext<((request: ListRequest) => void) | null>(null)

const RequestContext = createContext<Omit<ListRequest, 'anchor'> | null>(null)
const NO_STEAM_CONTEXT = createContext<{ DropDownControlButton?: ComponentType<any> } | null>(null)

// Steam's own dropdown button, so the look stays; only the press goes to the list opener.
const ListButton = forwardRef<HTMLElement, any>(function ListButton(props, ref) {
  const open = useContext(ListOpenerContext)
  const request = useContext(RequestContext)
  const steamContext = (Dropdown as { contextType?: Context<{ DropDownControlButton?: ComponentType<any> } | null> }).contextType
  const Button = useContext(steamContext ?? NO_STEAM_CONTEXT)?.DropDownControlButton
  const onClick = (evt?: { currentTarget?: EventTarget | null }) => {
    if (props.disabled || !open || !request) return
    open({ ...request, anchor: (evt?.currentTarget as HTMLElement | null | undefined) ?? null })
  }
  if (Button) return <Button {...props} ref={ref} onClick={onClick} />
  return <DialogButton disabled={props.disabled} onClick={onClick}>{props.children}</DialogButton>
})

export function PanelDropdown({ menuLabel, ...props }: {
  rgOptions: DropdownOption[]
  selectedOption: unknown
  onChange: (option: any) => void
  disabled?: boolean
  menuLabel?: string
}) {
  const open = useContext(ListOpenerContext)
  const request = useMemo(
    () => ({ options: props.rgOptions, selected: props.selectedOption, label: menuLabel, choose: props.onChange }),
    [props.rgOptions, props.selectedOption, menuLabel, props.onChange],
  )
  if (!open) return <Dropdown {...(props as any)} />
  return (
    <RequestContext.Provider value={request}>
      <Dropdown {...(props as any)} renderButton={ListButton} />
    </RequestContext.Provider>
  )
}
