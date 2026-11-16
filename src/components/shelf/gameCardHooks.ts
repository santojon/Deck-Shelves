import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createSelectedStore } from "../../core/selectedStore";
import { getFriendsInApp, subscribeFriendsChanged } from "../../runtime/friendsState";
import { dispatchHomeButtonDown } from "../../runtime/homeInputBus";
import { registerCardInput } from "../../runtime/cardInputRegistry";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";
import { getPortraitUrls, getLandscapeUrls, getLogoUrls, getIconUrls } from "../../core/steamAssets";
import { getHotCachedImageSrc, warmCacheBackground, firstCacheableUrl } from "../../core/imageCache";
import { getAppDescriptions, preloadAppDescriptions } from "../../steam/appDescriptionsCache";
import { trackCardLaunch, trackShelfView } from "../../steam/usageTracking";
import { logInfo } from "../../runtime/logger";
import { getCurrentSettings } from "../../store/settingsStore";
import { createMatcherState, matchEvent, parseCombo, parseRawCombo, resolveBindings } from "../../runtime/buttonBindings";
import { resolveKeyboardBindings, parseKeyCombo, matchKeyEvent, createKeyMatcherState, type KeyModifierFlags, isEditableKeyTarget, type KeyMatcherState } from "../../runtime/keyboardBindings";
import { resolveQuickLaunchAction, EAppDisplayStatus } from "../../steam/appDisplayStatus";
import { subscribeShelfRefresh } from "../../core/shelfRefresh";
import { resolveNativeCardClass, retryWithIntervals } from "./cardUtils";
import type { DeckRowItem } from "./types";
import i18n from "../../i18n";

function cardActionsEnabled(): boolean {
  return getCurrentSettings()?.cardActionShortcutsEnabled !== false;
}

function classifyCard(appid: number, shelfId?: string): string {
  const shelfSourceType = shelfId ? findShelfSourceType(shelfId) : undefined;
  if (shelfSourceType === "store") return "store";
  if (shelfSourceType === "wishlist") return "wishlist";
  const ov = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid);
  return ov?.is_non_steam === true ? "nonsteam" : "game";
}

function findShelfSourceType(shelfId: string): string | undefined {
  const s = getCurrentSettings();
  const sh = [...(s?.shelves ?? []), ...((s as any)?.smartShelves ?? [])].find((x: any) => x?.id === shelfId);
  return (sh as any)?.source?.type;
}

function trackCardActivation(ref: { previewMode: boolean; appid: number; shelfId?: string; isToggle: boolean }): void {
  if (ref.previewMode || !ref.appid || ref.isToggle) return;
  try {
    trackCardLaunch(classifyCard(ref.appid, ref.shelfId));
    if (ref.shelfId) trackShelfView(ref.shelfId);
  } catch {}
}

export function useCardActivation(params: {
  cardRef: RefObject<HTMLDivElement | null>;
  item: DeckRowItem;
  previewMode: boolean;
  appid: number;
}): { activate: () => void; quickLaunch: () => void } {
  const { cardRef, item, previewMode, appid } = params;
  const lastActivateRef = useRef(0);
  const onActivateRef = useRef(item.onToggleSelection ?? item.onActivate);
  onActivateRef.current = item.onToggleSelection ?? item.onActivate;
  // Updated every render so activate can stay stable.
  const trackRef = useRef({ previewMode, appid, shelfId: item.shelfId, isToggle: !!item.onToggleSelection });
  trackRef.current = { previewMode, appid, shelfId: item.shelfId, isToggle: !!item.onToggleSelection };

  const activate = useCallback(() => {
    const now = Date.now();
    if (now - lastActivateRef.current < 400) return;
    lastActivateRef.current = now;
    onActivateRef.current?.();
    trackCardActivation(trackRef.current);
  }, []);

  const quickLaunch = useCallback(() => {
    if (previewMode || !appid) return;
    if (typeof item.onMenuButton !== 'function') return;
    try {
      item.onMenuButton({} as any);
      const doc = cardRef.current?.ownerDocument ?? document;
      let attempts = 0;
      const tryClick = () => {
        const first = doc.querySelector('.contextMenuItem') as HTMLElement | null;
        if (first) { try { first.click(); } catch {} return; }
        if (attempts++ < 12) requestAnimationFrame(tryClick);
      };
      requestAnimationFrame(tryClick);
    } catch {}
  }, [appid, previewMode, item.onMenuButton, cardRef]);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const menuHandler = (evt: Event) => {
      if (!item.onMenuButton) return;
      evt.stopPropagation();
      evt.preventDefault();
      item.onMenuButton(evt);
    };
    const activateHandler = (evt: Event) => {
      if (!item.onActivate) return;
      evt.stopPropagation();
      evt.preventDefault();
      activate();
    };
    el.addEventListener("vgp_onmenubutton", menuHandler);
    el.addEventListener("contextmenu", menuHandler);
    el.addEventListener("vgp_onok", activateHandler);
    return () => {
      el.removeEventListener("vgp_onmenubutton", menuHandler);
      el.removeEventListener("contextmenu", menuHandler);
      el.removeEventListener("vgp_onok", activateHandler);
    };
    // item.onActivate is read through the closure on purpose and stays out of the deps.
  }, [item.onMenuButton, activate]);

  return { activate, quickLaunch };
}

