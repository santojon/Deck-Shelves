import type { SingleDropdownOption } from '../../../../runtime/host/decky'
import type { SmartShelfMode } from '../../../../types'
import { getThirdPartySmartSources, type SmartShelfSourceDescriptor } from '../../../../core/pluginApi'
import { descriptorName } from '../../../../core/descriptorName'
import { DEFAULT_SORT_FOR_MODE, SMART_PARAM_DEFAULTS, SMART_PARAM_META, paramKeysForMode } from '../../../../steam/smartParams'
import { SMART_MODE_OPTIONS } from './constants'

type Translate = (key: string, options?: Record<string, unknown>) => string

export type SmartParamControl = {
  label: string
  unit: string
  min: number
  max: number
  step: number
  kind?: 'slider' | 'text' | 'dropdown'
  options?: { data: number; label: string }[]
}

// Built-in: the mode has its own parameter defaults, which every mode the schema runs has.
function isBuiltInMode(id: string): id is SmartShelfMode {
  return Object.prototype.hasOwnProperty.call(SMART_PARAM_DEFAULTS, id)
}

function pluginMode(id: string): SmartShelfSourceDescriptor | undefined {
  return getThirdPartySmartSources().find((d) => d.id === id)
}

export function smartModeIds(): string[] {
  return [...SMART_MODE_OPTIONS, ...getThirdPartySmartSources().map((d) => d.id)]
}

export function smartModeName(t: Translate, id: string): string {
  if (isBuiltInMode(id)) return t(`smart_template_${id}`)
  const d = pluginMode(id)
  return d ? descriptorName(t, d) : t('filter_type_unavailable', { type: id })
}

// A saved mode nothing offers stays selectable, named as unavailable.
export function smartModeChoices(t: Translate, current?: string): SingleDropdownOption[] {
  const ids = smartModeIds()
  if (current && !ids.includes(current) && !isBuiltInMode(current)) ids.push(current)
  return ids.map((id) => ({ data: id, label: smartModeName(t, id) }))
}

export function smartModeDefaults(id: string): Record<string, number> {
  if (isBuiltInMode(id)) return SMART_PARAM_DEFAULTS[id] ?? {}
  return { ...(pluginMode(id)?.defaultParams ?? {}) }
}

// With nothing answering for the mode, the saved keys are kept so a save writes them back.
export function smartParamKeys(id: string, saved?: Record<string, number>): string[] {
  if (isBuiltInMode(id)) return paramKeysForMode(id)
  const d = pluginMode(id)
  if (!d) return Object.keys(saved ?? {})
  return [...new Set([...Object.keys(d.defaultParams ?? {}), ...Object.keys(d.paramMeta ?? {})])]
}

function builtInControl(t: Translate, key: string): SmartParamControl | null {
  const m = SMART_PARAM_META[key]
  if (!m) return null
  return {
    label: t(m.labelKey), unit: m.unitKey ? t(m.unitKey) : '', min: m.min, max: m.max, step: m.step, kind: m.kind,
    options: m.options?.map((o) => ({ data: o.value, label: t(o.labelKey) })),
  }
}

function pluginControl(id: string, key: string): SmartParamControl | null {
  const p = pluginMode(id)?.paramMeta?.[key]
  if (!p || ![p.min, p.max, p.step].every(Number.isFinite)) return null
  return { label: String(p.label ?? key), unit: p.unit ?? '', min: p.min, max: p.max, step: p.step }
}

export function smartParamControl(t: Translate, id: string, key: string): SmartParamControl | null {
  return isBuiltInMode(id) ? builtInControl(t, key) : pluginControl(id, key)
}

// A plugin's mode starts in its own order.
export function defaultSortForMode(id: string): string {
  return isBuiltInMode(id) ? (DEFAULT_SORT_FOR_MODE[id] ?? 'alphabetical') : 'source_order'
}
