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
import { ROOT_ID, seededShuffle, isHomeRoute, hasHomeDomSignals, detectNavTreeApi, findOrCreateMount } from "./home/mountUtils";
import { applyHideRecents, reapplyHomeHides, enforceHomeFocusSuppression, applyHideHomeTabs, applyReplaceActiveMargin, getMountFailed, getPendingHideRecents, getPendingHideHomeTabs } from "../runtime/homePatch";
import { getRecentsReplaceFailed, subscribeRecentsReplaceFailed, isRecentsReplaceInjecting, subscribeRecentsReplaceInjecting } from "../runtime/recentsReplace";
import { Focusable } from "../runtime/host/decky";
import { installPassiveMenuHook, installPassiveShowContextMenuHook, installLibraryContextMenuPatch, installCreateContextMenuPatch, prewarmMenuExtraction } from "../core/steamGameMenu";
import { tryRestoreFocus, hasPendingFocus, beginFocusRestoreLoop, beginColdBootFocusGuard, focusElement, getLastFocusedElement, saveFocusTargetFromFocusedCard } from "../core/focusRestore";
import { allShelvesWarm, getShelfWarmEntry, isShelfResolved, subscribeShelfResolved } from "./shelf/shelfWarmState";
import { recordBootStarted, recordBootCompleted } from "../runtime/safeMode";
import { focusNativeRecentsFirstCard, findNativeRecentsEl } from "../features/sidenav/ShelfSideNav";
import { patchShelfEdgeNavigation, patchMenuButton, installVerticalFocusBridge, reparentNavTreeNodes } from "./home/navPatches";
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
import { isCssLoaderActive, getNativeRecentsClassName, isArtHeroActive, isNoHeroGradientActive, isHeroFullscreenActive, isNoHomeTextActive, isFocusRoundCompatActive, isTiltedHomeActive, getTiltedHomeMode, isBigArtModeActive } from "../core/cssLoaderDetect";
import { BadgeFocusOverlay } from "./shelf/BadgeFocusOverlay";
import { FriendsAvatarOverlay } from "./shelf/FriendsAvatarOverlay";
import { computeNormalShelves, computeShelvesOrder, computeInterleaveSmart, computeDerivedGlobalFlags, computeEnabledSmartShelves, computeCanHideRecents, applyRecentsFocusTrap, teardownObservers, teardownHistoryPatches, dispatchHideRecentsDisabled, anyShelfHasItems } from "./home/homeInjectHelpers";
import { markMountStart, recordMountDone, resetMountCounters, recordReconcile, recordDomCallback, recordRender, timerCreated, timerDisposed, observerCreated, observerDisposed, subscriptionCreated, subscriptionDisposed } from "../core/perfMetrics";

const homePlatform = createDeckyPlatform();

const SURPRISE_MODES: SmartShelfMode[] = [
  "daily_pick", "deck_picks", "on_deck", "recently_played", "long_session",
  "random_pick", "not_started", "best_unplayed", "quick_play", "interrupted",
  "non_steam", "spare_time", "time_of_day", "rediscover", "forgotten",
];

// Mount + anchor + home-detection helpers live in ./home/mountUtils.

// A remount resolves every shelf itself; only a subtree that survived the
// trip (quick bounce inside the removal debounce) needs the forced resolve —
// a second coalesced resolve would just re-render the whole Home again.
/* Synchronous claim stamped the moment the bridge takes the root — BEFORE
   React commits into it. The same-window DOM fallback in homePatch yields to
   a fresh claim, so it no longer races the bridge's first commit and mounts
   a second HomeShelves into the same root (measured: every route return). */
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

/* While a reveal is still pending, leave the hide state as the previous
   instance left it rather than un-hiding: a fresh instance taking over a
   root that was already hidden would otherwise flash native recents for
   the one frame before its own reveal re-hides them. */
function applyHideRecentsGated(hide: boolean, revealed: boolean): void {
  if (hide && !revealed) return;
  applyHideRecents(hide && revealed);
}
function applyRecentsFocusTrapGated(recentsEl: HTMLElement | null, hide: boolean, revealed: boolean): void {
  if (!recentsEl || (hide && !revealed)) return;
  applyRecentsFocusTrap(recentsEl, hide && revealed);
}
function shelfIdsOf(shelves: any[] | null | undefined): string[] {
  return (shelves ?? []).map((s: any) => s.id);
}
/* Marks rendered shelves that must wait (`data-ds-pending`, CSS hides them)
   and returns how many are showing. Once the set is settled everything
   rendered shows. */
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

/* Live HomeShelves instances: the router-hook bridge and homePatch's DOM
   fallback can be mounted at once, all portaling into the same root, so exactly
   one renders — the latest bridge instance once a bridge has ever filled the
   root this session; fallbacks only when no bridge is live or it never filled
   (sole host). Only the last instance out removes the shared mount node. */