function runCardAction(
  kind: 'quickLaunch' | 'hideRemove' | 'highlight',
  ctx: { quickLaunch: () => void; appid: number; removableSet?: Set<number>; onRemoveCard?: (appid: number) => void; onHideCard?: (appid: number) => void; shelfId?: string; toggleCardHighlight: (shelfId: string | undefined, appid: number) => void },
): void {
  if (kind === 'quickLaunch') { ctx.quickLaunch(); return; }
  if (kind === 'hideRemove') {
    if (ctx.removableSet?.has(ctx.appid) && ctx.onRemoveCard) ctx.onRemoveCard(ctx.appid);
    else ctx.onHideCard?.(ctx.appid);
    return;
  }
  try { ctx.toggleCardHighlight(ctx.shelfId, ctx.appid); } catch {}
}

function matchedCardAction(b: ReturnType<typeof resolveBindings>, evtLike: any, state: ReturnType<typeof createMatcherState>, raw: boolean): 'quickLaunch' | 'hideRemove' | 'highlight' | null {
  const parse = raw ? parseRawCombo : parseCombo;
  if (matchEvent(evtLike, parse(b.cardQuickLaunch), state)) return 'quickLaunch';
  if (matchEvent(evtLike, parse(b.cardHideRemove), state)) return 'hideRemove';
  if (matchEvent(evtLike, parse(b.cardHighlightToggle), state)) return 'highlight';
  return null;
}

function usesRawOnlyCombo(combo: string | null | undefined): boolean {
  if (!combo) return false;
  const tokens = String(combo).toUpperCase().split("+");
  return tokens.some((t) => t === "L4" || t === "L5" || t === "R4" || t === "R5");
}

// Only back-grip combos use the raw stream, so a loader-known button never fires twice.
type CardBindings = ReturnType<typeof resolveBindings>;
function rawOnlyBindings(b: CardBindings): CardBindings | null {
  const pick = (c: string | null | undefined) => (usesRawOnlyCombo(c) ? c : null);
  const out = { ...b, cardQuickLaunch: pick(b.cardQuickLaunch), cardHideRemove: pick(b.cardHideRemove), cardHighlightToggle: pick(b.cardHighlightToggle) } as CardBindings;
  return out.cardQuickLaunch || out.cardHideRemove || out.cardHighlightToggle ? out : null;
}

function handleCardKeyEvent(
  code: string | null,
  state: KeyMatcherState,
  actions: { quickLaunch: () => void; removeOrHide: () => void; toggleHighlight: () => void },
  held?: KeyModifierFlags,
): void {
  try {
    const kb = resolveKeyboardBindings(getCurrentSettings()?.keyboardBindings as any, (getCurrentSettings() as any)?.keyboardBindingsDisabled, cardActionsEnabled());
    const now = Date.now();
    if (kb.cardQuickLaunch && matchKeyEvent(code, parseKeyCombo(kb.cardQuickLaunch), state, now, held)) { actions.quickLaunch(); return; }
    if (kb.cardHideRemove && matchKeyEvent(code, parseKeyCombo(kb.cardHideRemove), state, now, held)) { actions.removeOrHide(); return; }
    if (kb.cardHighlightToggle && matchKeyEvent(code, parseKeyCombo(kb.cardHighlightToggle), state, now, held)) actions.toggleHighlight();
  } catch {}
}

