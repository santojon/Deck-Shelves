import { devStamp } from "../../runtime/devStamps";
import { useEffect, useMemo, useRef, useState } from "react";
import { ShelfView } from "../Shelf";
import { saveSettings, getCurrentSettings } from "../../settingsStore";
import { useContainerDragReorder } from "../../core/reorder";
import { createDeckyPlatform } from "../../runtime/deckyPlatform";
import { logInfo } from "../../runtime/logger";
import { logDiagnostic } from "../../runtime/diagnostics";
import { getPreferredSteamDocument, getPreferredSteamWindow, getAllSteamDocuments } from "../../runtime/steamHost";
import { detectNavTreeApi, homeBehindGame } from "./mountUtils";
import { applyHideRecents } from "../../runtime/homePatch";
import { Focusable } from "../../runtime/host/decky";
import { installPassiveMenuHook, installPassiveShowContextMenuHook, installLibraryContextMenuPatch, installCreateContextMenuPatch, prewarmMenuExtraction } from "../../core/steamGameMenu";
import { tryRestoreFocus, hasPendingFocus, beginFocusRestoreLoop, beginColdBootFocusGuard, focusElementAuto, startFocusFirstPoll } from "../../core/focusRestore";
import { getPowerState } from "../../runtime/powerGate";
import { allShelvesWarm, isShelfResolved, subscribeShelfResolved } from "../shelf/shelfWarmState";
import { focusNativeRecentsFirstCard, findNativeRecentsEl } from "../../features/sidenav/ShelfSideNav";
import { patchShelfEdgeNavigation, patchMenuButton, installVerticalFocusBridge, reparentNavTreeNodes } from "./navPatches";
import { useHeroIdlePause } from "./heroIdlePause";
import { pickFirstVisibleShelfId, interleaveSmartShelves, isShelfSetSettled } from "../../domain/shelfOrder";
import { flowChildrenProps } from "../../core/steamOSVersion";
import { isCssLoaderActive, getNativeRecentsClassName } from "../../core/cssLoaderDetect";
import { applyRootThemeFlags, clearRootThemeFlags } from "../../themes";
import { BadgeFocusOverlay } from "../shelf/BadgeFocusOverlay";
import { FriendsAvatarOverlay } from "../shelf/FriendsAvatarOverlay";
import { dispatchHideRecentsDisabled, anyShelfHasItems } from "./homeInjectHelpers";
import { timerCreated, timerDisposed, observerCreated, observerDisposed } from "../../core/perfMetrics";
import { withDefaults } from "../withDefaults";
import { NATIVE_ROW_FOCUS, nativeRowOnScreen, watchHomeLeave } from "./homeFocusNav";
import { settleHideCheck, shelfIdsOf, applyProgressiveReveal, anyShelfWarmWithItems, computeAutoCollapse } from "./homeReveal";

export const homePlatform = createDeckyPlatform();

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

export function ShelvesContainer(props: ShelvesContainerProps) {
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
    let reparentPending: number | null = null;
    const scheduleApplyPatches = () => {
      if (applyPending != null) return;
      if (reparentPending != null) { cancelAnimationFrame(reparentPending); reparentPending = null; }
      applyPending = requestAnimationFrame(() => {
        applyPending = null;
        applyPatches();
      });
    };
    const scheduleReparentOnly = () => {
      if (reparentPending != null || applyPending != null) return;
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
