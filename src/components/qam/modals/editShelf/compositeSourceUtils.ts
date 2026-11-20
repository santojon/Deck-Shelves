import type { SingleDropdownOption } from '../../../../runtime/host/decky';
import type { EditableShelfState } from './types';
import { V3_SOURCE_OPTIONS } from './constants';
import { smartModeIds } from './smartModes';

type SourceUsage = {
  filterCount: number;
  storeCount: number;
  wishlistCount: number;
  usedTabs: Set<string>;
  usedCollections: Set<string>;
  usedExternal: Set<string>;
  usedBuiltin: Set<string>;
  usedSmart: Set<string>;
};

function countAdditionalByType(state: EditableShelfState, type: string, excludeRow?: number | 'primary'): number {
  return state.additionalSources.filter((s: any, i: number) => i !== excludeRow && s?.type === type).length;
}

function primaryContributes(state: EditableShelfState, type: string, excludeRow?: number | 'primary'): number {
  return state.sourceType === type && excludeRow !== 'primary' ? 1 : 0;
}

function collectAdditionalKeys(state: EditableShelfState, type: string, key: string, excludeRow?: number | 'primary'): string[] {
  const out: string[] = [];
  state.additionalSources.forEach((s: any, i: number) => {
    if (i !== excludeRow && s?.type === type) out.push(String(s[key]));
  });
  return out;
}

function usedValues(state: EditableShelfState, type: string, key: string, primaryValue: string, excludeRow?: number | 'primary'): Set<string> {
  const used = new Set<string>(collectAdditionalKeys(state, type, key, excludeRow));
  if (state.sourceType === type && excludeRow !== 'primary' && primaryValue) used.add(primaryValue);
  return used;
}

function computeSourceUsage(state: EditableShelfState, excludeRow?: number | 'primary'): SourceUsage {
  const usedTabs = usedValues(state, 'tab', 'tab', state.tab, excludeRow);
  const usedCollections = usedValues(state, 'collection', 'collectionId', state.collectionId, excludeRow);
  const usedExternal = usedValues(state, 'external', 'sourceId', String(state.externalSourceId ?? ''), excludeRow);
  const usedBuiltin = usedValues(state, 'builtin', 'sourceId', String(state.builtinSourceId ?? ''), excludeRow);
  const usedSmart = new Set<string>(collectAdditionalKeys(state, 'smart', 'mode', excludeRow));
  return {
    filterCount: primaryContributes(state, 'filter', excludeRow) + countAdditionalByType(state, 'filter', excludeRow),
    storeCount: primaryContributes(state, 'store', excludeRow) + countAdditionalByType(state, 'store', excludeRow),
    wishlistCount: primaryContributes(state, 'wishlist', excludeRow) + countAdditionalByType(state, 'wishlist', excludeRow),
    usedTabs,
    usedCollections,
    usedExternal,
    usedBuiltin,
    usedSmart,
  };
}

type LabelFns = {
  collection: string;
  tab: string;
  filter: string;
  external: string;
  builtin: string;
  smart: string;
  wishlistLabel: any;
  storeLabel: any;
};

type Opts = {
  state: EditableShelfState;
  collectionOptions: SingleDropdownOption[];
  tabOptions: SingleDropdownOption[];
  externalOptions: SingleDropdownOption[];
  onlineEnabled: boolean;
  labels: LabelFns;
};

function listSourceOptions(u: SourceUsage, labels: LabelFns): SingleDropdownOption[] {
  const out: SingleDropdownOption[] = [];
  if (u.usedBuiltin.size < V3_SOURCE_OPTIONS.length) out.push({ data: 'builtin', label: labels.builtin });
  if (u.usedSmart.size < smartModeIds().length) out.push({ data: 'smart', label: labels.smart });
  return out;
}

export function buildChildTypeOptions(opts: Opts, excludeRow: number): SingleDropdownOption[] {
  const { state, collectionOptions, tabOptions, externalOptions, onlineEnabled, labels } = opts;
  const u = computeSourceUsage(state, excludeRow);
  const out: SingleDropdownOption[] = [];
  if (collectionOptions.length === 0 || u.usedCollections.size < collectionOptions.length) {
    out.push({ data: 'collection', label: labels.collection });
  }
  if (tabOptions.length === 0 || u.usedTabs.size < tabOptions.length) {
    out.push({ data: 'tab', label: labels.tab });
  }
  if (onlineEnabled) {
    if (u.wishlistCount < 1) out.push({ data: 'wishlist', label: labels.wishlistLabel });
    if (u.storeCount < 1) out.push({ data: 'store', label: labels.storeLabel });
  }
  if (externalOptions.length > 0 && u.usedExternal.size < externalOptions.length) {
    out.push({ data: 'external', label: labels.external });
  }
  out.push(...listSourceOptions(u, labels));
  out.push({ data: 'filter', label: labels.filter });
  return out;
}