let homeInstanceSeq = 0;
const liveHomeInstances = new Map<number, boolean>(); // id → isFallback
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
  if (__DEV__) { try { (globalThis as any).__ds_home_instances = Array.from(liveHomeInstances.entries()); } catch {} }
}
// Remove the mount from every doc we may have created it in, not just
// preferred — unless a newer instance is still live and portaling into it.
function removeSharedMountIfLast(docs: Iterable<Document>): void {
  if (liveHomeInstances.size !== 0) return;
  for (const d of docs) { try { d.getElementById(ROOT_ID)?.remove(); } catch {} }
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

export function HomeShelves({ fallback = false }: { fallback?: boolean }) {
  recordRender();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);
  // Reported by ShelvesContainer's own one-time reveal-gate effect (Option
  // C — see that effect's own comment). Native recents can't be hidden
  // until this flips true, so the two never go out of sync.
  const [shelvesRevealed, setShelvesRevealed] = useState(false);
  // Declared before the mount effect so its cleanup runs first on unmount —
  // the mount cleanup below then sees whether another instance is still live.
  const isLatestInstance = useHomeInstanceRegistry(fallback);
  // A bridge instance that revealed shelves has proven its portal attaches here.
  useEffect(() => { if (shelvesRevealed && !fallback) markBridgeFilled(); }, [shelvesRevealed, fallback]);

  useEffect(() => {
    let alive = true;
    markMountStart();
    recordBootStarted();
    resetMountCounters();
    let mountRecorded = false;

    /* Debounce mount removal: a brief route-detector failure (e.g. getPreferredSteamWindow
       returns a window whose location isn't settled yet) would immediately unmount the portal
       and flash native recents. Wait 600 ms before actually removing — if home becomes
       visible again within the window, cancel the removal. Additive only; no impact on 3.7. */
    let removeTimer: ReturnType<typeof setTimeout> | null = null;
    // Set once the observer block below exists (updateMount runs before it).
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
              getPreferredSteamDocument().getElementById(ROOT_ID)?.remove();
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
    /* Observe every known Steam doc — SharedJSContext can blow away our
       mount from under the BigPicture body, so a single `preferred.body`
       observer isn't enough. Each mutation drives mount re-discovery AND
       the hide-state check via scheduleHomeReconcile (declared below —
       safe, it only runs once a mutation lands later). */
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
    /* Discovery mode (body-subtree observers on every Steam doc) only until
       the mount lands; then the observers narrow to the home section around
       the mount plus a childList canary on its parent, so QAM / toast / other
       pages' mutations stop waking the reconcile. If the section goes away,
       the canary (else the 5 s poll / focus / route events) re-enters discovery. */
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
      if (__DEV__) { try { (globalThis as any).__ds_home_observer_scope = 'discovery'; } catch {} }
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
      if (__DEV__) { try { (globalThis as any).__ds_home_observer_scope = 'section'; } catch {} }
    };
    enterDiscovery();
    if (__DEV__) { try { (globalThis as any).__ds_home_observer_scope = 'discovery'; } catch {} }
    scopeHook = scopeObserversTo;
    { const existing = doc.getElementById(ROOT_ID) as HTMLElement | null; if (existing?.isConnected) scopeObserversTo(existing); }

    /* State-divergence check: Steam re-renders the home DOM without our
       hides (B from library, route swap, etc.). Checked in BOTH directions —
       a mount/DOM churn event (e.g. an external display connecting) can
       skip the un-hide call a profile-trigger revert relies on, otherwise
       leaving recents stuck hidden with nothing to self-correct it. */
    /* Layout-reading scan (getBoundingClientRect/elementFromPoint per child):
       during a route return Steam mutates the body for ~1 s straight, which
       used to run this every frame (~190 ms of scans per return). Cap it to
       one run per window with a trailing run so the final state is checked. */
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
        // Visibility can match while a re-rendered row still holds a reachable
        // (tabindex>=0) focusable the nav tree traps on — heal that every tick.
        enforceHomeFocusSuppression();
      } catch {}
    };
    /* Event-driven in place of the old 250ms poll: the same DOM mutation that
       causes Steam's re-render to drop our hides is what the observers below
       already watch for, so checkHidden rides that signal (+ focus changes)
       rAF-batched instead of ticking blind. A single rAF covers whichever of
       updateMount/checkHidden actually needs to run this frame. */
    let reconcileScheduled = false;
    const scheduleHomeReconcile = () => {
      // Suspended while a game is running (Home is backgrounded) — the
      // observers/focus listeners still fire, but do no further work at all.
      if (!alive || reconcileScheduled || getSessionState().gameRunning) return;
      reconcileScheduled = true;
      requestAnimationFrame(() => {
        reconcileScheduled = false;
        if (!alive) return;
        updateMount();
        checkHidden();
      });
    };
    // Also re-check on every focus change inside the home — Steam tends
    // to rebuild parts of the tree when focus crosses the DS root edge.
    const onFocusChange = () => { scheduleHomeReconcile(); };
    doc.addEventListener('focusin', onFocusChange, true);
    doc.addEventListener('focusout', onFocusChange, true);
    // Catch up once immediately on returning from a game — nothing else
    // reconciled while suspended, so state may have drifted meanwhile.
    const unsubSession = subscribeSessionState(() => {
      if (!getSessionState().gameRunning) scheduleHomeReconcile();
    });
    subscriptionCreated();

    /* Slow safety net (5s, Home-visible only): catches the rare case a hide
       mismatch isn't accompanied by a body-subtree mutation or focus change
       at all. Replaces the old unconditional 250ms/2000ms pair — the real
       work now rides the mutation/focus-driven path above. */
    const SAFETY_POLL_MS = 5000;
    const safetyPoll = window.setInterval(() => {
      if (!alive || !(isHomeRoute() || hasHomeDomSignals())) return;
      scheduleHomeReconcile();
    }, SAFETY_POLL_MS);
    timerCreated();
    win.addEventListener("hashchange", updateMount);
    win.addEventListener("popstate", updateMount);

    // Patch history.pushState/replaceState so SPA navigations synchronously
    /* trigger updateMount (no 2s fallback wait when returning to home).
       HomeShelves only mounts while on the home route, so wasOnHome is always true
       at effect run time. If isHomeRoute() fails briefly (window not settled yet on
       restart), wasOnHome=false would cause onRouteChange to fire triggerShelfRefresh
       immediately — the "strange reload" the user sees after Steam restart. */
    let wasOnHome = true;
    // Cancels the in-flight focused-card scroll retry (one per return at most).
    let scrollSyncCancel: (() => void) | null = null;
    const onRouteChange = () => {
      const nowOnHome = isHomeRoute();
      // Leaving by any path: remember the focused card so the rebuilt Home
      // restores it (keep-selection on return).
      if (!nowOnHome && wasOnHome) { try { saveFocusTargetFromFocusedCard(); } catch {} }
      if (nowOnHome && !wasOnHome) {
        // Sampled BEFORE updateMount() re-creates the root, or it always looks alive.
        const subtreeSurvived = subtreeIsAlive();
        updateMount();
        /* Bump asset revision so any custom artwork the user replaced
           off-screen flushes through the `?c=<rev>` cache buster on
           /customimages/ paths; the forced resolve that used to follow is
           now only issued when the subtree survived the trip. */
        try { bumpAssetRevision(); } catch {}
        refreshSurvivedSubtree(subtreeSurvived);
        // No triggerShelfRefresh here — B-return shouldn't force a
        /* global online re-fetch.
           Steam re-renders BOTH native recents AND home tabs on every route
           entry back to home (B from library, etc.). The freshly mounted
           siblings arrive without our hides, so they flash back into view.
           Re-apply both hide states so they collapse again before the next paint. */
        try { reapplyHomeHides(); enforceHomeFocusSuppression(); } catch {}
        /* Steam restores the previously-focused DS card on B-return, but the
           mount's scroll container can be at the top, leaving that card off
           screen — measured live at 268px above the viewport, so the gamepad
           was driving an invisible card and the home looked frozen. */
        /* Keyed off the nav tree's own last-focus node, NOT the `gpfocus` class
           (unreliable on this build), and retried until the card actually
           exists: the shelves can take seconds to render, so the old fixed
           150/400/800ms attempts all ran before there was anything to scroll. */
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

  // Issue #68: restore focus to the native recents shelf when the plugin is
  // disabled while focus is inside DS shelves — otherwise focus disappears
  // and the user must navigate blindly.
  const prevEnabledRef = useRef(settings?.enabled);
  useEffect(() => {
    if (!settings) return;
    if (prevEnabledRef.current === true && settings.enabled === false) {
      try {
        /* Sweep every known Steam doc — preferred may point at SharedJSContext
           while the visual native recents lives in BigPic. Case-insensitive
           attribute match catches PT-BR "Jogados Recentemente" /
           "Adicionados Recentemente" alongside the older "Jogos recentes". */
        const docs = [getPreferredSteamDocument(), ...getAllSteamDocuments()];
        let native: HTMLElement | null = null;
        const seen = new Set<Document>();
        for (const dc of docs) {
          if (!dc || seen.has(dc)) continue;
          seen.add(dc);
          native = dc.querySelector(
            '[aria-label*="recentes" i] .Focusable, [aria-label*="recente" i] .Focusable, [aria-label*="recent" i] .Focusable, [role="list"] .Panel.Focusable'
          ) as HTMLElement | null;
          if (native) break;
        }
        if (native) focusElement(native);
      } catch {}
    }
    prevEnabledRef.current = settings.enabled;
  }, [settings?.enabled]);

  /* Apply hideRecents — only actually hide when the plugin is enabled and has
     visible shelves.  Otherwise force recents visible regardless of the toggle
     (we never change the stored setting, only the DOM state).

     When `recentsReplaceSource` is on, the native recents area remains */
  /* visible on purpose — our router patch is driving its games array — so
     the visual hide is skipped. First visible shelf is forced-expanded only
     when we're truly hiding (preserves the current behaviour).
     Re-run this effect when the recents-replace kill switch flips (our
     experiment reported a runtime error → fall back to the visual hide). */
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
    /* Native recents can't actually hide until the first shelf-set reveal has
       happened (shelvesRevealed) — otherwise it would vanish before DS has
       anything settled to show in its place. ShelvesContainer's own
       reveal-gate effect reports this up via onSettleChange. */
    applyHideRecentsGated(canHide, shelvesRevealed);
    /* Margin correction is about the native row being kept VISIBLE
       (canHide false whenever replaceActive is true), not about injection
       having actually populated it — an empty promoted shelf falls back to
       genuine native content that's just as visible and needs the same
       offset. */
    applyReplaceActiveMargin(replaceActive);
    // When recents are hidden, remove them from the gamepad navigation tree so
    // the D-pad skips straight to our shelves.  We keep the DOM intact (visibility:
    // hidden) so we can still read native classes, hero images, etc.
    const recentsEl = mountEl?.previousElementSibling as HTMLElement | null;
    applyRecentsFocusTrapGated(recentsEl, canHide, shelvesRevealed);
  }, [settings?.hideRecents, settings?.enabled, settings?.shelves, settings?.smartShelvesEnabled, settings?.smartShelves, settings?.recentsReplaceSource, mountEl, replaceKillSwitch, replaceInjecting, shelvesRevealed]);

  // Apply hideHomeTabs — gated on the master enabled toggle too (like
  // hideRecents above), so disabling the plugin restores every native Home
  // element it was suppressing, not just recents.
  useEffect(() => {
    applyHideHomeTabs(settings?.enabled === true && settings?.hideHomeTabs === true);
  }, [settings?.enabled, settings?.hideHomeTabs, mountEl]);

  /* Schedule a one-shot refresh at the next visibility-window boundary across
     all smart shelves. Picks the earliest boundary; on fire, invalidates
     resolver caches for time-aware shelves, forces HomeInject to re-render
     (so evalVisibility is re-evaluated), then triggers shelf refresh.
     Re-armed on each fire (visibilityTick dep) and on smart-shelf list changes. */
  const [visibilityTick, setVisibilityTick] = useState(0);
  const smartList = settings?.smartShelves;
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
      try { triggerShelfRefresh(); } catch {}
    }, delay);
    return () => window.clearTimeout(t);
  }, [settings?.smartShelvesEnabled, smartList, visibilityTick]);

  /* Device-state visibility rules (battery / charging / offline / external
     display / resolution) flip on hardware events, not the clock. A cheap
     re-render re-runs evalVisibility — no full shelf re-resolution. Own tick (not
     visibilityTick) so it skips the clock-boundary scheduler above. Sources fire
     only on meaningful/debounced changes — rare, event-driven, no polling. */
  const [, setDeviceTick] = useState(0);
  useEffect(() => {
    const bump = () => setDeviceTick((n) => n + 1);
    const unDevice = subscribeDeviceState(bump);
    const unSession = subscribeSessionState(bump);
    const unPerf = subscribePerfState(bump);
    const unPeripherals = subscribePeripheralsState(bump);
    return () => { unDevice(); unSession(); unPerf(); unPeripherals(); stopFrameSampler(); };
  }, []);

  /* Convert enabled smart shelves to Shelf-compatible objects for ShelfView.
     Memoized (and kept above the mountEl/settings early returns below, per
     Rules of Hooks) so unrelated re-renders don't hand every smart shelf a
     new object identity each time — that would defeat memo() on the shelf
     tree. `settings` may still be unhydrated here, hence the `?.`s. */
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
  }, [settings?.smartShelvesEnabled, settings?.smartSurpriseMe, settings?.smartSurpriseMeCount, settings?.smartShelves, t, visibilityTick]);

  if (!mountEl) return null;
  if (!settings) return null;

  // Crash protection: don't attempt to render if mounting has failed
  if (getMountFailed()) {
    logWarn("HOME", "mount failed — skipping render");
    return null;
  }

  const visibleShelves = (settings.shelves ?? []).filter((s) => s.enabled && !s.hidden);

  const normalShelves = computeNormalShelves(visibleShelves, replaceInjecting, replaceKillSwitch);

  /* Placement:
     - unifiedListEnabled: emit shelves in explicit `allShelvesOrder` (user's
       reorder; unlisted fall to the end), skipping the interleave/order-css path.
     - atBottom: normal then smart. hideRecents + !replace: normal then smart in
       DOM with CSS `order` restoring interleave. else: smart then normal. */
  const unifiedOn = (settings as any).unifiedListEnabled === true;
  const allShelvesOrder: string[] = ((settings as any).allShelvesOrder ?? []) as string[];
  const normalFirst = computeNormalFirst(settings, replaceInjecting, replaceKillSwitch);
  let shelves: Shelf[] = computeShelvesOrder({ unifiedOn, allShelvesOrder, normalShelves, smartShelves, normalFirst });

  /* Auto-pin: float shelves whose `autoPin` predicate currently matches to the
     top (stable, opt-in — untouched when nothing is pinned). Re-evaluated on the
     device/session tick, same as visibility rules. */
  shelves = applyAutoPin(shelves, (s) => {
    const ap = (s as any).autoPin;
    return !!ap && Array.isArray(ap.rules) && ap.rules.length > 0 && evalVisibility({ visibility: ap } as any);
  }) as Shelf[];

  const interleaveSmart = computeInterleaveSmart({ unifiedOn, settings, replaceInjecting, replaceKillSwitch });

  // When the plugin is disabled, there are no visible shelves, or all shelves
  // are hidden — always ensure recents are visible regardless of the toggle
  // value (we never force-change the setting, just override the DOM state).
  if (!settings.enabled || !visibleShelves.length) {
    applyHideRecents(false);
    if (!settings.enabled) logWarn("HOME", "plugin disabled — recents forced visible");
    return null;
  }
  // A newer instance has taken over this root — go blank so the shelves never double.
  if (!isLatestInstance) return null;
  logInfo("HOME", "rendering shelves via portal", { visible: shelves.length, mountConnected: mountEl.isConnected });

  const derived = computeDerivedGlobalFlags({ settings, replaceInjecting, replaceKillSwitch });
  return createPortal(
    <PlatformProvider platform={homePlatform}>
      <ShelvesContainer mountEl={mountEl} shelves={shelves} onSettleChange={setShelvesRevealed} globalMatchNativeSize={settings.globalMatchNativeSize === true} globalHighlightFirst={settings.globalHighlightFirst === true} globalHighlightAll={settings.globalHighlightAll === true} globalHighlightRandom={(settings as any).globalHighlightRandom === true} globalHideStatusLine={settings.globalHideStatusLine === true} globalHideNewBadge={settings.globalHideNewBadge === true} globalHideDiscountBadge={(settings as any).globalHideDiscountBadge === true} globalHideCompatIcons={settings.globalHideCompatIcons === true} globalHideNonSteamBadge={settings.globalHideNonSteamBadge === true} globalHideShelfTitle={settings.globalHideShelfTitle === true} globalHideGameNames={settings.globalHideGameNames === true} globalHideInstallIndicator={settings.globalHideInstallIndicator === true} globalHideSeeMore={settings.globalHideSeeMore === true} globalHideRefreshCard={settings.globalHideRefreshCard === true} globalDedupeByName={(settings as any).globalDedupeByName === true} globalHeroEnabled={(settings as any).globalHeroEnabled === true} globalGameInfoAbove={(settings as any).globalGameInfoAbove === true} globalFriendsPlayingOverlay={(settings as any).globalFriendsPlayingOverlay === true} globalFriendsPlayingOverlayRecent={(settings as any).globalFriendsPlayingOverlayRecent === true} globalEnableLogo={(settings as any).globalEnableLogo === true} globalEnableIcon={(settings as any).globalEnableIcon === true} globalEnableDescription={(settings as any).globalEnableDescription === true} globalDescriptionBelowLogo={(settings as any).globalDescriptionBelowLogo === true} globalLogoBelowShelf={(settings as any).globalLogoBelowShelf === true} globalLogoPosition={derived.globalLogoPosition} globalDescriptionPosition={derived.globalDescriptionPosition} globalLogoSize={derived.globalLogoSize} globalLogoTopOffset={derived.globalLogoTopOffset} globalFullPageShelf={(settings as any).globalFullPageShelf === true} globalIconVerticalAlign={(settings as any).globalIconVerticalAlign} globalShelfTitlePosition={(settings as any).globalShelfTitlePosition} globalGameNamePosition={(settings as any).globalGameNamePosition} globalPlaytimePosition={(settings as any).globalPlaytimePosition} globalDescriptionHeight={(settings as any).globalDescriptionHeight} shelfHeroBackground={derived.shelfHeroBackground} perShelfHeroAllowed={derived.perShelfHeroAllowed} hideRecentsSetting={derived.hideRecentsSetting} forceCssLoaderThemes={settings.forceCssLoaderThemes === true} interleaveSmart={interleaveSmart} autoCollapseEnabled={(settings as any).autoCollapseEnabled === true} />
      {isDebugOverlayEnabled(settings) ? <DebugOverlay mountEl={mountEl} shelves={shelves} /> : null}
    </PlatformProvider>,
    mountEl,
  ) as any;
}

