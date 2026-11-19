import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { homePlatform, ShelvesContainer } from "./home/ShelvesContainer";
import { DebugOverlay } from "./DebugOverlay";
import { isDebugOverlayEnabled } from "../runtime/debugOverlay";
import type { Settings, Shelf } from "../types";
import { refreshSettings, subscribeSettings } from "../settingsStore";
import { PlatformProvider } from "../runtime/platformContext";
import { logInfo, logWarn } from "../runtime/logger";
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../runtime/steamHost";
import { ROOT_ID, seededShuffle, isHomeRoute, hasHomeDomSignals, findOrCreateMount, homeBehindGame, removeOwnMounts } from "./home/mountUtils";
import { reapplyHomeHides, enforceHomeFocusSuppression, applyHideHomeTabs, applyReplaceActiveMargin, getMountFailed, getPendingHideRecents, getPendingHideHomeTabs } from "../runtime/homePatch";
import { getRecentsReplaceFailed, subscribeRecentsReplaceFailed, isRecentsReplaceInjecting, subscribeRecentsReplaceInjecting } from "../runtime/recentsReplace";
import { focusElementAuto, getLastFocusedElement, saveFocusTargetFromFocusedCard } from "../core/focusRestore";
import { getPowerState } from "../runtime/powerGate";
import { recordBootStarted, recordBootCompleted } from "../runtime/safeMode";
import { triggerShelfRefresh } from "../core/shelfRefresh";
import { bumpAssetRevision } from "../core/assetRevision";
import { applyAutoPin } from "../domain/shelfOrder";
import { evalVisibility, invalidateSmartShelfCache } from "../steam/smartShelves";
import { subscribeDeviceState } from "../runtime/deviceState";
import { subscribeSessionState, getSessionState } from "../runtime/sessionState";
import { subscribePerfState, stopFrameSampler } from "../runtime/perfState";
import { subscribePeripheralsState } from "../runtime/peripheralsState";
import { computeNormalShelves, computeShelvesOrder, computeInterleaveSmart, computeDerivedGlobalFlags, computeEnabledSmartShelves, computeCanHideRecents, teardownObservers, teardownHistoryPatches } from "./home/homeInjectHelpers";
import { markMountStart, recordMountDone, resetMountCounters, recordReconcile, recordDomCallback, recordRender, timerCreated, timerDisposed, observerCreated, observerDisposed, subscriptionCreated, subscriptionDisposed } from "../core/perfMetrics";
import { steamTextSelectors } from "../steam/steamText";
import { useHomeInstanceRegistry, markBridgeFilled, claimMount, removeSharedMountIfLast } from "./home/homeInstances";
import { applyHideRecentsGated, applyRecentsFocusTrapGated, skipHomeRender, scanHomeChildren } from "./home/homeReveal";
import { SURPRISE_MODES, computeNormalFirst, explicitShelfOrder, computeEarliestFlip } from "./home/homeShelfList";

export { bridgeHasFilledHome } from "./home/homeInstances";

function subtreeIsAlive(): boolean {
  try { return !!getPreferredSteamDocument().getElementById(ROOT_ID)?.querySelector('.deck-shelves-root'); } catch { return false; }
}
function refreshSurvivedSubtree(survived: boolean): void {
  if (!survived) return;
  try { triggerShelfRefresh(); } catch {}
}

const EMPTY_SETTINGS_VIEW = Object.freeze({}) as Partial<Settings>;

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
