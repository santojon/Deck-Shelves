import { devStamp } from "../runtime/devStamps";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { ShelfView } from "./Shelf";
import { DebugOverlay } from "./DebugOverlay";
import { isDebugOverlayEnabled } from "../runtime/debugOverlay";
import type { Settings, Shelf, SmartShelfMode } from "../types";
import { refreshSettings, subscribeSettings, saveSettings, getCurrentSettings } from "../settingsStore";
import { useContainerDragReorder } from "../core/reorder";
import { PlatformProvider } from "../runtime/platformContext";
import { createDeckyPlatform } from "../runtime/deckyPlatform";
import { logInfo, logWarn } from "../runtime/logger";
import { logDiagnostic } from "../runtime/diagnostics";
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../runtime/steamHost";
import { ROOT_ID, seededShuffle, isHomeRoute, hasHomeDomSignals, detectNavTreeApi, findOrCreateMount, homeBehindGame, removeOwnMounts } from "./home/mountUtils";
import { applyHideRecents, reapplyHomeHides, enforceHomeFocusSuppression, applyHideHomeTabs, applyReplaceActiveMargin, getMountFailed, getPendingHideRecents, getPendingHideHomeTabs } from "../runtime/homePatch";
import { getRecentsReplaceFailed, subscribeRecentsReplaceFailed, isRecentsReplaceInjecting, subscribeRecentsReplaceInjecting } from "../runtime/recentsReplace";
import { Focusable } from "../runtime/host/decky";
import { installPassiveMenuHook, installPassiveShowContextMenuHook, installLibraryContextMenuPatch, installCreateContextMenuPatch, prewarmMenuExtraction } from "../core/steamGameMenu";
import { tryRestoreFocus, hasPendingFocus, beginFocusRestoreLoop, beginColdBootFocusGuard, focusElementAuto, startFocusFirstPoll, getLastFocusedElement, saveFocusTargetFromFocusedCard, type NativeRowFocus } from "../core/focusRestore";
import { getPowerState } from "../runtime/powerGate";
import { allShelvesWarm, getShelfWarmEntry, isShelfResolved, subscribeShelfResolved } from "./shelf/shelfWarmState";
import { recordBootStarted, recordBootCompleted } from "../runtime/safeMode";
import { focusNativeRecentsFirstCard, findNativeRecentsEl, nativeRecentsHoldsFocus } from "../features/sidenav/ShelfSideNav";
import { patchShelfEdgeNavigation, patchMenuButton, installVerticalFocusBridge, reparentNavTreeNodes, releaseDetachedNavNodes } from "./home/navPatches";
import { steamUIStore } from "../steam/internals";
import { useHeroIdlePause } from "./home/heroIdlePause";
import { triggerShelfRefresh } from "../core/shelfRefresh";
import { bumpAssetRevision } from "../core/assetRevision";
import { pickFirstVisibleShelfId, interleaveSmartShelves, applyAutoPin, isShelfSetSettled, revealableInOrder } from "../domain/shelfOrder";
import { evalVisibility, nextVisibilityFlip, getModeVisibilityWindows, invalidateSmartShelfCache } from "../steam/smartShelves";
import { subscribeDeviceState } from "../runtime/deviceState";
import { subscribeSessionState, getSessionState } from "../runtime/sessionState";
import { subscribePerfState, stopFrameSampler } from "../runtime/perfState";
import { subscribePeripheralsState } from "../runtime/peripheralsState";
import { flowChildrenProps } from "../core/steamOSVersion";
import { isCssLoaderActive, getNativeRecentsClassName } from "../core/cssLoaderDetect";
import { applyRootThemeFlags, clearRootThemeFlags } from "../themes";
import { BadgeFocusOverlay } from "./shelf/BadgeFocusOverlay";
import { FriendsAvatarOverlay } from "./shelf/FriendsAvatarOverlay";
import { computeNormalShelves, computeShelvesOrder, computeInterleaveSmart, computeDerivedGlobalFlags, computeEnabledSmartShelves, computeCanHideRecents, applyRecentsFocusTrap, teardownObservers, teardownHistoryPatches, dispatchHideRecentsDisabled, anyShelfHasItems } from "./home/homeInjectHelpers";
import { markMountStart, recordMountDone, resetMountCounters, recordReconcile, recordDomCallback, recordRender, timerCreated, timerDisposed, observerCreated, observerDisposed, subscriptionCreated, subscriptionDisposed } from "../core/perfMetrics";
import { withDefaults } from "./withDefaults";
import { steamTextSelectors } from "../steam/steamText";

const homePlatform = createDeckyPlatform();

const SURPRISE_MODES: SmartShelfMode[] = [
  "daily_pick", "deck_picks", "on_deck", "recently_played", "long_session",
  "random_pick", "not_started", "best_unplayed", "quick_play", "interrupted",
  "non_steam", "spare_time", "time_of_day", "rediscover", "forgotten",
];

let lastClaimedMount: HTMLElement | null = null;
let lastClaimAt = 0;
function claimMount(el: HTMLElement): void {
  const now = Date.now();
  if (el === lastClaimedMount && now - lastClaimAt < 1000) return;
  lastClaimedMount = el; lastClaimAt = now;
  try { el.dataset.dsClaimedAt = String(now); } catch {}
}
function subtreeIsAlive(): boolean {
  try { return !!getPreferredSteamDocument().getElementById(ROOT_ID)?.querySelector('.deck-shelves-root'); } catch { return false; }
}
function refreshSurvivedSubtree(survived: boolean): void {
  if (!survived) return;
  try { triggerShelfRefresh(); } catch {}
}

function applyHideRecentsGated(hide: boolean, revealed: boolean): void {
  if (hide && !revealed) return;
  applyHideRecents(hide && revealed);
}
function applyRecentsFocusTrapGated(recentsEl: HTMLElement | null, hide: boolean, revealed: boolean): void {
  if (!recentsEl || (hide && !revealed)) return;
  applyRecentsFocusTrap(recentsEl, hide && revealed);
}
function settleHideCheck(alive: boolean, anyHas: boolean, revealed: boolean): void {
  if (!alive) return;
  applyHideRecentsGated(anyHas, revealed);
  dispatchHideRecentsDisabled(!anyHas);
}
function shelfIdsOf(shelves: any[] | null | undefined): string[] {
  return (shelves ?? []).map((s: any) => s.id);
}
function applyProgressiveReveal(renderedEls: HTMLElement[], orderedIds: string[], complete: boolean): number {
  const rendered = new Set(renderedEls.map((el) => el.getAttribute('data-shelfid') ?? ''));
  const resolved = new Set(orderedIds.filter((id) => isShelfResolved(id)));
  const showing = complete ? rendered : new Set(revealableInOrder(orderedIds, rendered, resolved));
  for (const el of renderedEls) {
    const pending = !showing.has(el.getAttribute('data-shelfid') ?? '');
    if (pending) el.setAttribute('data-ds-pending', 'true');
    else if (el.hasAttribute('data-ds-pending')) el.removeAttribute('data-ds-pending');
  }
  return showing.size;
}
function anyShelfWarmWithItems(shelves: readonly { id: string }[]): boolean {
  return shelves.some((s) => (getShelfWarmEntry(s.id)?.appIds.length ?? 0) > 0);
}
function computeNormalFirst(settings: Settings, replaceInjecting: boolean, replaceKillSwitch: boolean): boolean {
  return settings.smartShelvesAtBottom
    || (settings.hideRecents === true && !(replaceInjecting && !replaceKillSwitch));
}