// Scan the home mount's siblings to tell if native recents / tabs are showing.
function scanHomeChildren(parent: HTMLElement, mount: HTMLElement): { recentsVisible: boolean; tabsVisible: boolean } {
  let recentsVisible = false;
  let tabsVisible = false;
  for (const child of Array.from(parent.children) as HTMLElement[]) {
    if (child === mount) continue;
    if (child.offsetHeight <= 8) continue;
    if (child.querySelector('[role="tablist"]')) { tabsVisible = true; continue; }
    recentsVisible = true;
  }
  return { recentsVisible, tabsVisible };
}

// Earliest visibility-window boundary across all smart shelves (+ their ids).
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

// Auto-collapse decision for one shelf (off-context predicate + when-empty flag).
function computeAutoCollapse(shelf: any, enabled: boolean): { forceCollapsed: boolean; autoCollapseWhenEmpty: boolean } {
  if (!enabled) return { forceCollapsed: false, autoCollapseWhenEmpty: false };
  const ac = shelf.autoCollapse;
  const forceCollapsed = !!ac && Array.isArray(ac.rules) && ac.rules.length > 0 && evalVisibility({ visibility: ac } as any);
  return { forceCollapsed, autoCollapseWhenEmpty: shelf.autoCollapseWhenEmpty === true };
}

