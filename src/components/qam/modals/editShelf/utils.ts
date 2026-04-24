/**
 * Decky's DropdownItem onChange callback is typed as `unknown` — it can
 * receive either the option object `{ data, label }` or the bare `data`
 * value depending on build. This helper normalizes both shapes.
 */
export function optionData(option: unknown) {
  return (option as any)?.data ?? option
}