let homeInstanceSeq = 0;
const liveHomeInstances = new Map<number, boolean>();
const homeInstanceListeners = new Set<() => void>();
let bridgeFilled = false;
export function bridgeHasFilledHome(): boolean { return bridgeFilled; }
function markBridgeFilled(): void {
  if (bridgeFilled) return;
  bridgeFilled = true;
  notifyHomeInstances();
}
function shouldRenderInstance(id: number, isFallback: boolean): boolean {
  let latestBridge = 0;
  for (const [other, fb] of liveHomeInstances) if (!fb && other > latestBridge) latestBridge = other;
  if (!isFallback) return id === latestBridge;
  return latestBridge === 0 || !bridgeFilled;
}
function notifyHomeInstances(): void {
  for (const l of homeInstanceListeners) { try { l(); } catch {} }
}
function removeSharedMountIfLast(docs: Iterable<Document>): void {
  if (liveHomeInstances.size !== 0) return;
  removeOwnMounts(docs);
}
function useHomeInstanceRegistry(isFallback: boolean): boolean {
  const idRef = useRef(0);
  if (!idRef.current) idRef.current = ++homeInstanceSeq;
  const [shouldRender, setShouldRender] = useState(true);
  useEffect(() => {
    const id = idRef.current;
    liveHomeInstances.set(id, isFallback);
    const sync = () => setShouldRender(shouldRenderInstance(id, isFallback));
    homeInstanceListeners.add(sync);
    notifyHomeInstances();
    return () => {
      liveHomeInstances.delete(id);
      homeInstanceListeners.delete(sync);
      notifyHomeInstances();
    };
  }, [isFallback]);
  return shouldRender;
}

const EMPTY_SETTINGS_VIEW = Object.freeze({}) as Partial<Settings>;

function explicitShelfOrder(settings: Settings): string[] {
  return ((settings as any).allShelvesOrder ?? []) as string[];
}

function skipHomeRender(settings: Settings, visibleCount: number, isLatestInstance: boolean): boolean {
  if (!settings.enabled || !visibleCount) {
    applyHideRecents(false);
    if (!settings.enabled) logWarn("HOME", "plugin disabled — recents forced visible");
    return true;
  }
  return !isLatestInstance;
}

function containerPropsFromSettings(settings: Settings, derived: ReturnType<typeof computeDerivedGlobalFlags>, interleaveSmart: boolean) {
  const s = settings as any;
  return {
    globalMatchNativeSize: settings.globalMatchNativeSize === true,
    globalHighlightFirst: settings.globalHighlightFirst === true,
    globalHighlightAll: settings.globalHighlightAll === true,
    globalHighlightRandom: s.globalHighlightRandom === true,
    globalHideStatusLine: settings.globalHideStatusLine === true,
    globalHideNewBadge: settings.globalHideNewBadge === true,
    globalHideDiscountBadge: s.globalHideDiscountBadge === true,
    globalHideCompatIcons: settings.globalHideCompatIcons === true,
    globalHideNonSteamBadge: settings.globalHideNonSteamBadge === true,
    globalHideShelfTitle: settings.globalHideShelfTitle === true,
    globalHideGameNames: settings.globalHideGameNames === true,
    globalHideInstallIndicator: settings.globalHideInstallIndicator === true,
    globalHideSeeMore: settings.globalHideSeeMore === true,
    globalHideRefreshCard: settings.globalHideRefreshCard === true,
    globalDedupeByName: s.globalDedupeByName === true,
    globalHeroEnabled: s.globalHeroEnabled === true,
    globalGameInfoAbove: s.globalGameInfoAbove === true,
    globalFriendsPlayingOverlay: s.globalFriendsPlayingOverlay === true,
    globalFriendsPlayingOverlayRecent: s.globalFriendsPlayingOverlayRecent === true,
    globalEnableLogo: s.globalEnableLogo === true,
    globalEnableIcon: s.globalEnableIcon === true,
    globalEnableDescription: s.globalEnableDescription === true,
    globalDescriptionBelowLogo: s.globalDescriptionBelowLogo === true,
    globalLogoBelowShelf: s.globalLogoBelowShelf === true,
    globalLogoPosition: derived.globalLogoPosition,
    globalDescriptionPosition: derived.globalDescriptionPosition,
    globalLogoSize: derived.globalLogoSize,
    globalLogoTopOffset: derived.globalLogoTopOffset,
    globalFullPageShelf: s.globalFullPageShelf === true,
    globalIconVerticalAlign: s.globalIconVerticalAlign,
    globalShelfTitlePosition: s.globalShelfTitlePosition,
    globalGameNamePosition: s.globalGameNamePosition,
    globalPlaytimePosition: s.globalPlaytimePosition,
    globalDescriptionHeight: s.globalDescriptionHeight,
    shelfHeroBackground: derived.shelfHeroBackground,
    perShelfHeroAllowed: derived.perShelfHeroAllowed,
    hideRecentsSetting: derived.hideRecentsSetting,
    forceCssLoaderThemes: settings.forceCssLoaderThemes === true,
    interleaveSmart,
    autoCollapseEnabled: s.autoCollapseEnabled === true,
  };
}

