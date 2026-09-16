/* Composite-source exhaustion + "+ Add source" picker helpers for
   EditShelfModal. Each single-instance type (filter/wishlist/store) is
   capped at one across primary + additional rows; tab/collection are
   capped at the total catalog size. */
import type { SingleDropdownOption } from '../../../../runtime/host/decky';
import type { EditableShelfState } from './types';

export type SourceUsage = {
  filterCount: number;
  storeCount: number;
  wishlistCount: number;
  usedTabs: Set<string>;
  usedCollections: Set<string>;
  usedExternal: Set<string>;
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

export function computeSourceUsage(state: EditableShelfState, excludeRow?: number | 'primary'): SourceUsage {
  const usedTabs = new Set<string>(collectAdditionalKeys(state, 'tab', 'tab', excludeRow));
  if (state.sourceType === 'tab' && excludeRow !== 'primary') usedTabs.add(state.tab);
  const usedCollections = new Set<string>(collectAdditionalKeys(state, 'collection', 'collectionId', excludeRow));
  if (state.sourceType === 'collection' && excludeRow !== 'primary') usedCollections.add(state.collectionId);
  const usedExternal = new Set<string>(collectAdditionalKeys(state, 'external', 'sourceId', excludeRow));
  if (state.sourceType === 'external' && excludeRow !== 'primary' && state.externalSourceId) usedExternal.add(String(state.externalSourceId));
  return {
    filterCount: primaryContributes(state, 'filter', excludeRow) + countAdditionalByType(state, 'filter', excludeRow),
    storeCount: primaryContributes(state, 'store', excludeRow) + countAdditionalByType(state, 'store', excludeRow),
    wishlistCount: primaryContributes(state, 'wishlist', excludeRow) + countAdditionalByType(state, 'wishlist', excludeRow),
    usedTabs,
    usedCollections,
    usedExternal,
  };
}

type LabelFns = {
  collection: string;
  tab: string;
  filter: string;
  external: string;
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
  // External (plugin-registered) sources — offer until the catalog is
  // exhausted (each external source can be stacked once).
  if (externalOptions.length > 0 && u.usedExternal.size < externalOptions.length) {
    out.push({ data: 'external', label: labels.external });
  }
  // Filter has no cap: it's the one source that's fully composable internally
  // (AND/OR + many criteria), and the user can stack as many as they want.
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
};

export function pickNextAvailableSource(opts: Opts): any {
  const types = buildChildTypeOptions(opts, -1);
  const t0 = String(types[0]?.data ?? '');
  const factory = NEXT_SOURCE_FACTORIES[t0];
  return factory ? factory(opts) : null;
}

// ── Additional-source row helpers (composite "source 2+" rows) ─────────────

export type ChildSourceType = 'collection' | 'tab' | 'wishlist' | 'store' | 'filter' | 'external';

const CHILD_SOURCE_TYPES: ReadonlySet<string> = new Set(['collection', 'wishlist', 'store', 'filter', 'external']);

export function normalizeChildSourceType(rawType: unknown): ChildSourceType {
  return typeof rawType === 'string' && CHILD_SOURCE_TYPES.has(rawType) ? (rawType as ChildSourceType) : 'tab';
}

export function childSourceNeedsValuePicker(childType: ChildSourceType): boolean {
  return childType === 'collection' || childType === 'tab' || childType === 'external';
}

export function childSourceValue(child: any, childType: ChildSourceType): string {
  if (childType === 'collection') return String(child?.collectionId ?? '');
  if (childType === 'tab') return String(child?.tab ?? 'all');
  if (childType === 'external') return String(child?.sourceId ?? '');
  return '';
}

const CHILD_SOURCE_LABEL_KEYS: Record<ChildSourceType, string> = {
  collection: 'source_collection',
  tab: 'source_tab',
  wishlist: 'source_wishlist',
  filter: 'source_filter',
  external: 'source_external',
  store: 'source_store',
};

export function childSourceTypeLabel(childType: ChildSourceType, t: (key: any) => string): string {
  return t(CHILD_SOURCE_LABEL_KEYS[childType] as any);
}

// Primary/additional-row label for the two online-only source types — used
// by both the "exclude owned" toggle blocks and the online-filters tab,
// which each need to tell a wishlist row from a store row.
export function onlineSourceLabel(type: unknown, t: (key: any) => string): string {
  return t(type === 'wishlist' ? 'source_wishlist' : 'source_store');
}

export type ExclusionFlags = { excludeOwned: boolean; excludeOwnedNonSteam: boolean; hideOwnedNonSteamCloud: boolean };

// An inner flag can only be true when its parent is: hiding non-Steam-cloud
// entries implies hiding non-Steam entries implies excluding owned at all.
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

// Filters-tab (childFilters) visibility/plan: shows for a direct online or
// offline (collection/tab) source, or a composite with an online child —
// bundled once since each case edits a different `childFilter` slot set.

export type FilterTabPlan = {
  showTab: boolean;
  primaryOnline: boolean;
  primaryOffline: boolean;
  allowOnline: boolean;
  tabLabelKey: 'edit_tab_online_filters' | 'edit_tab_additional_filters';
  onlineAdditionalIdx: number[];
};

export function resolveFilterTabPlan(state: EditableShelfState): FilterTabPlan {
  const primaryOnline = state.sourceType === 'wishlist' || state.sourceType === 'store';
  const primaryOffline = state.sourceType === 'collection' || state.sourceType === 'tab';
  const onlineAdditionalIdx = onlineAdditionalIndexes(state);
  const compositeOnlineChild = state.additionalSources.length > 0 && (primaryOnline || onlineAdditionalIdx.length > 0);
  const allowOnline = primaryOnline || compositeOnlineChild;
  return {
    showTab: primaryOffline || primaryOnline || compositeOnlineChild,
    primaryOnline,
    primaryOffline,
    allowOnline,
    tabLabelKey: allowOnline ? 'edit_tab_online_filters' : 'edit_tab_additional_filters',
    onlineAdditionalIdx,
  };
}
