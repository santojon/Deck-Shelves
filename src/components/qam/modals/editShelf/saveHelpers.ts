// Pure data transformations for EditShelfModal's save path. Extracted
// to keep the modal under the 1000-line cap. No React, no host APIs.
import type { Shelf, ShelfFilter, FilterGroup } from '../../../../types';
import type { EditableShelfState } from './types';
import { filterGroupToFilter } from '../../../../domain/settings';

export function primarySortKey(sort: unknown): string | undefined {
  if (Array.isArray(sort)) return typeof sort[0] === 'string' ? sort[0] : undefined;
  return typeof sort === 'string' ? sort : undefined;
}

export function isStateManualSort(state: EditableShelfState): boolean {
  return primarySortKey(state.sort) === 'manual'
    || primarySortKey(state.filter?.sort) === 'manual';
}

const SYNTH_EMPTY_STRING_FIELDS = ['text', 'image', 'heroImage'] as const;

function emptyStringToUndef(out: any): void {
  for (const k of SYNTH_EMPTY_STRING_FIELDS) {
    if (typeof out[k] === 'string' && out[k].length === 0) out[k] = undefined;
  }
}

function resolveSynthLink(out: any, hasContent: boolean): void {
  if (!out.link) return;
  if (!hasContent) { out.link = undefined; return; }
  if (out.link.type === 'url') out.link = sanitizeUrlLink(out.link);
}

function stripDefaultShadow(out: any): void {
  if (!out.link && out.shadowMode) delete out.shadowMode;
  if (out.shadowMode === 'never') delete out.shadowMode;
}

export function sanitizeSyntheticCard(card: any): any {
  const out: any = { ...card };
  emptyStringToUndef(out);
  if (out.text !== undefined && out.image !== undefined) out.text = undefined;
  resolveSynthLink(out, out.text !== undefined || out.image !== undefined);
  stripDefaultShadow(out);
  return out;
}

function sanitizeUrlLink(link: any): any {
  const raw = String(link.value ?? '').trim();
  const url = /^https?:\/\//i.test(raw) ? raw : (raw ? `https://${raw}` : '');
  try { if (url) new URL(url); else throw new Error(); return link; }
  catch { return undefined; }
}

export function buildSortPatchFields(
  state: EditableShelfState,
  isManualSort: boolean,
): { baseSort: string | string[] | undefined; baseReverse: boolean | boolean[] | undefined } {
  if (!isManualSort) return { baseSort: undefined, baseReverse: undefined };
  const baseSortIsArray = Array.isArray(state.manualBaseSort);
  const baseSort: string | string[] | undefined = baseSortIsArray
    ? ((state.manualBaseSort as string[]).length > 0 ? state.manualBaseSort : undefined)
    : (state.manualBaseSort !== 'alphabetical' ? state.manualBaseSort : undefined);
  const baseReverse: boolean | boolean[] | undefined = Array.isArray(state.manualBaseSortReverse)
    ? (state.manualBaseSortReverse.some((b) => b) ? state.manualBaseSortReverse : undefined)
    : (state.manualBaseSortReverse ? true : undefined);
  return { baseSort, baseReverse };
}

type PrimaryBuildCtx = {
  state: EditableShelfState;
  childFilter?: FilterGroup;
  platformTabs?: ReadonlyArray<{ id: string; source?: any }>;
};

type SourceBuilder = (ctx: PrimaryBuildCtx) => any;

const SOURCE_BUILDERS: Record<string, SourceBuilder> = {
  collection: ({ state, childFilter }) => ({ type: 'collection', collectionId: state.collectionId, ...(childFilter ? { childFilter } : {}) }),
  tab: ({ state, childFilter, platformTabs }) => {
    const selectedTab = platformTabs?.find((pt) => pt.id === state.tab);
    const baseSource = selectedTab?.source ?? { type: 'tab', tab: state.tab };
    return childFilter ? { ...baseSource, childFilter } : baseSource;
  },
  external: ({ state }) => ({ type: 'external', sourceId: state.externalSourceId }),
  wishlist: ({ state, childFilter }) => buildOnlineSource('wishlist', state, childFilter),
  store: ({ state, childFilter }) => buildOnlineSource('store', state, childFilter),
};

// Collapses `[manual, …]` → `'manual'` — secondaries are meaningless
// once primary is manual and would leak into the UI on reopen.
function normalizeManualSort(sort: ShelfFilter['sort']): ShelfFilter['sort'] {
  if (Array.isArray(sort) && sort[0] === 'manual') return 'manual' as ShelfFilter['sort'];
  return sort;
}

function buildFilterSource(state: EditableShelfState): any {
  const sort = normalizeManualSort(state.filter.sort as ShelfFilter['sort']);
  return { type: 'filter', filter: filterGroupToFilter(state.filterGroup, sort, state.filter.sortReverse) };
}

export function buildPrimarySource(ctx: PrimaryBuildCtx): any {
  const builder = SOURCE_BUILDERS[ctx.state.sourceType];
  return builder ? builder(ctx) : buildFilterSource(ctx.state);
}

function buildOnlineSource(type: 'wishlist' | 'store', state: EditableShelfState, childFilter?: FilterGroup): any {
  return {
    type,
    ...(childFilter ? { childFilter } : {}),
    ...(state.excludeOwned ? { excludeOwned: true } : {}),
    ...(state.excludeOwned && state.excludeOwnedNonSteam ? { excludeOwnedNonSteam: true } : {}),
    ...(state.excludeOwned && state.excludeOwnedNonSteam && state.hideOwnedNonSteamCloud ? { hideOwnedNonSteamCloud: true } : {}),
  };
}

export function dropEmptyChildFilter(s: any): any {
  if (!s?.childFilter) return s;
  const items = s.childFilter.items;
  if (Array.isArray(items) && items.length > 0) return s;
  const { childFilter: _drop, ...rest } = s;
  return rest;
}

export function assembleFinalSource(primary: any, state: EditableShelfState): any {
  // A filter primary now composes with additional sources like any other
  // primary; only a truly single-source shelf returns the bare primary.
  if (state.additionalSources.length === 0) return primary;
  const allChildren = [primary, ...state.additionalSources].map(dropEmptyChildFilter);
  return { type: 'composite', combine: state.compositeCombine, sources: allChildren };
}

export function shelfSortForPatch(state: EditableShelfState): Partial<Shelf>['sort'] {
  /* A single filter source carries its sort on the source itself, so the
     shelf-level sort is omitted. Once it's part of a composite, the merged
     result is re-sorted by the shelf-level sort — so surface the filter's
     chosen sort there too (state.filter.sort), otherwise the order is lost. */
  if (state.sourceType === 'filter' && state.additionalSources.length === 0) return undefined;
  const eff = state.sourceType === 'filter' ? state.filter.sort : state.sort;
  const hasUserSort = Array.isArray(eff) ? eff.length > 0 : (eff != null && eff !== 'alphabetical');
  if (!hasUserSort) return undefined;
  return normalizeManualSort(eff as ShelfFilter['sort']) as Partial<Shelf>['sort'];
}