export function useCardInputBindings(params: {
  cardRef: RefObject<HTMLDivElement | null>;
  appid: number;
  previewMode: boolean;
  shelfId: string | undefined;
  removableSet: Set<number> | undefined;
  onRemoveCard: ((appid: number) => void) | undefined;
  onHideCard: ((appid: number) => void) | undefined;
  quickLaunch: () => void;
  toggleCardHighlight: (shelfId: string | undefined, appid: number) => void;
}): { buttonDownHandler: (evt: any) => void } {
  const { cardRef, appid, previewMode, shelfId, removableSet, onRemoveCard, onHideCard, quickLaunch, toggleCardHighlight } = params;
  const matcherRef = useRef(createMatcherState());
  const rawMatcherRef = useRef(createMatcherState());
  const keyMatcherRef = useRef(createKeyMatcherState());

  const buttonDownHandler = useCallback((evt: any) => {
    if (previewMode) return;
    try { dispatchHomeButtonDown(evt); } catch {}
    if (!appid) return;
    try {
      const b = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled, cardActionsEnabled());
      const action = matchedCardAction(b, evt, matcherRef.current, false);
      if (action) runCardAction(action, { quickLaunch, appid, removableSet, onRemoveCard, onHideCard, shelfId, toggleCardHighlight });
    } catch {}
  }, [appid, previewMode, quickLaunch, removableSet, onRemoveCard, onHideCard, shelfId, toggleCardHighlight]);

  useEffect(() => {
    if (previewMode || !appid) return;
    const el = cardRef.current;
    if (!el) return;
    return registerCardInput(el, {
      raw: (e) => {
        try {
          const b = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled, cardActionsEnabled());
          const rawOnly = rawOnlyBindings(b);
          if (!rawOnly) return;
          const action = matchedCardAction(rawOnly, { button: e.button }, rawMatcherRef.current, true);
          if (action) runCardAction(action, { quickLaunch, appid, removableSet, onRemoveCard, onHideCard, shelfId, toggleCardHighlight });
        } catch {}
      },
      key: (e) => {
        if (isEditableKeyTarget(e.tag)) return;
        handleCardKeyEvent(e.code ?? null, keyMatcherRef.current, {
          quickLaunch,
          removeOrHide: () => { if (removableSet?.has(appid) && onRemoveCard) onRemoveCard(appid); else onHideCard?.(appid); },
          toggleHighlight: () => { try { toggleCardHighlight(shelfId, appid); } catch {} },
        }, { ctrl: e.ctrl, shift: e.shift, alt: e.alt });
      },
    });
  }, [appid, previewMode, quickLaunch, removableSet, onRemoveCard, onHideCard, shelfId, toggleCardHighlight, cardRef]);

  return { buttonDownHandler };
}

type CardState = { label: string | undefined; action: 'run' | 'resume_update' | 'raise' };

function resolveNotInstalledCardState(overview: any, localEntry: any, pcdRaw: any[]): CardState {
  const platformIncompatible = localEntry?.is_invalid_os_type === true
    || localEntry?.is_available_on_current_platform === false;
  const cleanlyInstallable = localEntry?.display_status === EAppDisplayStatus.ReadyToInstall && !platformIncompatible;
  if (cleanlyInstallable) return { label: i18n.t('menu_install'), action: 'run' };
  const remotePcd: any[] = Array.isArray(overview.remote_per_client_data)
    ? overview.remote_per_client_data
    : pcdRaw.filter((c: any) => String(c?.clientid) !== "0");
  const remote = remotePcd.find((c: any) => !!c?.installed || Number(c?.display_status) === EAppDisplayStatus.ReadyToLaunch);
  if (remote) return remoteCardState(remote);
  if (!localEntry) return { label: i18n.t('menu_install'), action: 'run' };
  return { label: undefined, action: 'run' };
}

