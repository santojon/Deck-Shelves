import { DropdownItem, type SingleDropdownOption } from '../../runtime/host/decky'
import type { FilterItemType } from '../../types'
import i18n from '../../i18n'
import { OnlineIcon } from '../icons'
import { optionData } from '../qam/modals/editShelf/utils'
import { ALL_FILTER_TYPES, isOnlineFeatureFilterType, isOnlineFilterType } from './utils'
import { pluginFilterTypeIds, typeName } from './pluginTypes'

interface TypeGates {
  allowOnlineFilters: boolean
  onlineFeaturesOn: boolean
  only?: readonly FilterItemType[]
}

function allowed(type: FilterItemType, gates: TypeGates): boolean {
  if (gates.only && !gates.only.includes(type)) return false
  if (isOnlineFilterType(type)) return gates.allowOnlineFilters
  if (isOnlineFeatureFilterType(type)) return gates.onlineFeaturesOn
  return true
}

// The current type always stays on offer so a stored condition still reads right.
export function offeredTypes(current: string, gates: TypeGates, language = i18n.language): { type: string; name: string }[] {
  const types: string[] = ALL_FILTER_TYPES.filter((type) => type === current || allowed(type, gates))
  if (!gates.only) types.push(...pluginFilterTypeIds())
  if (!types.includes(current)) types.push(current)
  const collator = new Intl.Collator(language)
  return types
    .map((type) => ({ type, name: typeName(type) }))
    .sort((a, b) => collator.compare(a.name, b.name))
}

const needsOnline = (type: string) => isOnlineFilterType(type) || isOnlineFeatureFilterType(type)

export function ConditionTypePicker({ type, onChange, ...gates }: { type: string; onChange: (type: string) => void } & TypeGates) {
  const options: SingleDropdownOption[] = offeredTypes(type, gates).map((choice) => ({
    data: choice.type,
    label: needsOnline(choice.type)
      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><OnlineIcon size={14} style={{ opacity: 0.7 }} />{choice.name}</span>
      : choice.name,
  }))
  return (
    <DropdownItem
      label={i18n.t('filter_condition_type')}
      rgOptions={options}
      selectedOption={type}
      onChange={(option: unknown) => {
        const next = String(optionData(option))
        if (next !== type) onChange(next)
      }}
      bottomSeparator='none'
    />
  )
}