function ShelvesContainer({ mountEl, shelves, onSettleChange, globalMatchNativeSize = false, globalHighlightFirst = false, globalHighlightAll = false, globalHighlightRandom = false, globalHideStatusLine = false, globalHideNewBadge = false, globalHideDiscountBadge = false, globalHideCompatIcons = false, globalHideNonSteamBadge = false, globalHideShelfTitle = false, globalHideGameNames = false, globalHideInstallIndicator = false, globalHideSeeMore = false, globalHideRefreshCard = false, globalDedupeByName = false, globalHeroEnabled = false, globalGameInfoAbove = false, globalFriendsPlayingOverlay = false, globalFriendsPlayingOverlayRecent = false, globalEnableLogo = false, globalEnableIcon = false, globalEnableDescription = false, globalDescriptionBelowLogo = false, globalLogoBelowShelf = false, globalLogoPosition = 'left', globalDescriptionPosition = 'left', globalLogoSize = 100, globalLogoTopOffset = 20, globalFullPageShelf = false, globalIconVerticalAlign, globalShelfTitlePosition, globalGameNamePosition, globalPlaytimePosition, globalDescriptionHeight, shelfHeroBackground = false, perShelfHeroAllowed = false, hideRecentsSetting = false, forceCssLoaderThemes = false, interleaveSmart = false, autoCollapseEnabled = false }: { mountEl: HTMLElement; shelves: any[]; onSettleChange?: (settled: boolean) => void; globalMatchNativeSize?: boolean; globalHighlightFirst?: boolean; globalHighlightAll?: boolean; globalHighlightRandom?: boolean; globalHideStatusLine?: boolean; globalHideNewBadge?: boolean; globalHideDiscountBadge?: boolean; globalHideCompatIcons?: boolean; globalHideNonSteamBadge?: boolean; globalHideShelfTitle?: boolean; globalHideGameNames?: boolean; globalHideInstallIndicator?: boolean; globalHideSeeMore?: boolean; globalHideRefreshCard?: boolean; globalDedupeByName?: boolean; globalHeroEnabled?: boolean; globalGameInfoAbove?: boolean; globalFriendsPlayingOverlay?: boolean; globalFriendsPlayingOverlayRecent?: boolean; globalEnableLogo?: boolean; globalEnableIcon?: boolean; globalEnableDescription?: boolean; globalDescriptionBelowLogo?: boolean; globalLogoBelowShelf?: boolean; globalLogoPosition?: 'left' | 'center' | 'right'; globalDescriptionPosition?: 'left' | 'center' | 'right'; globalLogoSize?: number; globalLogoTopOffset?: number; globalFullPageShelf?: boolean; globalIconVerticalAlign?: 'top' | 'center' | 'bottom' | null; globalShelfTitlePosition?: 'left' | 'center' | 'right' | null; globalGameNamePosition?: 'left' | 'center' | 'right' | null; globalPlaytimePosition?: 'left' | 'center' | 'right' | null; globalDescriptionHeight?: number | null; shelfHeroBackground?: boolean; perShelfHeroAllowed?: boolean; hideRecentsSetting?: boolean; forceCssLoaderThemes?: boolean; interleaveSmart?: boolean; autoCollapseEnabled?: boolean }) {
  /* One-time reveal gate: hides this region until every shelf has rendered
     once or a bounded timeout elapses — native Home stays usable, then one
     clean swap instead of a reorganizing grid (CDP-confirmed live,
     2026-10-07). Settles once — later shelf edits don't re-hide.
     Declared here so focus-restoration below skips a `display: none` card. */
  const [shelvesRevealed, setShelvesRevealed] = useState(false);
  const revealedOnceRef = useRef(false);
  useHeroIdlePause(mountEl);

  useEffect(() => {
    // One-time nav tree API detection — result surfaced in About > Diagnostics
    const navApi = detectNavTreeApi();
    logDiagnostic(
      navApi.available ? 'info' : 'warn',
      navApi.available ? 'Gamepad nav tree API available' : 'Gamepad nav tree API unavailable',
      navApi.detail,
    );

    /* Apply idempotent patches (menu/edge/bridge) on every mount-subtree
       mutation. Reparent runs independently with its own triggers because
       Steam can rebuild our nav node's parent without touching our DOM
       subtree (e.g. when native home re-registers focusables around us). */
    const applyPatches = () => {
      // Per-install try/catch: a single shared try would silently drop
      // every later install on the first failure (regression seen with
      // installLibraryContextMenuPatch, the menu-injection entry point).
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
    if (hasPendingFocus()) beginFocusRestoreLoop();
    else beginColdBootFocusGuard(shelves.map((s: any) => s.id));

    // rAF-throttle the high-frequency callers so applyPatches runs
    // at most once per frame instead of per-mutation.
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

    // Menu-class chunk arrives async on cold boot; retries here cover
    // the window before the chunk loader registers it.
    const menuPatchRetries = [400, 1000, 2000, 4000, 8000, 15000];
    const menuRetryTimers: ReturnType<typeof setTimeout>[] = [];
    const tryInstall = () => {
      try { installLibraryContextMenuPatch(); } catch {}
      try { installCreateContextMenuPatch(); } catch {}
    };
    for (const d of menuPatchRetries) {
      menuRetryTimers.push(setTimeout(tryInstall, d));
    }
    /* Capture the native card menu while recents is still visible — once
       hideRecents collapses it (display:none), Steam stops mounting real
       cards inside it, so a later on-press attempt has nothing left to
       capture. The synthetic native-menu open this triggers is dismissed
       immediately (steamGameMenu.ts's dismissSyntheticMenu). */
    const disposePrewarm = prewarmMenuExtraction();

    // Observer 1: mutations inside our mount (shelf render, collapse/expand)
    const obs = new MutationObserver(scheduleApplyPatches);
    obs.observe(mountEl, { childList: true, subtree: true });

    // Observer 2: mutations on mount's PARENT — catches Steam's native home
    // re-adding/re-ordering siblings, which is when it re-registers our nav
    // node at the wrong tree level. Only listens to direct-child changes.
    let parentObs: MutationObserver | null = null;
    if (mountEl.parentElement) {
      parentObs = new MutationObserver(scheduleReparentOnly);
      parentObs.observe(mountEl.parentElement, { childList: true });
    }

    // Safety net: poll every 3s. Stability guard short-circuits when the
    /* position is correct, so the wake-ups cost near-zero in steady state.
       MutationObservers (inside mount + on parent) + focusin + popstate +
       hashchange already cover every real reparent trigger; the interval
       only catches exotic Steam re-registers with no DOM mutation at all.
       Previously ran at 750ms — 4× the wake-ups for no measurable benefit. */
    const poll = window.setInterval(reparentOnly, 3000);

    /* Focus events also signal Steam-driven tree changes; run reparent on
       focusin at the document level (cheap; guard will no-op when correct).
       rAF-throttled — focusin fires for EVERY focus change (rapid d-pad
       navigation = many per frame), and reparentOnly's nav-tree walk +
       stability guard each take measurable time. */
    const doc = mountEl.ownerDocument;
    const onFocusIn = () => scheduleReparentOnly();
    doc?.addEventListener("focusin", onFocusIn, true);

    const win = getPreferredSteamWindow();
    /* popstate/hashchange are one-shot per nav (cheap to handle without
       throttling) AND we want them to run synchronously so focus
       restoration begins immediately on return from game detail —
       delaying by a frame can let Steam's own focus-first-card reflex
       race ahead and steal focus. So no throttle here. */
    const onNavEvent = () => { applyPatches(); if (hasPendingFocus()) beginFocusRestoreLoop(); };
    win.addEventListener("popstate", onNavEvent);
    win.addEventListener("hashchange", onNavEvent);

    return () => {
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

  // Monitor shelves -> if hideRecentsSetting is true but there are no visible
  // shelves or none resolve to items, force recents visible and emit disable event.
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
        // hideRecentsSetting is true here (early-returned above otherwise);
        // hiding also needs shelvesRevealed — this call used to bypass
        // the reveal gate entirely, hiding native recents mid-wait.
        /* Warm data answers this without re-resolving every shelf (a full
           composite resolve measured ~2.2 s per shelf, and this effect runs at
           least twice per return). Cold boot keeps the resolver path. */
        const anyHas = anyShelfWarmWithItems(visible)
          || await anyShelfHasItems(visible, (source, limit) => homePlatform.resolveShelfAppIds(source as any, limit));
        applyHideRecentsGated(anyHas, shelvesRevealed);
        if (alive) dispatchHideRecentsDisabled(!anyHas);
      } catch (e) {
        if (alive) dispatchHideRecentsDisabled(false);
      }
    };
    void check();
    return () => { alive = false; };
  }, [shelves, hideRecentsSetting, mountEl, shelvesRevealed]);

  // Land gamepad focus on the first card of the first VISIBLE shelf —
  /* native recents when shown, otherwise the first DS shelf. Steam's
     shared FocusNavController (reachable from SharedJSContext) handles
     BTakeFocus for both card types. Runs on mount, on shelf toggle
     (shelves.length), and on hideRecents change. Retries because the
     NavTree builds async on cold boot. */
  useEffect(() => {
    try { (globalThis as any).__ds_focus_effect_ran = { t: Date.now(), mountEl: !!mountEl, hideRecents: hideRecentsSetting, shelvesLen: shelves?.length ?? 0 }; } catch {}
    let cancelled = false;
    let restorePendingSeen = false;

    /* A real home card (DS or native) already owns focus → the user is
       navigating, don't interfere. A stale gpfocus on a non-card element
       (header, removed node) does NOT count — we still want to land on
       the first shelf in that case. */
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
      // Native row visible — either by setting, or because our own shelves
      // are still behind the reveal gate (`display: none`, unfocusable).
      if ((!hideRecentsSetting || !shelvesRevealed) && doc && focusNativeRecentsFirstCard(doc)) {
        try { (globalThis as any).__ds_focus_first = { t: Date.now(), why: 'native-first' }; } catch {}
        return true;
      }
      if (!shelvesRevealed) return false;
      const firstCard = mountEl.querySelector('.ds-shelf .ds-card') as HTMLElement | null;
      if (firstCard) {
        focusElement(firstCard);
        try { (globalThis as any).__ds_focus_first = { t: Date.now(), why: 'ds-first' }; } catch {}
      }
      return !!mountEl.querySelector('.ds-shelf .gpfocus, .deck-shelves-root .gpfocus');
    };

    const tryFocus = (): boolean => {
      if (cancelled) return true;
      try {
        if (aRealCardHasFocus()) return true;
        // A per-card restore (A → game → back) owns the focus outcome.
        if (hasPendingFocus()) { restorePendingSeen = true; return false; }
        if (restorePendingSeen) return true;
        return focusFirstVisibleShelf();
      } catch (e) { logInfo("HOME", "focus first shelf failed", String(e)); return false; }
    };

    if (tryFocus()) return () => { cancelled = true; };
    /* Poll on a bounded interval rather than fixed delays — the home can
       become the active gamepad context well after mount (slow cold boot,
       or the QAM staying open after a shelf toggle), and BTakeFocus only
       paints once the home tree is active. Stops as soon as focus lands
       or after the cap, so it's battery-safe. */
    const started = Date.now();
    const poll = window.setInterval(() => {
      if (cancelled || tryFocus() || Date.now() - started > 25_000) {
        window.clearInterval(poll);
      }
    }, 600);
    return () => { cancelled = true; window.clearInterval(poll); };
  }, [hideRecentsSetting, mountEl, shelves?.length, shelvesRevealed]);

  const rootRef = useRef<HTMLDivElement>(null);
  // DOM order of the shelves (interleave applied), read by the reveal scan.
  const orderedRef = useRef<any[]>(shelves);

  /* Reveal-gate scan. `display: none` (not visibility) so Steam's nav tree
     excludes hidden subtrees. Progressive in final order: the container shows
     as soon as the first shelf in order has rendered; later shelves stay
     `data-ds-pending` until everything above them is on screen (no reorder,
     no insert-above); the set-settled signal lifts the gating for the rest. */
  useEffect(() => {
    if (revealedOnceRef.current) return;
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const startedAt = Date.now();
    const REVEAL_TIMEOUT_MS = 5000;
    /* Re-check once the count goes quiet: shelves that resolve to nothing never
       render, so without this the gate sat hidden for the whole 5 s timeout on
       every load — and revealing that late left Steam's nav tree with none of
       our cards registered (it skips a `display:none` subtree), so gamepad
       focus could not enter the shelves at all. */
    let shown = false;
    const ids = shelfIdsOf(shelves);
    const warm = allShelvesWarm(ids);
    const scan = () => {
      const renderedEls = Array.from(rootEl.querySelectorAll<HTMLElement>('.ds-shelf[data-shelfid]'));
      // Complete = every shelf rendered or resolved empty, a warm rebuild, or the timeout.
      const complete = warm || ids.every((id) => isShelfResolved(id)) || renderedEls.length >= ids.length || Date.now() - startedAt >= REVEAL_TIMEOUT_MS;
      const visible = applyProgressiveReveal(renderedEls, shelfIdsOf(orderedRef.current), complete);
      if (visible > 0 && !shown) { shown = true; setShelvesRevealed(true); onSettleChange?.(true); }
      if (complete) revealedOnceRef.current = true;
    };
    scan();
    const obs = new MutationObserver(scan);
    obs.observe(rootEl, { childList: true, subtree: false });
    observerCreated();
    // Empty resolutions never touch the DOM — they re-scan through this signal.
    const unsubResolved = subscribeShelfResolved(scan);
    const revealTimer = setTimeout(scan, REVEAL_TIMEOUT_MS);
    timerCreated();
    return () => {
      obs.disconnect(); observerDisposed();
      unsubResolved();
      clearTimeout(revealTimer); timerDisposed();
    };
  }, [shelves, onSettleChange]);

  /* First rendered .ds-shelf id (tracked by MO, shelves[0] may render null).
     Smart shelves are excluded from recents-slot promotion (flicker). Held
     back until the shelf set settles (isShelfSetSettled) — committing early
     flashes the wrong per-shelf hero as a later, earlier-config shelf
     catches up (confirmed live via CDP, 2026-10-07). */
  const [firstVisibleId, setFirstVisibleId] = useState<string | null>(null);
  useEffect(() => {
    if (!hideRecentsSetting) { setFirstVisibleId(null); return; }
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const startedAt = Date.now();
    const SETTLE_TIMEOUT_MS = 3000;
    // Config-order pick, not DOM-order: skip empty shelves; keep
    // stable across resolver finish-order.
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
    // Guarantees a final scan at the settle deadline even if the DOM stops
    // mutating before every shelf has rendered (no mutation would otherwise
    // ever re-trigger `scan` past that point).
    const settleTimer = setTimeout(scan, SETTLE_TIMEOUT_MS);
    timerCreated();
    return () => { obs.disconnect(); observerDisposed(); clearTimeout(settleTimer); timerDisposed(); };
  }, [hideRecentsSetting, shelves]);

  /* CSS Loader recents-wrapper promotion. When user hides native
     recents we promote the first visible shelf into the recents
     selector space via data-ds-recents-slot + the live wrapper class.
     forceCssLoaderThemes promotes ALL shelves. Class assignment is
     additive only — invariants enforced in arthero.sh. */

  // Re-fires the recents-slot promotion when CSS Loader injects late.
  const [cssLoaderTick, setCssLoaderTick] = useState(0);

  useEffect(() => {
    // INVARIANT 1: runs when recents are hidden (first-shelf promotion) OR
    // when forceCssLoaderThemes is on — the latter promotes every shelf
    // regardless of whether the native recents shelf is kept.
    if (!hideRecentsSetting && !forceCssLoaderThemes) return;
    // INVARIANT 2: the first-shelf-only path needs firstVisibleId; the
    // force path targets every shelf so it doesn't.
    if (!firstVisibleId && !forceCssLoaderThemes) return;
    if (!isCssLoaderActive()) return;       // INVARIANT 3
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const nativeClass = getNativeRecentsClassName(mountEl);
    if (!nativeClass) return;
    /* Mark the native-recents sibling itself (not just its class) so the SLH
       shim can scope its grid override to THIS container — the bare
       aria-label also matches unrelated grids elsewhere (e.g. a Big Art
       hero carousel). */
    const nativeRecentsEl = mountEl.previousElementSibling as HTMLElement | null;
    nativeRecentsEl?.setAttribute('data-ds-native-recents', 'true');

    /* forceCssLoaderThemes ON: promote EVERY shelf — native wrapper class +
       data-ds-recents-slot — so theme rules (Obsidian, TiltedHome, ArtHero
       hero/mask + full-page layout) reach all DS shelves, not just the first.
       OFF: only the first (promoted) shelf is promoted. */
    const applyAll = () => {
      const firstShelf = firstVisibleId
        ? rootEl.querySelector<HTMLElement>(`.ds-shelf[data-shelfid="${CSS.escape(firstVisibleId)}"]`)
        : null;
      const all = Array.from(rootEl.querySelectorAll<HTMLElement>('.ds-shelf[data-shelfid]'));
      const targets = forceCssLoaderThemes ? all : (firstShelf ? [firstShelf] : []);
      for (const t of targets) {
        t.classList.add(nativeClass);                                    // INVARIANT 4
        t.setAttribute('data-ds-recents-slot', 'true');
      }
    };
    applyAll();
    // Re-apply when shelves appear late (items load async → DeckRow mounts after this effect ran)
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

  /* Mark .deck-shelves-root with data-ds-hero-label while an ArtHero-family
     theme is active — the stylesheet keys the full-page hero layout (hidden
     titles/labels, flex-bottom row) off this attribute. Previously set by
     HeroBackground; moved here now that the hero+label are per-shelf. */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let lastActive = isCssLoaderActive();
    const setFlag = (attr: string, on: boolean) => {
      if (on) root.setAttribute(attr, 'true');
      else root.removeAttribute(attr);
    };
    // Mirror a flag onto <html> of every reachable Steam document. Needed
    // when a rule must target an element OUTSIDE .deck-shelves-root (e.g.
    // the native FocusRing overlay, which lives in its own subtree).
    const setHtmlFlag = (attr: string, on: boolean) => {
      try {
        const docs: Document[] = [];
        const seen = new Set<Document>();
        const add = (d: Document | null | undefined) => {
          if (!d || seen.has(d)) return;
          seen.add(d);
          docs.push(d);
        };
        add(document);
        add(getPreferredSteamDocument());
        for (const d of getAllSteamDocuments()) add(d);
        for (const d of docs) {
          if (on) d.documentElement.setAttribute(attr, 'true');
          else d.documentElement.removeAttribute(attr);
        }
      } catch {}
    };
    const apply = () => {
      try {
        setFlag('data-ds-hero-label', isArtHeroActive());
        // Theme flags — CSS in shelfStyles.ts scopes the visual change via
        // data-ds-recents-slot (first shelf or all under force).
        setFlag('data-ds-theme-no-hero-gradient', isNoHeroGradientActive());
        setFlag('data-ds-theme-hero-fullscreen', isHeroFullscreenActive());
        /* Separate from hero-fullscreen: some of its CSS (the ArtHero-tuned
           -56px pull-up) assumes ArtHero's own native clearance under the
           header — native Big Art doesn't have that same clearance, so the
           same pull crowds the shelf title into the icon row there. */
        setFlag('data-ds-theme-big-art', isBigArtModeActive());
        setFlag('data-ds-theme-no-home-text', isNoHomeTextActive());
        /* TiltedHome flag — when set, the shelfStyles.ts CSS gates a
           perspective + rotateY transform onto DS cards using the
           SAME `--ren-tilt-angle` (and friends) variables the theme
           exposes at `:root`, so DS shelves match the user's tilt
           intensity without us having to fork the values. */
        const tilted = isTiltedHomeActive();
        setFlag('data-ds-theme-tilted-home', tilted);
        /* TiltedHome variants — emit method + direction so shelfStyles.ts
           CSS can gate the precise transform on the actually-installed
           mode (user picks among independent CSS Loader modules). Cleared
           when TiltedHome isn't active. */
        const mode = tilted ? getTiltedHomeMode() : null;
        const setStrFlag = (attr: string, val: string | null | undefined) => {
          try {
            const doc = getPreferredSteamDocument();
            const docs = [doc, ...getAllSteamDocuments()].filter((x): x is Document => !!x);
            for (const d of docs) {
              const r = d.querySelector('.deck-shelves-root') as HTMLElement | null;
              if (r) {
                if (val) r.setAttribute(attr, val);
                else r.removeAttribute(attr);
              }
            }
          } catch {}
        };
        setStrFlag('data-ds-theme-tilt-method', mode?.method ?? null);
        setStrFlag('data-ds-theme-tilt-direction', mode?.direction ?? null);
        const roundCompat = isFocusRoundCompatActive();
        setFlag('data-ds-theme-focus-round-compat', roundCompat);
        // Mirror to <html> so the FocusRing suppression rule can reach the
        // FocusRing element (which sits outside .deck-shelves-root).
        setHtmlFlag('data-ds-theme-focus-round-compat', roundCompat);
        // Force-themes flag — gates theme rules that should only engage
        // under force (e.g. No Home Text per user spec).
        setFlag('data-ds-force-themes', forceCssLoaderThemes);
        // Recents-hidden flag — gates the fullscreen-theme margin-top: -56
        // rule (only pull the first shelf up when nothing native is above).
        setFlag('data-ds-recents-hidden', hideRecentsSetting);
        // Hero-background flag — DS's own fullscreen hero (shelfHeroBackground)
        // also needs the -56 pull-up to cover the header band, even without a
        // CSS Loader fullscreen-hero theme.
        setFlag('data-ds-hero-background', shelfHeroBackground);
        const nowActive = isCssLoaderActive();
        if (nowActive && !lastActive) setCssLoaderTick((v) => v + 1);
        lastActive = nowActive;
      } catch {}
    };
    apply();
    /* Observe every known Steam doc's head — CSS Loader injects theme styles
       into the BigPicture head, which may not be the preferred doc. A single
       observer on preferred.head misses those mutations and leaves
       data-ds-hero-label stale when themes toggle mid-session. */
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
        root.removeAttribute('data-ds-hero-label');
        root.removeAttribute('data-ds-theme-no-hero-gradient');
        root.removeAttribute('data-ds-theme-hero-fullscreen');
        root.removeAttribute('data-ds-theme-big-art');
        root.removeAttribute('data-ds-theme-no-home-text');
        root.removeAttribute('data-ds-theme-tilted-home');
        root.removeAttribute('data-ds-theme-focus-round-compat');
        root.removeAttribute('data-ds-force-themes');
        root.removeAttribute('data-ds-recents-hidden');
      } catch {}
      setHtmlFlag('data-ds-theme-focus-round-compat', false);
    };
  }, [mountEl, forceCssLoaderThemes, hideRecentsSetting]);

  /* Drag-to-reorder shelves by holding the title (touch/mouse only; D-pad nav
     stays untouched). The hook scopes to `.ds-shelf[data-shelfid]` under the
     root container and only acts on ids that match REGULAR shelves in
     settings (smart shelves are position-managed separately via their toggle). */
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

  // Visual interleave: when needed, REORDER the shelves array so the DOM
  // matches the visual order. CSS `order` was tried but it doesn't move
  /* gamepad/accessibility focus — navigation followed DOM order, jumping
     from promoted to "rest of normal" without visiting smart in between.
     Reordering at React level fixes both rendering and navigation in one
     pass. Falls back to the original `shelves` array when interleave is
     off OR when `firstVisibleId` isn't yet known. */
  const orderedShelves = useMemo(() => {
    if (!interleaveSmart) return shelves;
    return interleaveSmartShelves(shelves, firstVisibleId);
  }, [shelves, interleaveSmart, firstVisibleId]);
  orderedRef.current = orderedShelves as any[];

  // Steam occasionally injects React-owned children (empty-state SVGs,
  // hint overlays) directly into our root; they show up as direct
  /* siblings of the `.ds-shelf` nodes and consume vertical space at the
     bottom of the home. Hide them so they don't expand the scroll
     height. We never remove the node — React's reconciler may still
     own its subtree — only `display: none` it, and tag with
     `data-ds-foreign` so the same observer is idempotent. */
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
      {orderedShelves.map((shelf: any) => {
        const ac = computeAutoCollapse(shelf, autoCollapseEnabled);
        return <ShelfView key={shelf.id} shelf={shelf} forceCollapsed={ac.forceCollapsed} autoCollapseWhenEmpty={ac.autoCollapseWhenEmpty} globalMatchNativeSize={globalMatchNativeSize} globalHighlightFirst={globalHighlightFirst} globalHighlightAll={globalHighlightAll} globalHighlightRandom={globalHighlightRandom} globalHideStatusLine={globalHideStatusLine} globalHideNewBadge={globalHideNewBadge} globalHideDiscountBadge={globalHideDiscountBadge} globalHideCompatIcons={globalHideCompatIcons} globalHideNonSteamBadge={globalHideNonSteamBadge} globalHideShelfTitle={globalHideShelfTitle} globalHideGameNames={globalHideGameNames} globalHideInstallIndicator={globalHideInstallIndicator} globalHideSeeMore={globalHideSeeMore} globalHideRefreshCard={globalHideRefreshCard} globalDedupeByName={globalDedupeByName} globalHeroEnabled={globalHeroEnabled} globalGameInfoAbove={globalGameInfoAbove} globalFriendsPlayingOverlay={globalFriendsPlayingOverlay} globalFriendsPlayingOverlayRecent={globalFriendsPlayingOverlayRecent} globalEnableLogo={globalEnableLogo} globalEnableIcon={globalEnableIcon} globalEnableDescription={globalEnableDescription} globalDescriptionBelowLogo={globalDescriptionBelowLogo} globalLogoBelowShelf={globalLogoBelowShelf} globalLogoPosition={globalLogoPosition} globalDescriptionPosition={globalDescriptionPosition} globalLogoSize={globalLogoSize} globalLogoTopOffset={globalLogoTopOffset} globalFullPageShelf={globalFullPageShelf} globalIconVerticalAlign={globalIconVerticalAlign} globalShelfTitlePosition={globalShelfTitlePosition} globalGameNamePosition={globalGameNamePosition} globalPlaytimePosition={globalPlaytimePosition} globalDescriptionHeight={globalDescriptionHeight} heroForced={perShelfHeroAllowed && shelfHeroBackground && shelf.id === firstVisibleId} heroLabelMount={perShelfHeroAllowed && (forceCssLoaderThemes || (hideRecentsSetting && shelf.id === firstVisibleId))} forceExpanded={hideRecentsSetting && shelf.id === firstVisibleId} forceLayoutAsRecents={forceCssLoaderThemes && !(hideRecentsSetting && shelf.id === firstVisibleId)} />;
      })}
      <BadgeFocusOverlay />
      <FriendsAvatarOverlay />
    </Focusable>
  );
}
