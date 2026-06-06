import { useEffect, useState } from 'react';
import { resolveShelfAppIds, getAllAppOverviews, getLocalLibraryAppIds } from '../../../../steam';
import { getCurrentSettings } from '../../../../store/settingsStore';
import { fetchGameNames } from '../../../../core/onlineStore';
import type { PlatformApi, PlatformAppMeta } from '../../../../runtime/platform';
import type { EditableShelfState } from './types';

const NAME_CACHE_KEY = 'ds-game-name-cache-v1';

type Props = {
  state: EditableShelfState;
  previewSource: any;
  previewShelfId: string;
  hiddenPickerOpen: boolean;
  previewRefreshNonce: number;
  platform: PlatformApi;
};

type Result = {
  previewCount: number | null;
  resolvedIds: number[];
  resolvedMeta: Map<number, PlatformAppMeta>;
};

function pickPreviewReverse(state: EditableShelfState, isManualSort: boolean): boolean | boolean[] {
  const v = isManualSort ? state.manualBaseSortReverse : state.sortReverse;
  return Array.isArray(v) ? v : !!v;
}

function pickManualSortKey(base: string | string[]): string | string[] {
  if (Array.isArray(base)) return base.length > 0 ? base : 'alphabetical';
  return base || 'alphabetical';
}

function computePreviewSort(state: EditableShelfState): { sort: string | string[] | undefined; reverse: boolean | boolean[] } {
  const isManualSort = state.sort === 'manual' || state.filter.sort === 'manual';
  const reverse = pickPreviewReverse(state, isManualSort);
  if (state.sourceType === 'filter') return { sort: undefined, reverse };
  if (isManualSort) return { sort: pickManualSortKey(state.manualBaseSort), reverse };
  const hasUserSort = state.sort && (Array.isArray(state.sort) ? state.sort.length : true);
  return { sort: hasUserSort ? state.sort : (reverse ? 'alphabetical' : undefined), reverse };
}

function readNameCache(): Record<number, string> {
  try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY) || '{}'); } catch { return {}; }
}

function writeNameCache(merged: Record<number, string>): void {
  try { localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(merged)); } catch {}
}

function resolveCloudFlag(state: EditableShelfState, effectiveNonSteam: boolean, globalHideCloud: boolean): boolean {
  if (!effectiveNonSteam) return false;
  if (state.excludeOwned && state.excludeOwnedNonSteam) {
    const perShelfCloud = state.hideOwnedNonSteamCloud;
    if (perShelfCloud === true) return true;
    if (perShelfCloud === undefined) return globalHideCloud;
    return false;
  }
  return globalHideCloud;
}

function computeOwnedFlags(state: EditableShelfState) {
  const s = getCurrentSettings();
  const globalHideOwned = s?.onlineHideOwnedGames === true;
  const globalHideNonSteam = s?.onlineHideOwnedNonSteam === true;
  const globalHideCloud = s?.onlineHideOwnedNonSteamCloud === true;
  const shouldHideOwned = globalHideOwned || state.excludeOwned;
  const effectiveNonSteam = (globalHideOwned && globalHideNonSteam) || (state.excludeOwned && state.excludeOwnedNonSteam);
  const effectiveCloud = resolveCloudFlag(state, effectiveNonSteam, globalHideCloud);
  return { shouldHideOwned, effectiveNonSteam, effectiveCloud };
}

function buildOwnedNameIndex(all: any[], ownedSetForNames: Set<number>): { ownedNames: Set<string>; allById: Map<number, any> } {
  const ownedNames = new Set<string>();
  const allById = new Map<number, any>();
  for (const a of all) {
    const id = Number(a?.appid);
    if (Number.isFinite(id)) allById.set(id, a);
    if (!ownedSetForNames.has(id)) continue;
    const n = a?.display_name ?? a?.name;
    if (typeof n === 'string' && n) ownedNames.add(n.trim().toLowerCase());
  }
  return { ownedNames, allById };
}

function pickNameForId(id: number, allById: Map<number, any>, nameCache: Record<number, string>): string {
  const overview = allById.get(id);
  const localName = overview ? (overview.display_name ?? overview.name) : '';
  const cachedName = nameCache[id];
  return ((localName && !/^App \d+$/.test(localName) ? localName : cachedName) ?? '').trim().toLowerCase();
}

async function filterOwnedForOnline(rawIds: number[], state: EditableShelfState): Promise<number[]> {
  const { shouldHideOwned, effectiveNonSteam, effectiveCloud } = computeOwnedFlags(state);
  if (!shouldHideOwned) return rawIds;
  const ownedAppIds = getLocalLibraryAppIds(effectiveNonSteam, effectiveCloud);
  const ownedSetForNames = getLocalLibraryAppIds(true, true);
  const all = await getAllAppOverviews();
  const { ownedNames, allById } = buildOwnedNameIndex(all, ownedSetForNames);
  const nameCache = readNameCache();
  return rawIds.filter((id) => {
    if (ownedAppIds.has(id)) return false;
    const name = pickNameForId(id, allById, nameCache);
    return !(name && ownedNames.has(name));
  });
}

function isOnlineSourceShelf(state: EditableShelfState): boolean {
  if (state.sourceType === 'wishlist' || state.sourceType === 'store') return true;
  if (state.sourceType === 'filter') return false;
  return state.additionalSources.some((c: any) => c?.type === 'wishlist' || c?.type === 'store');
}