export function buildCollectionValueOpts(state: EditableShelfState, collectionOptions: SingleDropdownOption[], excludeRow: number): SingleDropdownOption[] {
  const u = computeSourceUsage(state, excludeRow);
  return collectionOptions.filter((o) => !u.usedCollections.has(String(o.data)));
}

export function buildTabValueOpts(state: EditableShelfState, tabOptions: SingleDropdownOption[], excludeRow: number): SingleDropdownOption[] {
  const u = computeSourceUsage(state, excludeRow);
  return tabOptions.filter((o) => !u.usedTabs.has(String(o.data)));
}

export function builtinValueIds(state: EditableShelfState, excludeRow: number): string[] {
  const u = computeSourceUsage(state, excludeRow);
  return V3_SOURCE_OPTIONS.map((o) => o.value).filter((id) => !u.usedBuiltin.has(id));
}

export function smartValueIds(state: EditableShelfState, excludeRow: number): string[] {
  const u = computeSourceUsage(state, excludeRow);
  return smartModeIds().filter((m) => !u.usedSmart.has(m));
}

export function buildExternalValueOpts(state: EditableShelfState, externalOptions: SingleDropdownOption[], excludeRow: number): SingleDropdownOption[] {
  const u = computeSourceUsage(state, excludeRow);
  return externalOptions.filter((o) => !u.usedExternal.has(String(o.data)));
}

type SourceTypeId = string;

const NEXT_SOURCE_FACTORIES: Record<SourceTypeId, (opts: Opts) => any> = {
  collection: (opts) => {
    const c = buildCollectionValueOpts(opts.state, opts.collectionOptions, -1)[0];
    return { type: 'collection', collectionId: String(c?.data ?? '') };
  },
  tab: (opts) => {
    const tab = buildTabValueOpts(opts.state, opts.tabOptions, -1)[0];
    return { type: 'tab', tab: String(tab?.data ?? 'all') };
  },
  wishlist: () => ({ type: 'wishlist' }),
  store: () => ({ type: 'store' }),
  filter: () => ({ type: 'filter', filter: { sort: 'alphabetical' } }),
  external: (opts) => {
    const e = buildExternalValueOpts(opts.state, opts.externalOptions, -1)[0];
    return { type: 'external', sourceId: String(e?.data ?? '') };
  },
  builtin: (opts) => ({ type: 'builtin', sourceId: builtinValueIds(opts.state, -1)[0] ?? '' }),
  smart: (opts) => ({ type: 'smart', mode: smartValueIds(opts.state, -1)[0] ?? 'recently_played' }),
};

export function pickNextAvailableSource(opts: Opts): any {
  const types = buildChildTypeOptions(opts, -1);
  const t0 = String(types[0]?.data ?? '');
  const factory = NEXT_SOURCE_FACTORIES[t0];
  return factory ? factory(opts) : null;
}

export type ChildSourceType = 'collection' | 'tab' | 'wishlist' | 'store' | 'filter' | 'external' | 'builtin' | 'smart';

const CHILD_SOURCE_TYPES: ReadonlySet<string> = new Set(['collection', 'wishlist', 'store', 'filter', 'external', 'builtin', 'smart']);
const VALUE_KEY: Partial<Record<ChildSourceType, string>> = { collection: 'collectionId', tab: 'tab', external: 'sourceId', builtin: 'sourceId', smart: 'mode' };

export function normalizeChildSourceType(rawType: unknown): ChildSourceType {
  return typeof rawType === 'string' && CHILD_SOURCE_TYPES.has(rawType) ? (rawType as ChildSourceType) : 'tab';
}

export function childSourceNeedsValuePicker(childType: ChildSourceType): boolean {
  return VALUE_KEY[childType] !== undefined;
}

export function childSourceValue(child: any, childType: ChildSourceType): string {
  const key = VALUE_KEY[childType];
  if (!key) return '';
  return String(child?.[key] ?? (childType === 'tab' ? 'all' : ''));
}

export function withChildValue(child: any, childType: ChildSourceType, value: string): any {
  const key = VALUE_KEY[childType];
  return key ? { ...child, [key]: value } : child;
}