export function HomeShelves({ fallback = false }: { fallback?: boolean }) {
  recordRender();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const sv = settings ?? EMPTY_SETTINGS_VIEW;
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);
  const [shelvesRevealed, setShelvesRevealed] = useState(false);
  // Declared before the mount effect so its cleanup runs first on unmount.
  const isLatestInstance = useHomeInstanceRegistry(fallback);
  useEffect(() => { if (shelvesRevealed && !fallback) markBridgeFilled(); }, [shelvesRevealed, fallback]);

  useEffect(() => {
    let alive = true;
    markMountStart();
    recordBootStarted();
    resetMountCounters();
    let mountRecorded = false;

    let removeTimer: ReturnType<typeof setTimeout> | null = null;
    let scopeHook: ((mount: HTMLElement) => void) | null = null;
    const updateMount = () => {
      if (!alive) return;
      recordReconcile();
      const homeVisible = isHomeRoute() || hasHomeDomSignals();
      if (!homeVisible) {
        if (!removeTimer) {
          removeTimer = setTimeout(() => {
            removeTimer = null;
            if (!alive) return;
            if (!isHomeRoute() && !hasHomeDomSignals()) {
              setMountEl(null);
              removeOwnMounts([getPreferredSteamDocument()]);
            }
          }, 600);
        }
        return;
      }
      if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }
      const el = findOrCreateMount();
      if (el) {
        claimMount(el);
        scopeHook?.(el);
        setMountEl(el);
        if (!mountRecorded) { mountRecorded = true; recordMountDone(); recordBootCompleted(); }
      }
    };

    updateMount();
    const doc = getPreferredSteamDocument();
    const win = getPreferredSteamWindow();
    // SharedJSContext can remove the mount from the BigPicture body, so watch every Steam document.
    const observers: MutationObserver[] = [];
    const observedDocs = new Set<Document>();
    const observeDoc = (d: Document | null | undefined) => {
      if (!d || observedDocs.has(d) || !d.body) return;
      observedDocs.add(d);
      const o = new MutationObserver(() => scheduleHomeReconcile());
      o.observe(d.body, { childList: true, subtree: true });
      observers.push(o);
      observerCreated();
    };
    let scopedTo: HTMLElement | null = null;
    const enterDiscovery = () => {
      if (!scopedTo && observers.length) return;
      teardownObservers(observers);
      for (let i = 0; i < observers.length; i++) observerDisposed();
      observers.length = 0;
      scopedTo = null;
      observedDocs.clear();
      observeDoc(doc);
      for (const d of getAllSteamDocuments()) observeDoc(d);
    };
    const scopeObserversTo = (mount: HTMLElement) => {
      const section = mount.parentElement;
      if (!section || scopedTo === section) return;
      teardownObservers(observers);
      for (let i = 0; i < observers.length; i++) observerDisposed();
      observers.length = 0;
      scopedTo = section;
      const onMutation = () => {
        if (!section.isConnected || !mount.isConnected) { enterDiscovery(); }
        scheduleHomeReconcile();
      };
      const scoped = new MutationObserver(onMutation);
      scoped.observe(section, { childList: true, subtree: true });
      observers.push(scoped); observerCreated();
      const canaryParent = section.parentElement;
      if (canaryParent) {
        const canary = new MutationObserver(onMutation);
        canary.observe(canaryParent, { childList: true });
        observers.push(canary); observerCreated();
      }
    };
    enterDiscovery();
    scopeHook = scopeObserversTo;
    { const existing = doc.getElementById(ROOT_ID) as HTMLElement | null; if (existing?.isConnected) scopeObserversTo(existing); }

    // Steam re-renders the Home without our hides, and a churn event can skip an un-hide, so check both ways.
    const CHECK_HIDDEN_MIN_MS = 150;
    let lastCheckHiddenAt = 0;
    let checkHiddenTrailing: ReturnType<typeof setTimeout> | null = null;
    const checkHidden = () => {
      const now = Date.now();
      if (now - lastCheckHiddenAt < CHECK_HIDDEN_MIN_MS) {
        if (!checkHiddenTrailing) checkHiddenTrailing = setTimeout(() => { checkHiddenTrailing = null; checkHidden(); }, CHECK_HIDDEN_MIN_MS);
        return;
      }
      lastCheckHiddenAt = now;
      recordDomCallback();
      try {
        const m = doc.getElementById(ROOT_ID) ?? getAllSteamDocuments().map((dd) => dd.getElementById(ROOT_ID)).find(Boolean);
        if (!m) return;
        const parent = (m as HTMLElement).parentElement;
        if (!parent) return;
        const { recentsVisible, tabsVisible } = scanHomeChildren(parent, m as HTMLElement);
        const recentsMismatch = recentsVisible === getPendingHideRecents();
        const tabsMismatch = tabsVisible === getPendingHideHomeTabs();
        if (recentsMismatch || tabsMismatch) reapplyHomeHides();
        // A re-rendered row can still hold a reachable focusable that traps the nav tree.
        enforceHomeFocusSuppression();
      } catch {}
    };
    let reconcileScheduled = false;
    const scheduleHomeReconcile = () => {
      if (!alive || reconcileScheduled || (getSessionState().gameRunning && !isHomeRoute())) return;
      reconcileScheduled = true;
      requestAnimationFrame(() => {
        reconcileScheduled = false;
        if (!alive) return;
        updateMount();
        checkHidden();
      });
    };
    // Steam rebuilds parts of the tree when focus crosses the root's edge.
    const onFocusChange = () => { scheduleHomeReconcile(); };
    doc.addEventListener('focusin', onFocusChange, true);
    doc.addEventListener('focusout', onFocusChange, true);
    const unsubSession = subscribeSessionState(() => {
      if (!getSessionState().gameRunning) scheduleHomeReconcile();
    });
    subscriptionCreated();

    const SAFETY_POLL_MS = 5000;
    const safetyPoll = window.setInterval(() => {
      if (!alive || homeBehindGame() || !(isHomeRoute() || hasHomeDomSignals())) return;
      scheduleHomeReconcile();
    }, SAFETY_POLL_MS);
    timerCreated();
    win.addEventListener("hashchange", updateMount);
    win.addEventListener("popstate", updateMount);

    let wasOnHome = true;
    let scrollSyncCancel: (() => void) | null = null;
    const onRouteChange = () => {
      getPowerState();
      const nowOnHome = isHomeRoute();
      if (!nowOnHome && wasOnHome) { try { saveFocusTargetFromFocusedCard(); } catch {} }
      if (nowOnHome && !wasOnHome) {
        // Sampled BEFORE updateMount() re-creates the root, or it always looks alive.
        const subtreeSurvived = subtreeIsAlive();
        updateMount();
        try { bumpAssetRevision(); } catch {}
        refreshSurvivedSubtree(subtreeSurvived);
        try { reapplyHomeHides(); enforceHomeFocusSuppression(); } catch {}
        let scrollTries = 0;
        let scrollTimer: ReturnType<typeof setTimeout> | null = null;
        const syncScroll = () => {
          scrollTimer = null;
          let done = false;
          try {
            const focused = getLastFocusedElement();
            const card = focused?.closest?.(".ds-card") as HTMLElement | null;
            if (card) {
              card.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" as ScrollBehavior });
              done = true;
            }
          } catch {}
          if (done || scrollTries++ >= 24) return;
          scrollTimer = setTimeout(syncScroll, 250);
        };
        syncScroll();
        scrollSyncCancel?.();
        scrollSyncCancel = () => { if (scrollTimer) { clearTimeout(scrollTimer); scrollTimer = null; } };
      }
      wasOnHome = nowOnHome;
    };
    const hist = (win as any).history;
    const origPush = hist?.pushState;
    const origReplace = hist?.replaceState;
    if (typeof origPush === "function") {
      hist.pushState = function (...args: any[]) { const r = origPush.apply(this, args); onRouteChange(); return r; };
    }
    if (typeof origReplace === "function") {
      hist.replaceState = function (...args: any[]) { const r = origReplace.apply(this, args); onRouteChange(); return r; };
    }
    win.addEventListener("popstate", onRouteChange);
    win.addEventListener("hashchange", onRouteChange);

    return () => {
      alive = false;
      teardownObservers(observers);
      for (let i = 0; i < observers.length; i++) observerDisposed();
      window.clearInterval(safetyPoll);
      timerDisposed();
      unsubSession();
      subscriptionDisposed();
      try { doc.removeEventListener('focusin', onFocusChange, true); } catch {}
      try { doc.removeEventListener('focusout', onFocusChange, true); } catch {}
      win.removeEventListener("hashchange", updateMount);
      win.removeEventListener("popstate", updateMount);
      win.removeEventListener("popstate", onRouteChange);
      win.removeEventListener("hashchange", onRouteChange);
      teardownHistoryPatches(hist, origPush, origReplace);
      scrollSyncCancel?.();
      if (removeTimer) { clearTimeout(removeTimer); removeTimer = null; }
      if (checkHiddenTrailing) { clearTimeout(checkHiddenTrailing); checkHiddenTrailing = null; }
      removeSharedMountIfLast(observedDocs);
    };
  }, []);

  useEffect(() => {
    if (!mountEl) return;
    let alive = true;
    mountEl.dataset.deckShelvesRenderer = 'react';
    const applyBodyClasses = (s: any) => {
      try {
        document.body?.classList?.toggle('ds-hide-non-steam-badges', s?.globalHideNonSteamBadge === true);
      } catch {}
    };
    const unsub = subscribeSettings((s) => { if (alive) { setSettings(s); applyBodyClasses(s); } });
    refreshSettings().then((s) => { if (alive) { setSettings(s); applyBodyClasses(s); } }).catch(() => undefined);

    const onSettingsChanged = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && alive) { setSettings(detail); applyBodyClasses(detail); }
    };
    globalThis.addEventListener("deck-shelves-settings-changed", onSettingsChanged);

    return () => {
      alive = false;
      unsub();
      globalThis.removeEventListener("deck-shelves-settings-changed", onSettingsChanged);
      try { document.body.classList.remove('ds-hide-non-steam-badges'); } catch {}
      delete mountEl.dataset.deckShelvesRenderer;
    };
  }, [mountEl]);

  const prevEnabledRef = useRef(sv.enabled);
  useEffect(() => {
    if (!settings) return;
    if (prevEnabledRef.current === true && settings.enabled === false) {
      try {
        const docs = [getPreferredSteamDocument(), ...getAllSteamDocuments()];
        let native: HTMLElement | null = null;
        const seen = new Set<Document>();
        for (const dc of docs) {
          if (!dc || seen.has(dc)) continue;
          seen.add(dc);
          native = dc.querySelector(
            [...steamTextSelectors("recentGames", "aria-label", "contains", " .Focusable"), '[role="list"] .Panel.Focusable'].join(", ")
          ) as HTMLElement | null;
          if (native) break;
        }
        if (native) focusElementAuto(native);
      } catch {}
    }
    prevEnabledRef.current = settings.enabled;
  }, [settings?.enabled]);

  const [replaceKillSwitch, setReplaceKillSwitch] = useState(() => getRecentsReplaceFailed());
  useEffect(() => {
    const sync = () => setReplaceKillSwitch(getRecentsReplaceFailed());
    const unsub = subscribeRecentsReplaceFailed(sync);
    sync();
    return unsub;
  }, []);
  const [replaceInjecting, setReplaceInjecting] = useState(() => isRecentsReplaceInjecting());
  useEffect(() => {
    const sync = () => setReplaceInjecting(isRecentsReplaceInjecting());
    const unsub = subscribeRecentsReplaceInjecting(sync);
    sync();
    return unsub;
  }, []);

  useEffect(() => {
    const { canHide, replaceActive } = computeCanHideRecents({ settings, replaceKillSwitch });
    applyHideRecentsGated(canHide, shelvesRevealed);
    applyReplaceActiveMargin(replaceActive);
    const recentsEl = mountEl?.previousElementSibling as HTMLElement | null;
    applyRecentsFocusTrapGated(recentsEl, canHide, shelvesRevealed);
  }, [sv.hideRecents, sv.enabled, sv.shelves, sv.smartShelvesEnabled, sv.smartShelves, sv.recentsReplaceSource, mountEl, replaceKillSwitch, replaceInjecting, shelvesRevealed]);

  useEffect(() => {
    applyHideHomeTabs(settings?.enabled === true && settings?.hideHomeTabs === true);
  }, [sv.enabled, sv.hideHomeTabs, mountEl]);

  const [visibilityTick, setVisibilityTick] = useState(0);
  const smartList = sv.smartShelves;
  useEffect(() => {
    if (!settings?.smartShelvesEnabled) return;
    if (!Array.isArray(smartList) || smartList.length === 0) return;
    const now = new Date();
    const { earliest, timeAwareIds } = computeEarliestFlip(smartList, now);
    if (earliest == null) return;
    const delay = Math.max(1000, earliest - now.getTime());
    const t = window.setTimeout(() => {
      for (const id of timeAwareIds) invalidateSmartShelfCache(id);
      setVisibilityTick((n) => n + 1);
      try { triggerShelfRefresh({ deps: ['time'] }); } catch {}
    }, delay);
    return () => window.clearTimeout(t);
  }, [sv.smartShelvesEnabled, smartList, visibilityTick]);

  const [, setDeviceTick] = useState(0);
  useEffect(() => {
    const bump = () => setDeviceTick((n) => n + 1);
    const unDevice = subscribeDeviceState(bump);
    const unSession = subscribeSessionState(bump);
    const unPerf = subscribePerfState(bump);
    const unPeripherals = subscribePeripheralsState(bump);
    return () => { unDevice(); unSession(); unPerf(); unPeripherals(); stopFrameSampler(); };
  }, []);

  const smartShelves: Shelf[] = useMemo(() => {
    if (!settings?.smartShelvesEnabled) return [];
    if (settings.smartSurpriseMe) {
      const _now = new Date();
      const dayIndex = _now.getFullYear() * 10000 + (_now.getMonth() + 1) * 100 + _now.getDate();
      const rawCount = settings.smartSurpriseMeCount ?? 0;
      const count = rawCount > 0 ? rawCount : (1 + (dayIndex % 3));
      const selected = seededShuffle(SURPRISE_MODES, dayIndex).slice(0, count);
      return selected.map((mode): Shelf => ({
        id: `surprise_${mode}`,
        title: t(`smart_template_${mode}` as any),
        enabled: true,
        hidden: false,
        limit: 20,
        matchNativeSize: false,
        highlightFirst: false,
        highlightAll: false,
        hideStatusLine: false,
        hideNewBadge: false,
        hideDiscountBadge: false,
        hideCompatIcons: false,
        hideNonSteamBadge: false,
        hideShelfTitle: false,
        hideGameNames: false,
        hideInstallIndicator: false,
        hideSeeMore: false,
        hideRefreshCard: false,
        source: { type: "smart", mode },
      }));
    }
    return computeEnabledSmartShelves(settings.smartShelves);
  }, [sv.smartShelvesEnabled, sv.smartSurpriseMe, sv.smartSurpriseMeCount, sv.smartShelves, t, visibilityTick]);

  if (!mountEl) return null;
  if (!settings) return null;

  if (getMountFailed()) {
    logWarn("HOME", "mount failed — skipping render");
    return null;
  }

  const visibleShelves = (settings.shelves ?? []).filter((s) => s.enabled && !s.hidden);

  const normalShelves = computeNormalShelves(visibleShelves, replaceInjecting, replaceKillSwitch);

  const unifiedOn = (settings as any).unifiedListEnabled === true;
  const allShelvesOrder = explicitShelfOrder(settings);
  const normalFirst = computeNormalFirst(settings, replaceInjecting, replaceKillSwitch);
  let shelves: Shelf[] = computeShelvesOrder({ unifiedOn, allShelvesOrder, normalShelves, smartShelves, normalFirst });

  shelves = applyAutoPin(shelves, (s) => {
    const ap = (s as any).autoPin;
    return !!ap && Array.isArray(ap.rules) && ap.rules.length > 0 && evalVisibility({ visibility: ap } as any);
  }) as Shelf[];

  const interleaveSmart = computeInterleaveSmart({ unifiedOn, settings, replaceInjecting, replaceKillSwitch });

  if (skipHomeRender(settings, visibleShelves.length, isLatestInstance)) return null;
  logInfo("HOME", "rendering shelves via portal", { visible: shelves.length, mountConnected: mountEl.isConnected });

  const derived = computeDerivedGlobalFlags({ settings, replaceInjecting, replaceKillSwitch });
  return createPortal(
    <PlatformProvider platform={homePlatform}>
      <ShelvesContainer mountEl={mountEl} shelves={shelves} onSettleChange={setShelvesRevealed} {...containerPropsFromSettings(settings, derived, interleaveSmart)} />
      {isDebugOverlayEnabled(settings) ? <DebugOverlay mountEl={mountEl} shelves={shelves} /> : null}
    </PlatformProvider>,
    mountEl,
  ) as any;
}