function enrichOnlineNames(rawResults: Array<[number, PlatformAppMeta]>): { meta: Map<number, PlatformAppMeta>; toFetch: number[] } {
  const nameCache = readNameCache();
  const meta = new Map<number, PlatformAppMeta>();
  const toFetch: number[] = [];
  for (const [id, m] of rawResults) {
    const overviewName = m?.name && !/^App \d+$/.test(m.name) ? m.name : undefined;
    const cachedName = nameCache[id];
    const portraitUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`;
    meta.set(id, { appid: id, name: overviewName ?? cachedName ?? `#${id}`, portraitUrl });
    if (!overviewName && !cachedName) toFetch.push(id);
  }
  return { meta, toFetch };
}

async function fetchMetaForIds(platform: PlatformApi, ids: number[]): Promise<Array<[number, PlatformAppMeta]>> {
  return Promise.all(ids.map(async (id): Promise<[number, PlatformAppMeta]> => {
    try { return [id, await platform.getAppMeta(id)]; }
    catch { return [id, { appid: id, name: `App ${id}` }]; }
  }));
}

type ResolveArgs = {
  state: EditableShelfState;
  previewSource: any;
  previewShelfId: string;
  hiddenPickerOpen: boolean;
};

function isEmptyTabSource(state: EditableShelfState): boolean {
  return state.sourceType === 'tab'
    && !String(state.tab ?? '').trim()
    && state.additionalSources.length === 0;
}

async function resolveFilteredIds(args: ResolveArgs): Promise<number[]> {
  const { state, previewSource, previewShelfId, hiddenPickerOpen } = args;
  const { sort, reverse } = computePreviewSort(state);
  const rawIds = await resolveShelfAppIds(previewSource, Math.max(state.limit, 500), sort, previewShelfId, reverse, {
    hiddenAppIds: hiddenPickerOpen ? undefined : (state.hiddenAppIds.length ? state.hiddenAppIds : undefined),
    dedupeByName: state.dedupeByExactName || undefined,
  });
  const isCompositeMode = state.additionalSources.length > 0 && state.sourceType !== 'filter';
  const isOnlineShelf = !isCompositeMode && (state.sourceType === 'wishlist' || state.sourceType === 'store');
  return isOnlineShelf ? await filterOwnedForOnline(rawIds, state) : rawIds;
}

/** Owns the preview's resolve → ids → meta pipeline. Mirrors Shelf.tsx's
 *  wiring so the modal count + render matches the home. */
export function usePreviewResolution(props: Props): Result {
  const { state, previewSource, previewShelfId, hiddenPickerOpen, previewRefreshNonce, platform } = props;
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [resolvedIds, setResolvedIds] = useState<number[]>([]);
  const [resolvedMeta, setResolvedMeta] = useState<Map<number, PlatformAppMeta>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setPreviewCount(null);
    const runResolve = async () => {
      if (isEmptyTabSource(state)) {
        setPreviewCount(0); setResolvedIds([]); return;
      }
      try {
        const filteredIds = await resolveFilteredIds({ state, previewSource, previewShelfId, hiddenPickerOpen });
        if (cancelled) return;
        setPreviewCount(filteredIds.length);
        setResolvedIds(filteredIds.slice(0, state.limit));
      } catch {
        if (cancelled) return;
        setPreviewCount(0); setResolvedIds([]);
      }
    };
    const timer = setTimeout(() => { void runResolve(); }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [previewSource, state.limit, state.sourceType, state.sort, state.filter.sort, state.manualBaseSort, state.sortReverse, state.manualBaseSortReverse, state.dedupeByExactName, state.hiddenAppIds.join(','), hiddenPickerOpen, previewRefreshNonce, state.excludeOwned, state.excludeOwnedNonSteam, state.hideOwnedNonSteamCloud]);

  useEffect(() => {
    let cancelled = false;
    if (!resolvedIds.length) { setResolvedMeta(new Map()); return; }
    const isOnline = isOnlineSourceShelf(state);
    (async () => {
      const rawResults = await fetchMetaForIds(platform, resolvedIds);
      if (cancelled) return;
      if (!isOnline) { setResolvedMeta(new Map(rawResults)); return; }
      const { meta, toFetch } = enrichOnlineNames(rawResults);
      setResolvedMeta(meta);
      if (!toFetch.length) return;
      const names = await fetchGameNames(toFetch);
      if (cancelled || !names.size) return;
      const nameCache = readNameCache();
      const merged = { ...nameCache };
      names.forEach((v, k) => { merged[k] = v; });
      writeNameCache(merged);
      setResolvedMeta(prev => {
        const next = new Map(prev);
        names.forEach((name, id) => {
          const existing = next.get(id);
          if (existing) next.set(id, { ...existing, name });
        });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [platform, resolvedIds.join(','), state.sourceType, state.additionalSources.map((s: any) => s?.type).join(',')]);

  // Meta for menu-added games (appended to manualOrder via context menu).
  // They're not in resolvedIds so the effect above skips them; without
  // this merge the preview drops them silently.
  useEffect(() => {
    const resolvedSet = new Set(resolvedIds);
    const tail = state.manualOrder.filter((id) => !resolvedSet.has(id) && id > 0);
    if (!tail.length) return;
    let cancelled = false;
    (async () => {
      const results = await fetchMetaForIds(platform, tail);
      if (cancelled) return;
      setResolvedMeta((prev) => {
        const next = new Map(prev);
        for (const [id, m] of results) if (!next.has(id)) next.set(id, m);
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [platform, resolvedIds.join(','), state.manualOrder.join(',')]);

  return { previewCount, resolvedIds, resolvedMeta };
}