export function remoteCardState(remote: any): CardState {
  const next = resolveQuickLaunchAction({ installed: true, displayStatus: Number(remote?.display_status ?? 0), statusPercentage: remote?.status_percentage });
  if (next === 'update') return { label: i18n.t('menu_update'), action: 'resume_update' };
  if (next === 'pause') return { label: i18n.t('menu_pause'), action: 'resume_update' };
  return { label: i18n.t('menu_stream'), action: 'run' };
}

function readDisplayStatus(overview: any): number {
  if (typeof overview.display_status === 'number') return overview.display_status;
  const pcd = overview.per_client_data ?? overview.local_per_client_data;
  if (Array.isArray(pcd) && pcd[0] && typeof pcd[0].display_status === 'number') return pcd[0].display_status;
  return 0;
}

function readStatusPercentage(overview: any): number | undefined {
  const root = overview.status_percentage;
  if (typeof root === 'number') return root;
  const pcd = overview.per_client_data ?? overview.local_per_client_data;
  if (Array.isArray(pcd) && pcd[0] && typeof pcd[0].status_percentage === 'number') return pcd[0].status_percentage;
  return undefined;
}

function resolveInstalledCardState(overview: any): CardState {
  const ds = readDisplayStatus(overview);
  const statusPct = readStatusPercentage(overview);
  const next = resolveQuickLaunchAction({ installed: true, displayStatus: ds, statusPercentage: statusPct });
  switch (next) {
    case 'running': return { label: i18n.t('menu_resume'), action: 'raise' };
    case 'pause': return { label: i18n.t('menu_pause'), action: 'resume_update' };
    case 'update': return { label: i18n.t('menu_update'), action: 'resume_update' };
    case 'uninstalling': return { label: i18n.t('menu_uninstall'), action: 'run' };
    default: return { label: i18n.t('menu_play'), action: 'run' };
  }
}

function computeCardState(appid: number): CardState {
  const overview = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid);
  if (!overview) return { label: undefined, action: 'run' };
  // overview.installed is also true for Remote Play titles; client id 0 is the local one.
  const pcdRaw: any[] = Array.isArray(overview.per_client_data)
    ? overview.per_client_data
    : (Array.isArray(overview.local_per_client_data) ? overview.local_per_client_data : []);
  const localEntry = pcdRaw.find((c: any) => String(c?.clientid) === "0");
  const locallyInstalled = pcdRaw.length > 0 ? !!localEntry?.installed : overview.installed === true;
  if (!locallyInstalled) return resolveNotInstalledCardState(overview, localEntry, pcdRaw);
  return resolveInstalledCardState(overview);
}

const IDLE_CARD_STATE: CardState = { label: undefined, action: 'run' };
function computeCardStateSafe(appid: number): CardState {
  try { return computeCardState(appid); } catch { return IDLE_CARD_STATE; }
}
const cardStateStore = createSelectedStore<CardState>({
  compute: computeCardStateSafe,
  equal: (a, b) => a.label === b.label && a.action === b.action,
  attach: (recompute) => subscribeShelfRefresh(recompute),
});
const noopUnsub = () => {};