function scanHomeChildren(parent: HTMLElement, mount: HTMLElement): { recentsVisible: boolean; tabsVisible: boolean } {
  let recentsVisible = false;
  let tabsVisible = false;
  for (const child of Array.from(parent.children) as HTMLElement[]) {
    if (child === mount) continue;
    const tablist = child.querySelector<HTMLElement>('[role="tablist"]');
    if (tablist) { if (child.offsetHeight > 8 || tablist.offsetHeight > 8) tabsVisible = true; continue; }
    if (child.offsetHeight <= 8) continue;
    recentsVisible = true;
  }
  return { recentsVisible, tabsVisible };
}

function computeEarliestFlip(smartList: any[], now: Date): { earliest: number | null; timeAwareIds: string[] } {
  let earliest: number | null = null;
  const timeAwareIds: string[] = [];
  for (const s of smartList) {
    const w = (s as any).visibleHours ?? getModeVisibilityWindows((s as any).mode);
    const entry = { visibility: (s as any).visibility, visibleHours: w, visibleDaysOfWeek: (s as any).visibleDaysOfWeek };
    const next = nextVisibilityFlip(entry, now);
    if (next == null) continue;
    timeAwareIds.push((s as any).id);
    if (earliest == null || next < earliest) earliest = next;
  }
  return { earliest, timeAwareIds };
}