const CHILD_SOURCE_LABEL_KEYS: Record<ChildSourceType, string> = {
  collection: 'source_collection',
  tab: 'source_tab',
  wishlist: 'source_wishlist',
  filter: 'source_filter',
  external: 'source_external',
  store: 'source_store',
  builtin: 'source_builtin',
  smart: 'source_smart',
};

export function childSourceTypeLabel(childType: ChildSourceType, t: (key: any) => string): string {
  return t(CHILD_SOURCE_LABEL_KEYS[childType] as any);
}

export function onlineSourceLabel(type: unknown, t: (key: any) => string): string {
  return t(type === 'wishlist' ? 'source_wishlist' : 'source_store');
}

export function primaryFilterLabel(type: unknown, t: (key: any) => string): string {
  if (type === 'wishlist' || type === 'store') return onlineSourceLabel(type, t);
  return t(type === 'tab' ? 'source_tab' : 'source_collection');
}

export type ExclusionFlags = { excludeOwned: boolean; excludeOwnedNonSteam: boolean; hideOwnedNonSteamCloud: boolean };

export function deriveExclusionFlags(src: any): ExclusionFlags {
  const excludeOwned = src?.excludeOwned === true;
  const excludeOwnedNonSteam = excludeOwned && src?.excludeOwnedNonSteam === true;
  const hideOwnedNonSteamCloud = excludeOwnedNonSteam && src?.hideOwnedNonSteamCloud === true;
  return { excludeOwned, excludeOwnedNonSteam, hideOwnedNonSteamCloud };
}

export function onlineAdditionalIndexes(state: EditableShelfState): number[] {
  return state.additionalSources
    .map((s: any, i: number) => ((s?.type === 'wishlist' || s?.type === 'store') ? i : -1))
    .filter((i) => i >= 0);
}

export type FilterTabPlan = {
  showTab: boolean;
  primaryOnline: boolean;
  primaryOffline: boolean;
  allowOnline: boolean;
  tabLabelKey: 'edit_tab_online_filters' | 'edit_tab_additional_filters' | 'edit_tab_filters';
  onlineAdditionalIdx: number[];
  showPostFilter: boolean;
  postFilterInFilters: boolean;
};

// A local shelf with a Filter source already has a Filters tab, so the combined area goes there.
function postFilterInFilterTab(state: EditableShelfState, allowOnline: boolean): boolean {
  if (allowOnline || state.additionalSources.length === 0) return false;
  return state.sourceType === 'filter' || state.additionalSources.some((s: any) => s?.type === 'filter');
}

function filterTabLabel(allowOnline: boolean, showPostFilter: boolean): FilterTabPlan['tabLabelKey'] {
  if (allowOnline) return 'edit_tab_online_filters';
  return showPostFilter ? 'edit_tab_filters' : 'edit_tab_additional_filters';
}

export function resolveFilterTabPlan(state: EditableShelfState): FilterTabPlan {
  const primaryOnline = state.sourceType === 'wishlist' || state.sourceType === 'store';
  const primaryOffline = state.sourceType === 'collection' || state.sourceType === 'tab';
  const onlineAdditionalIdx = onlineAdditionalIndexes(state);
  const compositeOnlineChild = state.additionalSources.length > 0 && (primaryOnline || onlineAdditionalIdx.length > 0);
  const allowOnline = primaryOnline || compositeOnlineChild;
  const postFilterInFilters = postFilterInFilterTab(state, allowOnline);
  const showPostFilter = state.additionalSources.length > 0 && !postFilterInFilters;
  return {
    showTab: primaryOffline || primaryOnline || showPostFilter,
    primaryOnline,
    primaryOffline,
    allowOnline,
    tabLabelKey: filterTabLabel(allowOnline, showPostFilter),
    onlineAdditionalIdx,
    showPostFilter,
    postFilterInFilters,
  };
}

// The source on a row of the editor (-1 is the first one), while it is sorted by hand.
export function orderingChildOf(previewSource: any, row: number | null): any {
  if (row === null || previewSource?.type !== 'composite') return undefined;
  const child = previewSource.sources?.[row + 1];
  const sort = Array.isArray(child?.sort) ? child.sort[0] : child?.sort;
  return sort === 'manual' ? child : undefined;
}

// Only the run that differs from the base order is kept; the games after it follow that order anyway.
export function placedPrefix(next: number[], base: number[]): number[] {
  let last = -1;
  for (let i = 0; i < next.length; i++) if (next[i] !== base[i]) last = i;
  return next.slice(0, last + 1);
}