export function useCardQuickLaunchState(appid: number, previewMode: boolean): CardState {
  const active = !previewMode && !!appid;
  const subscribe = useCallback((cb: () => void) => active ? cardStateStore.subscribe(appid, cb) : noopUnsub, [appid, active]);
  const getSnapshot = useCallback(() => active ? cardStateStore.get(appid) : IDLE_CARD_STATE, [appid, active]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

const friendsKeyStore = createSelectedStore<string>({
  compute: (appid) => `${friendIds(getFriendsInApp(appid, false))}|${friendIds(getFriendsInApp(appid, true))}`,
  equal: (a, b) => a === b,
  attach: (recompute) => subscribeFriendsChanged(recompute),
});
function friendIds(list: any[]): string {
  return (list ?? []).map((f: any) => String(f?.steamid ?? f?.id ?? f?.name ?? '')).join(',');
}
export function useFriendsInAppKey(appid: number, enabled: boolean): string {
  const subscribe = useCallback((cb: () => void) => enabled && appid ? friendsKeyStore.subscribe(appid, cb) : noopUnsub, [appid, enabled]);
  const getSnapshot = useCallback(() => enabled && appid ? friendsKeyStore.get(appid) : '', [appid, enabled]);
  return useSyncExternalStore(subscribe, getSnapshot);
}

function readNativeAnimationVars(el: HTMLElement): { name: string; dur: string; timing: string; iter: string } {
  const pa = getComputedStyle(el, '::after');
  return {
    name: (pa.animationName || '').split(',')[0] || '',
    dur: pa.animationDuration || '',
    timing: pa.animationTimingFunction || '',
    iter: pa.animationIterationCount || '',
  };
}

function applyAnimationVars(target: HTMLElement, vars: { name: string; dur: string; timing: string; iter: string }): void {
  if (vars.name && vars.name !== 'none') target.style.setProperty('--ds-native-after-animation', vars.name);
  if (vars.dur) target.style.setProperty('--ds-native-after-duration', vars.dur);
  if (vars.timing) target.style.setProperty('--ds-native-after-timing', vars.timing);
  if (vars.iter) target.style.setProperty('--ds-native-after-iteration', vars.iter);
}

function addClassIfMissing(el: Element, cls: string | undefined): void {
  if (cls && !el.classList.contains(cls)) el.classList.add(cls);
}

function applyArtClasses(cardRef: RefObject<HTMLDivElement | null>, map: any, featured: boolean): void {
  const artEl = cardRef.current?.querySelector('.ds-card-art');
  if (!artEl) return;
  addClassIfMissing(artEl, map.nativeCardArt);
  addClassIfMissing(artEl, map.nativeCardArtOuter);
  if (!featured) addClassIfMissing(artEl, map.nativeCardArtPortrait);
}

function applyImgClasses(imgRef: RefObject<HTMLImageElement | null>, map: any): void {
  if (!imgRef.current) return;
  addClassIfMissing(imgRef.current, map.nativeCardImg);
  addClassIfMissing(imgRef.current, map.nativeCardImgFade);
}

function applyFallbackAnimation(doc: Document, cardRef: RefObject<HTMLDivElement | null>, map: any): void {
  try {
    if (!map.nativeCard) return;
    const maybe = doc.querySelector(buildSelectorFromToken(map.nativeCard) ?? '');
    if (!maybe) return;
    const vars = readNativeAnimationVars(maybe as HTMLElement);
    if (vars.name && vars.name !== 'none' && cardRef.current) cardRef.current.style.setProperty('--ds-native-after-animation', vars.name);
  } catch (e) {
    logInfo("HOME", "injectNativeClasses: fallback animation read failed", String(e));
  }
}

// Sampled once per pass instead of one computed-style read per card.
let animVarsCache: { el: HTMLElement; vars: ReturnType<typeof readNativeAnimationVars>; at: number } | null = null;
const ANIM_VARS_TTL_MS = 2000;
function readNativeAnimationVarsCached(nativeSample: HTMLElement): ReturnType<typeof readNativeAnimationVars> {
  const now = Date.now();
  if (animVarsCache && animVarsCache.el === nativeSample && now - animVarsCache.at < ANIM_VARS_TTL_MS) return animVarsCache.vars;
  const vars = readNativeAnimationVars(nativeSample);
  animVarsCache = { el: nativeSample, vars, at: now };
  return vars;
}

function tryApplyNativeAnimation(cardRef: RefObject<HTMLDivElement | null>, nativeSample: HTMLElement): void {
  try {
    if (cardRef.current) applyAnimationVars(cardRef.current, readNativeAnimationVarsCached(nativeSample));
  } catch (e) {
    logInfo("HOME", "injectNativeClasses: animation read failed", String(e));
  }
}

function findNativeSample(doc: Document | null, map: any): HTMLElement | null {
  const sampleSelector = map?.nativeCard ? buildSelectorFromToken(map.nativeCard) : null;
  return sampleSelector ? doc?.querySelector(`${sampleSelector}:not(.ds-card)`) as HTMLElement | null : null;
}

function injectNativeClasses(
  cardRef: RefObject<HTMLDivElement | null>,
  imgRef: RefObject<HTMLImageElement | null>,
  featured: boolean,
  setNativeCardClass: (cls: string) => void,
): boolean {
  const doc = getPreferredSteamDocument();
  const cls = resolveNativeCardClass(doc);
  if (cls === null) return false;
  setNativeCardClass(cls);
  const map = doc ? getRuntimeClassMap(doc) : null;
  const nativeSample = findNativeSample(doc, map);
  if (nativeSample) tryApplyNativeAnimation(cardRef, nativeSample);
  if (!map) return true;
  applyArtClasses(cardRef, map, featured);
  applyImgClasses(imgRef, map);
  if (!nativeSample) applyFallbackAnimation(doc as Document, cardRef, map);
  return true;
}

const NATIVE_CLASS_RETRY_INTERVALS_MS = [250, 500, 800, 1200, 2000];

export function useNativeCardClassInjection(
  cardRef: RefObject<HTMLDivElement | null>,
  imgRef: RefObject<HTMLImageElement | null>,
  featured: boolean,
): string {
  const [nativeCardClass, setNativeCardClass] = useState('');
  useEffect(() => (
    retryWithIntervals(
      () => injectNativeClasses(cardRef, imgRef, featured, setNativeCardClass),
      NATIVE_CLASS_RETRY_INTERVALS_MS,
    )
  ), []);
  return nativeCardClass;
}

function featuredUrls(appid: number, heroUrl: string | undefined): string[] {
  const urls: string[] = appid > 0 ? [...getLandscapeUrls(appid)] : [];
  if (heroUrl && !urls.includes(heroUrl)) urls.push(heroUrl);
  return urls;
}

function portraitFallbackUrls(appid: number, portraitUrl: string | undefined, heroUrl: string | undefined, assetKey: string): string[] {
  const urls: string[] = [];
  if (appid > 0) {
    const bust = `?c=${assetKey}`;
    urls.push(`/customimages/${appid}p.png${bust}`);
    urls.push(`/customimages/${appid}p.jpg${bust}`);
  }
  if (portraitUrl && !urls.includes(portraitUrl)) urls.push(portraitUrl);
  if (heroUrl && !urls.includes(heroUrl)) urls.push(heroUrl);
  if (appid > 0) {
    for (const u of getPortraitUrls(appid)) if (!urls.includes(u)) urls.push(u);
  }
  return urls;
}

function computeAllUrls(params: { appid: number; featured: boolean; portraitUrl?: string; heroUrl?: string; assetKey: string }): string[] {
  const { appid, featured, portraitUrl, heroUrl, assetKey } = params;
  return featured
    ? featuredUrls(appid, heroUrl)
    : portraitFallbackUrls(appid, portraitUrl, heroUrl, assetKey);
}

function pickInitialCached(allUrls: string[]): { initialSrc: string; initialOriginal: string; startIdx: number } {
  if (!allUrls.length) return { initialSrc: "", initialOriginal: "", startIdx: 0 };
  for (let i = 0; i < allUrls.length; i++) {
    try {
      const cached = getHotCachedImageSrc(allUrls[i]);
      if (cached) return { initialSrc: cached, initialOriginal: allUrls[i], startIdx: i };
    } catch {}
  }
  return { initialSrc: allUrls[0], initialOriginal: allUrls[0], startIdx: 0 };
}

export function useCardImageFallback(params: {
  imgRef: RefObject<HTMLImageElement | null>;
  appid: number;
  featured: boolean;
  item: DeckRowItem;
  assetKey: string;
  isNearViewport: boolean;
}): { firstUrl: string; imgFailed: boolean; imgLoaded: boolean; setImgLoaded: (v: boolean) => void; onImgError: () => void; onImgLoad: () => void } {
  const { imgRef, appid, featured, item, assetKey, isNearViewport } = params;
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const fallbackIdx = useRef(0);
  // Tracks the original URLs so errors advance the chain even when src is a blob.
  const currentOriginalUrl = useRef<string>("");

  const allUrls = useMemo(
    () => computeAllUrls({ appid, featured, portraitUrl: item.portraitUrl, heroUrl: item.heroUrl, assetKey }),
    [item.portraitUrl, item.heroUrl, appid, featured, assetKey],
  );
  const { initialSrc, initialOriginal, startIdx } = useMemo(() => pickInitialCached(allUrls), [allUrls]);

  useEffect(() => {
    fallbackIdx.current = startIdx;
    setImgFailed(false);
    setImgLoaded(false);
    currentOriginalUrl.current = initialOriginal;
    // Warm the first cacheable URL; the local /customimages/ entry isn't cacheable.
    if (isNearViewport && initialSrc === initialOriginal) {
      const warmTarget = firstCacheableUrl(allUrls);
      if (warmTarget) { try { warmCacheBackground(warmTarget); } catch {} }
    }
  }, [allUrls, startIdx, initialSrc, initialOriginal, isNearViewport]);

  const onImgError = useCallback(() => {
    fallbackIdx.current += 1;
    if (imgRef.current && fallbackIdx.current < allUrls.length) {
      const next = allUrls[fallbackIdx.current];
      currentOriginalUrl.current = next;
      let resolved: string = next;
      try {
        const cached = getHotCachedImageSrc(next);
        if (cached) resolved = cached;
        else warmCacheBackground(next);
      } catch {}
      imgRef.current.src = resolved;
    } else {
      setImgFailed(true);
    }
  }, [allUrls, imgRef]);

  const onImgLoad = useCallback(() => {
    setImgLoaded(true);
    if (currentOriginalUrl.current) warmCacheBackground(currentOriginalUrl.current);
  }, []);

  return { firstUrl: initialSrc, imgFailed, imgLoaded, setImgLoaded, onImgError, onImgLoad };
}

export function useCardAssetDecoration(params: {
  appid: number;
  assetKey: string;
  isNearViewport: boolean;
  previewMode: boolean;
  enableLogo: boolean;
  enableIcon: boolean;
  enableDescription: boolean;
}): { iconSrc: string | null; setIconIdx: (updater: (i: number) => number) => void; description: string | null } {
  const { appid, assetKey, isNearViewport, previewMode, enableLogo, enableIcon, enableDescription } = params;
  const logoUrls = useMemo(() => (enableLogo && appid > 0 ? getLogoUrls(appid) : []), [enableLogo, appid, assetKey]);
  const iconUrls = useMemo(() => (enableIcon && appid > 0 ? getIconUrls(appid) : []), [enableIcon, appid, assetKey]);
  const [iconIdx, setIconIdx] = useState(0);

  useEffect(() => {
    if (!isNearViewport) return;
    for (const u of iconUrls) if (!getHotCachedImageSrc(u)) warmCacheBackground(u);
  }, [iconUrls, isNearViewport]);
  useEffect(() => {
    if (!isNearViewport) return;
    for (const u of logoUrls) if (!getHotCachedImageSrc(u)) warmCacheBackground(u);
  }, [logoUrls, isNearViewport]);
  const iconSrc = iconUrls[iconIdx] ? (getHotCachedImageSrc(iconUrls[iconIdx]) || iconUrls[iconIdx]) : null;

  const [description, setDescription] = useState<string | null>(null);
  useEffect(() => {
    if (!enableDescription || appid <= 0 || previewMode || !isNearViewport) { setDescription(null); return; }
    preloadAppDescriptions(appid);
    const tick = (): boolean => {
      const d = getAppDescriptions(appid);
      if (d?.snippet) { setDescription(d.snippet); return true; }
      return false;
    };
    if (tick()) return;
    const id = window.setInterval(() => { if (tick()) window.clearInterval(id); }, 400);
    const stop = window.setTimeout(() => window.clearInterval(id), 6000);
    return () => { window.clearInterval(id); window.clearTimeout(stop); };
  }, [enableDescription, appid, previewMode, isNearViewport]);

  return { iconSrc, setIconIdx, description };
}