function computeAutoCollapse(shelf: any, enabled: boolean): { forceCollapsed: boolean; autoCollapseWhenEmpty: boolean } {
  if (!enabled) return { forceCollapsed: false, autoCollapseWhenEmpty: false };
  const ac = shelf.autoCollapse;
  const forceCollapsed = !!ac && Array.isArray(ac.rules) && ac.rules.length > 0 && evalVisibility({ visibility: ac } as any);
  return { forceCollapsed, autoCollapseWhenEmpty: shelf.autoCollapseWhenEmpty === true };
}

type ShelvesContainerProps = { mountEl: HTMLElement; shelves: any[]; onSettleChange?: (settled: boolean) => void; globalMatchNativeSize?: boolean; globalHighlightFirst?: boolean; globalHighlightAll?: boolean; globalHighlightRandom?: boolean; globalHideStatusLine?: boolean; globalHideNewBadge?: boolean; globalHideDiscountBadge?: boolean; globalHideCompatIcons?: boolean; globalHideNonSteamBadge?: boolean; globalHideShelfTitle?: boolean; globalHideGameNames?: boolean; globalHideInstallIndicator?: boolean; globalHideSeeMore?: boolean; globalHideRefreshCard?: boolean; globalDedupeByName?: boolean; globalHeroEnabled?: boolean; globalGameInfoAbove?: boolean; globalFriendsPlayingOverlay?: boolean; globalFriendsPlayingOverlayRecent?: boolean; globalEnableLogo?: boolean; globalEnableIcon?: boolean; globalEnableDescription?: boolean; globalDescriptionBelowLogo?: boolean; globalLogoBelowShelf?: boolean; globalLogoPosition?: 'left' | 'center' | 'right'; globalDescriptionPosition?: 'left' | 'center' | 'right'; globalLogoSize?: number; globalLogoTopOffset?: number; globalFullPageShelf?: boolean; globalIconVerticalAlign?: 'top' | 'center' | 'bottom' | null; globalShelfTitlePosition?: 'left' | 'center' | 'right' | null; globalGameNamePosition?: 'left' | 'center' | 'right' | null; globalPlaytimePosition?: 'left' | 'center' | 'right' | null; globalDescriptionHeight?: number | null; shelfHeroBackground?: boolean; perShelfHeroAllowed?: boolean; hideRecentsSetting?: boolean; forceCssLoaderThemes?: boolean; interleaveSmart?: boolean; autoCollapseEnabled?: boolean };

const SHELVES_CONTAINER_DEFAULTS = {
  globalMatchNativeSize: false,
  globalHighlightFirst: false,
  globalHighlightAll: false,
  globalHighlightRandom: false,
  globalHideStatusLine: false,
  globalHideNewBadge: false,
  globalHideDiscountBadge: false,
  globalHideCompatIcons: false,
  globalHideNonSteamBadge: false,
  globalHideShelfTitle: false,
  globalHideGameNames: false,
  globalHideInstallIndicator: false,
  globalHideSeeMore: false,
  globalHideRefreshCard: false,
  globalDedupeByName: false,
  globalHeroEnabled: false,
  globalGameInfoAbove: false,
  globalFriendsPlayingOverlay: false,
  globalFriendsPlayingOverlayRecent: false,
  globalEnableLogo: false,
  globalEnableIcon: false,
  globalEnableDescription: false,
  globalDescriptionBelowLogo: false,
  globalLogoBelowShelf: false,
  globalFullPageShelf: false,
  shelfHeroBackground: false,
  perShelfHeroAllowed: false,
  hideRecentsSetting: false,
  forceCssLoaderThemes: false,
  interleaveSmart: false,
  autoCollapseEnabled: false,
} as const satisfies Partial<ShelvesContainerProps>;

const NATIVE_ROW_FOCUS: NativeRowFocus = { holdsFocus: nativeRecentsHoldsFocus, focusFirst: focusNativeRecentsFirstCard };

