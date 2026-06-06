// Composite-source exhaustion + "+ Add source" picker helpers for
// EditShelfModal. Each single-instance type (filter/wishlist/store) is
// capped at one across primary + additional rows; tab/collection are
// capped at the total catalog size.
import type { SingleDropdownOption } from '../../../../runtime/host/decky';
import type { EditableShelfState } from './types';

export type SourceUsage = {
  filterCount: number;
  storeCount: number;
  wishlistCount: number;
  usedTabs: Set<string>;
  usedCollections: Set<string>;
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

/** Counts source-type usage across primary + additional rows, with an
 *  optional `excludeRow` so a row can see itself as "free". */
export function computeSourceUsage(state: EditableShelfState, excludeRow?: number | 'primary'): SourceUsage {
  const usedTabs = new Set<string>(collectAdditionalKeys(state, 'tab', 'tab', excludeRow));
  if (state.sourceType === 'tab' && excludeRow !== 'primary') usedTabs.add(state.tab);
  const usedCollections = new Set<string>(collectAdditionalKeys(state, 'collection', 'collectionId', excludeRow));
  if (state.sourceType === 'collection' && excludeRow !== 'primary') usedCollections.add(state.collectionId);
  return {
    filterCount: primaryContributes(state, 'filter', excludeRow) + countAdditionalByType(state, 'filter', excludeRow),
    storeCount: primaryContributes(state, 'store', excludeRow) + countAdditionalByType(state, 'store', excludeRow),
    wishlistCount: primaryContributes(state, 'wishlist', excludeRow) + countAdditionalByType(state, 'wishlist', excludeRow),
    usedTabs,
    usedCollections,
  };
}

type LabelFns = {
  collection: string;
  tab: string;
  filter: string;
  wishlistLabel: any;
  storeLabel: any;
};

type Opts = {
  state: EditableShelfState;
  collectionOptions: SingleDropdownOption[];
  tabOptions: SingleDropdownOption[];
  onlineEnabled: boolean;
  labels: LabelFns;
};

/** Builds the source-type dropdown for an additional-source slot,
 *  hiding types that have hit their cap. */
export function buildChildTypeOptions(opts: Opts, excludeRow: number): SingleDropdownOption[] {
  const { state, collectionOptions, tabOptions, onlineEnabled, labels } = opts;
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
  if (u.filterCount < 1) out.push({ data: 'filter', label: labels.filter });
  return out;
}

/** Filters the collection picker for a row to entries not already in use. */
export function buildCollectionValueOpts(state: EditableShelfState, collectionOptions: SingleDropdownOption[], excludeRow: number): SingleDropdownOption[] {
  const u = computeSourceUsage(state, excludeRow);
  return collectionOptions.filter((o) => !u.usedCollections.has(String(o.data)));
}

/** Filters the tab picker for a row to entries not already in use. */
export function buildTabValueOpts(state: EditableShelfState, tabOptions: SingleDropdownOption[], excludeRow: number): SingleDropdownOption[] {
  const u = computeSourceUsage(state, excludeRow);
  return tabOptions.filter((o) => !u.usedTabs.has(String(o.data)));
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
};

/** First-available source descriptor used when "+ Add source" is clicked.
 *  Returns `null` when every type is exhausted. */
export function pickNextAvailableSource(opts: Opts): any {
  const types = buildChildTypeOptions(opts, -1);
  const t0 = String(types[0]?.data ?? '');
  const factory = NEXT_SOURCE_FACTORIES[t0];
  return factory ? factory(opts) : null;
}
