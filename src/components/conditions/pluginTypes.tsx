import { Component, type ReactNode } from 'react'
import i18n from '../../i18n'
import { isKnownFilterType, type FilterItem, type FilterItemType } from '../../types'
import { getThirdPartyFilterTypes, type ExternalFilterTypeDescriptor } from '../../core/pluginApi'
import { descriptorName } from '../../core/descriptorName'
import { logWarn } from '../../runtime/logger'
import { getTypeLabel, isConditionComplete, startingOptions } from './utils'

type Params = Record<string, any>
type EditorProps = { params: Params; onChange: (next: Params) => void }

export function pluginFilterType(type: string): ExternalFilterTypeDescriptor | undefined {
  return isKnownFilterType(type) ? undefined : getThirdPartyFilterTypes().find((d) => d.id === type)
}

export function pluginFilterTypeIds(): string[] {
  return getThirdPartyFilterTypes().map((d) => d.id)
}

export function typeName(type: string): string {
  const d = pluginFilterType(type)
  return d ? descriptorName((k) => String(i18n.t(k)), d) : getTypeLabel(type)
}

export function startingParams(type: string): Params {
  const d = pluginFilterType(type)
  return d ? { ...(d.defaultParams ?? {}) } : startingOptions(type as FilterItemType)
}

// A plugin's condition offers Negate only when it says so; a negated one can always be undone.
export function negatable(type: string): boolean {
  const d = pluginFilterType(type)
  return !d || d.invertible === true
}

export function canNegate(item: FilterItem): boolean {
  return negatable(item.type) || item.inverted === true
}

export function isComplete(item: FilterItem): boolean {
  return pluginFilterType(item.type) ? true : isConditionComplete(item)
}

class FieldsBoundary extends Component<{ children?: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { logWarn('SETTINGS', 'plugin condition fields failed', String(error)) }
  render() { return this.state.failed ? null : this.props.children }
}

function PluginEditor({ render, ...props }: EditorProps & { render: NonNullable<ExternalFilterTypeDescriptor['renderEditor']> }) {
  return <>{render(props) as ReactNode}</>
}

// The plugin's fields run in a component and boundary of their own: its hooks never join ours, a failure stays in the row.
export function PluginFields({ type, ...props }: EditorProps & { type: string }) {
  const render = pluginFilterType(type)?.renderEditor
  return render ? <FieldsBoundary><PluginEditor render={render} {...props} /></FieldsBoundary> : null
}