// While Steam's own row is on screen above our shelves, the first focus stays there.
function nativeRowOnScreen(doc: Document | null, hideRecents: boolean): boolean {
  return !hideRecents && !!doc && !!findNativeRecentsEl(doc);
}

// Steam's router doesn't use window history; the route commits after the router event.
function watchHomeLeave(mountEl: HTMLElement): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const release = (tries: number) => {
    timer = null;
    if (isHomeRoute() || releaseDetachedNavNodes(mountEl) >= 0 || tries >= 5) return;
    timer = setTimeout(() => release(tries + 1), 200);
  };
  let unlisten: unknown = null;
  try {
    const router = steamUIStore()?.WindowStore?.GamepadUIMainWindowInstance?.m_history;
    unlisten = router?.listen?.(() => { if (!timer && !isHomeRoute()) release(0); });
  } catch {}
  return () => {
    if (timer) clearTimeout(timer);
    if (typeof unlisten === "function") unlisten();
  };
}

function ShelvesContainer(props: ShelvesContainerProps) {
  const { mountEl, shelves, onSettleChange, globalMatchNativeSize, globalHighlightFirst, globalHighlightAll, globalHighlightRandom, globalHideStatusLine, globalHideNewBadge, globalHideDiscountBadge, globalHideCompatIcons, globalHideNonSteamBadge, globalHideShelfTitle, globalHideGameNames, globalHideInstallIndicator, globalHideSeeMore, globalHideRefreshCard, globalDedupeByName, globalHeroEnabled, globalGameInfoAbove, globalFriendsPlayingOverlay, globalFriendsPlayingOverlayRecent, globalEnableLogo, globalEnableIcon, globalEnableDescription, globalDescriptionBelowLogo, globalLogoBelowShelf, globalLogoPosition, globalDescriptionPosition, globalLogoSize, globalLogoTopOffset, globalFullPageShelf, globalIconVerticalAlign, globalShelfTitlePosition, globalGameNamePosition, globalPlaytimePosition, globalDescriptionHeight, shelfHeroBackground, perShelfHeroAllowed, hideRecentsSetting, forceCssLoaderThemes, interleaveSmart, autoCollapseEnabled } = withDefaults(props, SHELVES_CONTAINER_DEFAULTS);
  const [shelvesRevealed, setShelvesRevealed] = useState(false);
  const revealedOnceRef = useRef(false);
  useHeroIdlePause(mountEl);

  useEffect(() => {
    const navApi = detectNavTreeApi();
    logDiagnostic(
      navApi.available ? 'info' : 'warn',
      navApi.available ? 'Gamepad nav tree API available' : 'Gamepad nav tree API unavailable',
      navApi.detail,
    );

    const applyPatches = () => {
      // One try per install so a failure doesn't skip the ones after it.
      try { reparentNavTreeNodes(mountEl); } catch (e) { logInfo("HOME", "reparentNavTreeNodes failed", String(e)); }
      try { patchShelfEdgeNavigation(mountEl); } catch (e) { logInfo("HOME", "patchShelfEdgeNavigation failed", String(e)); }
      try { patchMenuButton(); } catch (e) { logInfo("HOME", "patchMenuButton failed", String(e)); }
      try { installVerticalFocusBridge(mountEl); } catch (e) { logInfo("HOME", "installVerticalFocusBridge failed", String(e)); }
      try { installPassiveMenuHook(); } catch (e) { logInfo("HOME", "installPassiveMenuHook failed", String(e)); }
      try { installPassiveShowContextMenuHook(); } catch (e) { logInfo("HOME", "installPassiveShowContextMenuHook failed", String(e)); }
      try { installLibraryContextMenuPatch(); } catch (e) { logInfo("HOME", "installLibraryContextMenuPatch failed", String(e)); }
      try { installCreateContextMenuPatch(); } catch (e) { logInfo("HOME", "installCreateContextMenuPatch failed", String(e)); }
      try { tryRestoreFocus(); } catch (e) { logInfo("HOME", "tryRestoreFocus failed", String(e)); }
    };
    const reparentOnly = () => {
      try { reparentNavTreeNodes(mountEl); } catch (e) { logInfo("HOME", "reparentOnly failed", String(e)); }
    };

    applyPatches();
    getPowerState();
    if (hasPendingFocus()) beginFocusRestoreLoop();
    else beginColdBootFocusGuard(shelves.map((s: any) => s.id), hideRecentsSetting ? undefined : NATIVE_ROW_FOCUS);

    let applyPending: number | null = null;
    const scheduleApplyPatches = () => {
      if (applyPending != null) return;
      applyPending = requestAnimationFrame(() => {
        applyPending = null;
        applyPatches();
      });
    };
    let reparentPending: number | null = null;
    const scheduleReparentOnly = () => {
      if (reparentPending != null) return;
      reparentPending = requestAnimationFrame(() => {
        reparentPending = null;
        reparentOnly();
      });
    };

    // The menu class chunk can arrive after mount on a cold boot.
    const menuPatchRetries = [400, 1000, 2000, 4000, 8000, 15000];
    const menuRetryTimers: ReturnType<typeof setTimeout>[] = [];
    const tryInstall = () => {
      try { installLibraryContextMenuPatch(); } catch {}
      try { installCreateContextMenuPatch(); } catch {}
    };
    for (const d of menuPatchRetries) {
      menuRetryTimers.push(setTimeout(tryInstall, d));
    }
    // Once recents is hidden Steam stops mounting its cards, so capture the menu while it is visible.
    const disposePrewarm = prewarmMenuExtraction();

    const obs = new MutationObserver(scheduleApplyPatches);
    obs.observe(mountEl, { childList: true, subtree: true });

    // Steam re-registers our nav node at the wrong level when it re-adds the mount's siblings.
    let parentObs: MutationObserver | null = null;
    if (mountEl.parentElement) {
      parentObs = new MutationObserver(scheduleReparentOnly);
      parentObs.observe(mountEl.parentElement, { childList: true });
    }

    const poll = window.setInterval(() => { if (!homeBehindGame()) reparentOnly(); }, 3000);

    const doc = mountEl.ownerDocument;
    const onFocusIn = () => scheduleReparentOnly();
    doc?.addEventListener("focusin", onFocusIn, true);

    const win = getPreferredSteamWindow();
    const onNavEvent = () => { applyPatches(); if (hasPendingFocus()) beginFocusRestoreLoop(); };
    win.addEventListener("popstate", onNavEvent);
    win.addEventListener("hashchange", onNavEvent);

    const stopHomeLeaveWatch = watchHomeLeave(mountEl);

    return () => {
      stopHomeLeaveWatch();
      obs.disconnect();
      parentObs?.disconnect();
      window.clearInterval(poll);
      for (const t of menuRetryTimers) { try { clearTimeout(t); } catch {} }
      disposePrewarm();
      doc?.removeEventListener("focusin", onFocusIn, true);
      win.removeEventListener("popstate", onNavEvent);
      win.removeEventListener("hashchange", onNavEvent);
      if (applyPending != null) cancelAnimationFrame(applyPending);
      if (reparentPending != null) cancelAnimationFrame(reparentPending);
    };
  }, [mountEl]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const visible = (shelves ?? []).filter((s) => s.enabled && !s.hidden);
        if (!hideRecentsSetting) { if (alive) dispatchHideRecentsDisabled(false); return; }
        if (!visible.length) {
          applyHideRecents(false);
          if (alive) dispatchHideRecentsDisabled(true);
          return;
        }
        const anyHas = anyShelfWarmWithItems(visible)
          || await anyShelfHasItems(visible, (source, limit) => homePlatform.resolveShelfAppIds(source as any, limit));
        settleHideCheck(alive, anyHas, shelvesRevealed);
      } catch (e) {
        if (alive) dispatchHideRecentsDisabled(false);
      }
    };
    void check();
    return () => { alive = false; };
  }, [shelves, hideRecentsSetting, mountEl, shelvesRevealed]);

  useEffect(() => {
    devStamp("__ds_focus_effect_ran", { t: Date.now(), mountEl: !!mountEl, hideRecents: hideRecentsSetting, shelvesLen: shelves?.length ?? 0 });
    let cancelled = false;
    let restorePendingSeen = false;

    const aRealCardHasFocus = (): boolean => {
      const doc = mountEl.ownerDocument;
      if (!doc) return false;
      const gp = doc.querySelector<HTMLElement>('.gpfocus');
      if (!gp) return false;
      if (gp.closest('.ds-card')) return true;
      const native = findNativeRecentsEl(doc);
      return !!(native && native.contains(gp));
    };

    const focusFirstVisibleShelf = (): boolean => {
      const doc = mountEl.ownerDocument;
      if ((!hideRecentsSetting || !shelvesRevealed) && doc && focusNativeRecentsFirstCard(doc)) {
        devStamp("__ds_focus_first", { t: Date.now(), why: 'native-first' });
        return true;
      }
      if (!shelvesRevealed || nativeRowOnScreen(doc, hideRecentsSetting)) return false;
      const firstCard = mountEl.querySelector('.ds-shelf .ds-card') as HTMLElement | null;
      if (firstCard && focusElementAuto(firstCard)) {
        devStamp("__ds_focus_first", { t: Date.now(), why: 'ds-first' });
      }
      return !!mountEl.querySelector('.ds-shelf .gpfocus, .deck-shelves-root .gpfocus');
    };

    const tryFocus = (): boolean => {
      if (cancelled) return true;
      try {
        if (hasPendingFocus()) { restorePendingSeen = true; beginFocusRestoreLoop(); return false; }
        if (aRealCardHasFocus()) return true;
        if (restorePendingSeen) return true;
        return focusFirstVisibleShelf();
      } catch (e) { logInfo("HOME", "focus first shelf failed", String(e)); return false; }
    };

    if (tryFocus()) return () => { cancelled = true; };
    const stopPoll = startFocusFirstPoll(tryFocus, aRealCardHasFocus);
    return () => { cancelled = true; stopPoll(); };
  }, [hideRecentsSetting, mountEl, shelves?.length, shelvesRevealed]);

  const rootRef = useRef<HTMLDivElement>(null);
  const orderedRef = useRef<any[]>(shelves);

  // display:none, not visibility, so Steam's nav tree skips hidden shelves.
  useEffect(() => {
    if (revealedOnceRef.current) return;
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const startedAt = Date.now();
    const REVEAL_TIMEOUT_MS = 5000;
    let shown = false;
    const ids = shelfIdsOf(shelves);
    const warm = allShelvesWarm(ids);
    const scan = () => {
      const renderedEls = Array.from(rootEl.querySelectorAll<HTMLElement>('.ds-shelf[data-shelfid]'));
      const complete = warm || ids.every((id) => isShelfResolved(id)) || renderedEls.length >= ids.length || Date.now() - startedAt >= REVEAL_TIMEOUT_MS;
      const visible = applyProgressiveReveal(renderedEls, shelfIdsOf(orderedRef.current), complete);
      if (visible > 0 && !shown) { shown = true; setShelvesRevealed(true); onSettleChange?.(true); }
      if (complete) revealedOnceRef.current = true;
    };
    scan();
    const obs = new MutationObserver(scan);
    obs.observe(rootEl, { childList: true, subtree: false });
    observerCreated();
    const unsubResolved = subscribeShelfResolved(scan);
    const revealTimer = setTimeout(scan, REVEAL_TIMEOUT_MS);
    timerCreated();
    return () => {
      obs.disconnect(); observerDisposed();
      unsubResolved();
      clearTimeout(revealTimer); timerDisposed();
    };
  }, [shelves, onSettleChange]);

  const [firstVisibleId, setFirstVisibleId] = useState<string | null>(null);
  useEffect(() => {
    if (!hideRecentsSetting) { setFirstVisibleId(null); return; }
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const startedAt = Date.now();
    const SETTLE_TIMEOUT_MS = 3000;
    const scan = () => {
      const renderedIds = new Set(
        Array.from(rootEl.querySelectorAll<HTMLElement>('.ds-shelf[data-shelfid]'))
          .map((el) => el.getAttribute('data-shelfid'))
          .filter((id): id is string => !!id),
      );
      if (!isShelfSetSettled(renderedIds.size, (shelves ?? []).length, Date.now() - startedAt, SETTLE_TIMEOUT_MS)) return;
      const pick = pickFirstVisibleShelfId(shelves ?? [], renderedIds);
      setFirstVisibleId((prev) => (prev === pick ? prev : pick));
    };
    scan();
    const obs = new MutationObserver(scan);
    obs.observe(rootEl, { childList: true, subtree: false });
    observerCreated();
    const settleTimer = setTimeout(scan, SETTLE_TIMEOUT_MS);
    timerCreated();
    return () => { obs.disconnect(); observerDisposed(); clearTimeout(settleTimer); timerDisposed(); };
  }, [hideRecentsSetting, shelves]);

  const [cssLoaderTick, setCssLoaderTick] = useState(0);

  useEffect(() => {
    if (!hideRecentsSetting && !forceCssLoaderThemes) return;
    if (!firstVisibleId && !forceCssLoaderThemes) return;
    if (!isCssLoaderActive()) return;
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const nativeClass = getNativeRecentsClassName(mountEl);
    if (!nativeClass) return;
    const nativeRecentsEl = mountEl.previousElementSibling as HTMLElement | null;
    nativeRecentsEl?.setAttribute('data-ds-native-recents', 'true');

    const applyAll = () => {
      const firstShelf = firstVisibleId
        ? rootEl.querySelector<HTMLElement>(`.ds-shelf[data-shelfid="${CSS.escape(firstVisibleId)}"]`)
        : null;
      const all = Array.from(rootEl.querySelectorAll<HTMLElement>('.ds-shelf[data-shelfid]'));
      const targets = forceCssLoaderThemes ? all : (firstShelf ? [firstShelf] : []);
      for (const t of targets) {
        t.classList.add(nativeClass);
        t.setAttribute('data-ds-recents-slot', 'true');
      }
    };
    applyAll();
    const obs = new MutationObserver(applyAll);
    obs.observe(rootEl, { childList: true, subtree: false });
    return () => {
      obs.disconnect();
      for (const t of rootEl.querySelectorAll<HTMLElement>('.ds-shelf[data-shelfid]')) {
        try { t.removeAttribute('data-ds-recents-slot'); t.classList.remove(nativeClass); } catch {}
      }
      try { nativeRecentsEl?.removeAttribute('data-ds-native-recents'); } catch {}
    };
  }, [hideRecentsSetting, firstVisibleId, mountEl, forceCssLoaderThemes, shelves, cssLoaderTick]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let lastActive = isCssLoaderActive();
    const setFlag = (attr: string, on: boolean) => {
      if (on) root.setAttribute(attr, 'true');
      else root.removeAttribute(attr);
    };
    const apply = () => {
      try {
        applyRootThemeFlags(root);
        setFlag('data-ds-force-themes', forceCssLoaderThemes);
        setFlag('data-ds-recents-hidden', hideRecentsSetting);
        setFlag('data-ds-hero-background', shelfHeroBackground);
        const nowActive = isCssLoaderActive();
        if (nowActive && !lastActive) setCssLoaderTick((v) => v + 1);
        lastActive = nowActive;
      } catch {}
    };
    apply();
    const observers: MutationObserver[] = [];
    const seen = new Set<Element>();
    const observeHead = (d: Document | null | undefined) => {
      const head = d?.head ?? d?.documentElement;
      if (!head || seen.has(head)) return;
      seen.add(head);
      const o = new MutationObserver(apply);
      o.observe(head, { childList: true });
      observers.push(o);
    };
    observeHead(getPreferredSteamDocument());
    for (const d of getAllSteamDocuments()) observeHead(d);
    return () => {
      for (const o of observers) { try { o.disconnect(); } catch {} }
      try {
        clearRootThemeFlags(root);
        root.removeAttribute('data-ds-force-themes');
        root.removeAttribute('data-ds-recents-hidden');
      } catch {}
    };
  }, [mountEl, forceCssLoaderThemes, hideRecentsSetting]);

  useContainerDragReorder<string>({
    containerRef: rootRef,
    itemSelector: '.ds-shelf[data-shelfid]',
    getItemId: (el) => {
      const id = el.getAttribute('data-shelfid');
      if (!id) return null;
      const s = getCurrentSettings();
      return s?.shelves?.some((sh: any) => sh.id === id) ? id : null;
    },
    getOrder: () => {
      const s = getCurrentSettings();
      return (s?.shelves ?? []).map((sh: any) => sh.id as string);
    },
    onReorder: (newIds) => {
      const s = getCurrentSettings();
      if (!s) return;
      const map = new Map(s.shelves.map((sh: any) => [sh.id, sh]));
      const next = newIds.map((id) => map.get(id)).filter(Boolean) as any[];
      for (const sh of s.shelves) if (!newIds.includes(sh.id)) next.push(sh);
      void saveSettings({ ...s, shelves: next });
    },
    axis: 'vertical',
    allowedPointerTypes: ['mouse', 'touch'],
  });

  // Reorder the array instead of using CSS order: gamepad focus follows DOM order.
  const orderedShelves = useMemo(() => {
    if (!interleaveSmart) return shelves;
    return interleaveSmartShelves(shelves, firstVisibleId);
  }, [shelves, interleaveSmart, firstVisibleId]);
  orderedRef.current = orderedShelves as any[];

  // Steam sometimes injects its own nodes into the root; hide them, since React may still own them.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const hideForeign = () => {
      for (const child of Array.from(root.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.classList.contains('ds-shelf')) continue;
        if (child.getAttribute('data-ds-foreign') === 'true') continue;
        child.setAttribute('data-ds-foreign', 'true');
        child.style.display = 'none';
      }
    };
    hideForeign();
    const obs = new MutationObserver(hideForeign);
    obs.observe(root, { childList: true });
    return () => obs.disconnect();
  }, []);

  return (
    <Focusable
      ref={rootRef}
      className="deck-shelves-root"
      {...flowChildrenProps("column")}
      style={{ width: "100%", display: shelvesRevealed ? "flex" : "none", flexDirection: "column", paddingBottom: 8, marginBottom: 24, position: "relative" }}
    >
      {orderedShelves.map((shelf: any, shelfIndex: number) => {
        const ac = computeAutoCollapse(shelf, autoCollapseEnabled);
        return <ShelfView key={shelf.id} shelf={shelf} eagerRender={shelfIndex < 2} forceCollapsed={ac.forceCollapsed} autoCollapseWhenEmpty={ac.autoCollapseWhenEmpty} globalMatchNativeSize={globalMatchNativeSize} globalHighlightFirst={globalHighlightFirst} globalHighlightAll={globalHighlightAll} globalHighlightRandom={globalHighlightRandom} globalHideStatusLine={globalHideStatusLine} globalHideNewBadge={globalHideNewBadge} globalHideDiscountBadge={globalHideDiscountBadge} globalHideCompatIcons={globalHideCompatIcons} globalHideNonSteamBadge={globalHideNonSteamBadge} globalHideShelfTitle={globalHideShelfTitle} globalHideGameNames={globalHideGameNames} globalHideInstallIndicator={globalHideInstallIndicator} globalHideSeeMore={globalHideSeeMore} globalHideRefreshCard={globalHideRefreshCard} globalDedupeByName={globalDedupeByName} globalHeroEnabled={globalHeroEnabled} globalGameInfoAbove={globalGameInfoAbove} globalFriendsPlayingOverlay={globalFriendsPlayingOverlay} globalFriendsPlayingOverlayRecent={globalFriendsPlayingOverlayRecent} globalEnableLogo={globalEnableLogo} globalEnableIcon={globalEnableIcon} globalEnableDescription={globalEnableDescription} globalDescriptionBelowLogo={globalDescriptionBelowLogo} globalLogoBelowShelf={globalLogoBelowShelf} globalLogoPosition={globalLogoPosition} globalDescriptionPosition={globalDescriptionPosition} globalLogoSize={globalLogoSize} globalLogoTopOffset={globalLogoTopOffset} globalFullPageShelf={globalFullPageShelf} globalIconVerticalAlign={globalIconVerticalAlign} globalShelfTitlePosition={globalShelfTitlePosition} globalGameNamePosition={globalGameNamePosition} globalPlaytimePosition={globalPlaytimePosition} globalDescriptionHeight={globalDescriptionHeight} heroForced={perShelfHeroAllowed && shelfHeroBackground && shelf.id === firstVisibleId} heroLabelMount={perShelfHeroAllowed && (forceCssLoaderThemes || (hideRecentsSetting && shelf.id === firstVisibleId))} forceExpanded={hideRecentsSetting && shelf.id === firstVisibleId} forceLayoutAsRecents={forceCssLoaderThemes && !(hideRecentsSetting && shelf.id === firstVisibleId)} />;
      })}
      <BadgeFocusOverlay />
      <FriendsAvatarOverlay />
    </Focusable>
  );
}
