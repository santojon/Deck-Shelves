import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
import { ShelfView } from "./Shelf";
import type { Settings, Shelf, SmartShelf, SmartShelfMode } from "../types";
import { refreshSettings, subscribeSettings, saveSettings, getCurrentSettings } from "../settingsStore";
import { useContainerDragReorder } from "../core/reorder";
import { PlatformProvider } from "../runtime/platformContext";
import { createDeckyPlatform } from "../runtime/deckyPlatform";
import { logInfo, logWarn } from "../runtime/logger";
import { logDiagnostic } from "../runtime/diagnostics";
import { getPreferredSteamDocument, getPreferredSteamWindow } from "../runtime/steamHost";
import { applyHideRecents, applyHideHomeTabs, getMountFailed } from "../runtime/homePatch";
import { getRecentsReplaceFailed, subscribeRecentsReplaceFailed, isRecentsReplaceInjecting, subscribeRecentsReplaceInjecting, getRecentsReplaceActiveShelfId } from "../runtime/recentsReplace";
import { Focusable } from "@decky/ui";
import { installPassiveMenuHook, installPassiveShowContextMenuHook } from "../core/steamGameMenu";
import { tryRestoreFocus, hasPendingFocus, beginFocusRestoreLoop, focusElement } from "../core/focusRestore";
import { HeroBackground } from "./shelf/HeroBackground";
import { patchShelfEdgeNavigation, patchMenuButton, installVerticalFocusBridge, reparentNavTreeNodes } from "./home/navPatches";
import { triggerShelfRefresh } from "../core/shelfRefresh";
import { pickFirstVisibleShelfId, interleaveSmartShelves } from "../domain/shelfOrder";
import { getRuntimeClassMap } from "../core/webpackCompat";
import { isCssLoaderActive, getNativeRecentsClassName } from "../core/cssLoaderDetect";

// Fallback for the native shelf-section token when the runtime classmap
// hasn't been populated yet. Mirrors `FALLBACK_SHELF_SECTION` in
// `runtime/homePatch.tsx`.
const FALLBACK_SHELF_SECTION = "_282X0J4BtrSF1IXctmOe-X";

const ROOT_ID = "deck-shelves-home-root";
const homePlatform = createDeckyPlatform();

const SURPRISE_MODES: SmartShelfMode[] = [
  "daily_pick", "deck_picks", "on_deck", "recently_played", "long_session",
  "random_pick", "not_started", "best_unplayed", "quick_play", "interrupted",
  "non_steam", "spare_time", "time_of_day", "rediscover", "forgotten",
];

function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = [...arr];
  let s = (seed | 0) >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}


// Navigation patches (reparentNavTreeNodes, patchMenuButton, patchShelfEdgeNavigation)
// are in ./home/navPatches.ts

function isHomeRoute(): boolean {
  const win = getPreferredSteamWindow();
  const href = `${win.location?.pathname ?? ""}${win.location?.hash ?? ""}`.toLowerCase();
  if (href.includes("library/home") || href.includes("#library/home")) return true;
  if (href.includes("/library") && !href.includes("/library/app/") && !href.includes("/library/collections")) return true;
  return false;
}

function hasHomeDomSignals(): boolean {
  const doc = getPreferredSteamDocument();
  if (!doc) return false;
  if (doc.querySelector('[class*="libraryhome"], [class*="LibraryHome"], [class*="BasicHomeView"], [class*="gamepadlibrary"]')) return true;
  if (doc.querySelector('[aria-label="Jogos recentes"], [aria-label="Recent Games"], [class*="ReactVirtualized__Grid"][aria-label]')) return true;
  try {
    const token = getRuntimeClassMap(doc)?.shelfSection || FALLBACK_SHELF_SECTION;
    if (doc.querySelector(`div.${token}, [class*="${token}"]`)) return true;
  } catch (e) { logInfo("HOME", "hasHomeDomSignals: class selector failed", String(e)); }
  return false;
}

function detectNavTreeApi(): { available: boolean; detail: string } {
  try {
    const ctrl = (globalThis as any).FocusNavController
      ?? (globalThis as any).GamepadNavTree?.m_context?.m_controller;
    if (!ctrl) return { available: false, detail: 'no FocusNavController' };
    const ctx = ctrl.m_ActiveContext || ctrl.m_LastActiveContext;
    const trees: any[] = ctx?.m_rgGamepadNavigationTrees ?? [];
    const main = trees.find((t: any) => t.m_ID === "GamepadUI_Full_Root");
    if (!main) return { available: false, detail: 'no GamepadUI_Full_Root tree' };
    const root = main.Root || main.m_Root;
    if (!root) return { available: false, detail: 'no Root on main tree' };
    if (!Array.isArray(root.m_rgChildren)) return { available: false, detail: 'm_rgChildren unavailable' };
    return { available: true, detail: `${root.m_rgChildren.length} root children` };
  } catch (e) {
    return { available: false, detail: String(e) };
  }
}

function resolveAnchor(): { parent: HTMLElement; before: ChildNode | null } | null {
  const doc = getPreferredSteamDocument();
  if (!doc) return null;

  // Strategy: find the "Recent Games" section, then walk UP to the scrollable
  // viewport and insert as a direct child AFTER the Recent Games chain.
  // This prevents our mount from expanding the native section and overlapping
  // subsequent native content (e.g., "What's New" tabs).
  const recentLabels = ["jogos recentes", "recent games", "recently played", "jogados recentemente"];
  const candidates = Array.from(doc.querySelectorAll('[role="list"],[aria-label],[class*="ReactVirtualized__Grid"]'));
  for (const node of candidates) {
    const txt = `${(node.getAttribute?.("aria-label") || "")} ${(node.textContent || "")}`.toLowerCase();
    if (!recentLabels.some((l) => txt.includes(l))) continue;
    // Walk up to the scrollable viewport ancestor
    let container: HTMLElement | null = node as HTMLElement;
    for (let i = 0; i < 12 && container; i++) {
      const p: HTMLElement | null = container.parentElement;
      if (!p || p === doc.body) break;
      try {
        const cs = getComputedStyle(p);
        const oy = (cs.overflowY || '').toLowerCase();
        if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) {
          // Found the scrollable viewport — insert after the current container
          return { parent: p, before: container.nextSibling };
        }
      } catch (e) { logInfo("HOME", "resolveAnchor: getComputedStyle failed", String(e)); }
      container = p;
    }
    // Fallback: find first ancestor with multiple children
    container = node as HTMLElement;
    for (let i = 0; i < 6 && container; i++) {
      const p: HTMLElement | null = container.parentElement;
      if (!p || p === doc.body) break;
      if (p.childElementCount > 1) {
        return { parent: p, before: container.nextSibling };
      }
      container = p;
    }
  }

  const chipLabels = ["what's new", "friends", "recommended", "novidades", "amigos", "recomendados"];
  for (const node of Array.from(doc.querySelectorAll('button, [role="tab"]'))) {
    const text = (node.textContent || "").trim().toLowerCase();
    if (!chipLabels.includes(text)) continue;
    let row: HTMLElement | null = node.parentElement as HTMLElement;
    while (row && row.childElementCount <= 1 && row !== doc.body) row = row.parentElement;
    if (row?.parentElement && row !== doc.body) return { parent: row.parentElement, before: row };
  }

  const containers = Array.from(doc.querySelectorAll('[class*="gamepadlibrary"],[class*="libraryhome"],[class*="BasicHomeView"],main,[role="main"]'));
  for (const node of containers) {
    if (node instanceof HTMLElement) return { parent: node, before: node.firstChild };
  }

  return null;
}

function findOrCreateMount(): HTMLElement | null {
  const doc = getPreferredSteamDocument();
  const existing = doc.getElementById(ROOT_ID) as HTMLElement | null;
  if (existing?.isConnected) return existing;

  const anchor = resolveAnchor();
  if (!anchor || anchor.parent === doc.body) return null;

  const mount = doc.createElement("div");
  mount.id = ROOT_ID;
  mount.style.cssText = "width:100%;display:block;position:relative;z-index:0;margin:0;padding:0;";
  anchor.parent.insertBefore(mount, anchor.before);

  logInfo("HOME", "mount created", { parent: anchor.parent.tagName });
  return mount;
}

export function HomeShelves() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let alive = true;

    const updateMount = () => {
      if (!alive) return;
      const homeVisible = isHomeRoute() || hasHomeDomSignals();
      if (!homeVisible) {
        setMountEl(null);
        getPreferredSteamDocument().getElementById(ROOT_ID)?.remove();
        return;
      }
      const el = findOrCreateMount();
      if (el) setMountEl(el);
    };

    updateMount();
    const doc = getPreferredSteamDocument();
    const win = getPreferredSteamWindow();
    const obs = new MutationObserver(updateMount);
    obs.observe(doc.body, { childList: true, subtree: true });
    // Short fallback covers SPA pushState navigation (library → home) that does
    // not fire popstate/hashchange and may not trigger body subtree mutations.
    const timer = window.setInterval(updateMount, 2000);
    win.addEventListener("hashchange", updateMount);
    win.addEventListener("popstate", updateMount);

    // Patch history.pushState/replaceState so SPA navigations synchronously
    // trigger updateMount (no 2s fallback wait when returning to home).
    let wasOnHome = isHomeRoute();
    const onRouteChange = () => {
      const nowOnHome = isHomeRoute();
      if (nowOnHome && !wasOnHome) {
        updateMount();
        triggerShelfRefresh();
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
      obs.disconnect();
      window.clearInterval(timer);
      win.removeEventListener("hashchange", updateMount);
      win.removeEventListener("popstate", updateMount);
      win.removeEventListener("popstate", onRouteChange);
      win.removeEventListener("hashchange", onRouteChange);
      try { if (origPush && hist.pushState !== origPush) hist.pushState = origPush; } catch {}
      try { if (origReplace && hist.replaceState !== origReplace) hist.replaceState = origReplace; } catch {}
      doc.getElementById(ROOT_ID)?.remove();
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

  // Apply hideRecents — only actually hide when the plugin is enabled and has
  // visible shelves.  Otherwise force recents visible regardless of the toggle
  // (we never change the stored setting, only the DOM state).
  //
  // When `recentsReplaceSource` is on, the native recents area remains
  // visible on purpose — our router patch is driving its games array — so
  // the visual hide is skipped. First visible shelf is forced-expanded only
  // when we're truly hiding (preserves the current behaviour).
  // Re-run this effect when the recents-replace kill switch flips (our
  // experiment reported a runtime error → fall back to the visual hide).
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
    const visibleShelves = (settings?.shelves ?? []).filter((s: any) => s.enabled && !s.hidden);
    const replaceActive = settings?.enabled && settings?.hideRecents === true
      && settings?.recentsReplaceSource === true && visibleShelves.length > 0
      && !replaceKillSwitch;
    const canHide = settings?.enabled && settings?.hideRecents === true
      && visibleShelves.length > 0 && !replaceActive;
    applyHideRecents(canHide === true);
    // When recents are hidden, remove them from the gamepad navigation tree so
    // the D-pad skips straight to our shelves.  We keep the DOM intact (visibility:
    // hidden) so we can still read native classes, hero images, etc.
    if (mountEl) {
      const recentsEl = mountEl.previousElementSibling as HTMLElement | null;
      if (recentsEl) {
        const focusables = recentsEl.querySelectorAll<HTMLElement>('[tabindex], button, a, input, [role="button"]');
        for (const el of Array.from(focusables)) {
          if (canHide) {
            if (!el.dataset.dsPrevTabindex) el.dataset.dsPrevTabindex = el.getAttribute('tabindex') ?? '0';
            el.setAttribute('tabindex', '-1');
          } else if (el.dataset.dsPrevTabindex !== undefined) {
            el.setAttribute('tabindex', el.dataset.dsPrevTabindex);
            delete el.dataset.dsPrevTabindex;
          }
        }
        if (canHide) recentsEl.setAttribute('aria-hidden', 'true');
        else recentsEl.removeAttribute('aria-hidden');
      }
    }
  }, [settings?.hideRecents, settings?.enabled, settings?.shelves, settings?.recentsReplaceSource, mountEl, replaceKillSwitch]);

  // Apply hideHomeTabs — no suppression criteria, simple toggle. If no sibling
  // elements are found around the mount, the helper is a no-op.
  useEffect(() => {
    applyHideHomeTabs(settings?.hideHomeTabs === true);
  }, [settings?.hideHomeTabs, mountEl]);

  if (!mountEl) return null;
  if (!settings) return null;

  // Crash protection: don't attempt to render if mounting has failed
  if (getMountFailed()) {
    logWarn("HOME", "mount failed — skipping render");
    return null;
  }

  const visibleShelves = (settings.shelves ?? []).filter((s) => s.enabled && !s.hidden);

  // When replace-source is actively injecting (toggle on + app ids resolved
  // + not killed), the injected shelf is already rendering inside the native
  // recents slot. Skip it here to avoid a visual duplicate below. If the
  // injection isn't happening (failed, not resolved yet), keep every shelf.
  const normalShelves = (replaceInjecting && !replaceKillSwitch)
    ? (() => {
        const activeId = getRecentsReplaceActiveShelfId();
        return activeId
          ? visibleShelves.filter((s) => s.id !== activeId)
          : visibleShelves.slice(1);
      })()
    : visibleShelves;

  // Convert enabled smart shelves to Shelf-compatible objects for ShelfView.
  let smartShelves: Shelf[] = [];
  if (settings.smartShelvesEnabled) {
    if (settings.smartSurpriseMe) {
      const _now = new Date();
      const dayIndex = _now.getFullYear() * 10000 + (_now.getMonth() + 1) * 100 + _now.getDate();
      const rawCount = settings.smartSurpriseMeCount ?? 0;
      const count = rawCount > 0 ? rawCount : (1 + (dayIndex % 3));
      const selected = seededShuffle(SURPRISE_MODES, dayIndex).slice(0, count);
      smartShelves = selected.map((mode): Shelf => ({
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
        hideCompatIcons: false,
        hideNonSteamBadge: false,
        hideShelfTitle: false,
        source: { type: "smart", mode },
      }));
    } else {
      smartShelves = (settings.smartShelves ?? [])
        .filter((s: SmartShelf) => s.enabled && !s.hidden)
        .map((s: SmartShelf): Shelf => ({
          id: s.id,
          title: s.title,
          enabled: true,
          hidden: false,
          limit: s.limit ?? 20,
          matchNativeSize: (s as any).matchNativeSize ?? false,
          highlightFirst: (s as any).highlightFirst ?? false,
          highlightAll: (s as any).highlightAll ?? false,
          highlightedAppIds: (s as any).highlightedAppIds,
          hideStatusLine: (s as any).hideStatusLine ?? false,
          hideNewBadge: (s as any).hideNewBadge ?? false,
          hideCompatIcons: (s as any).hideCompatIcons ?? false,
          hideNonSteamBadge: (s as any).hideNonSteamBadge ?? false,
          hideShelfTitle: (s as any).hideShelfTitle ?? false,
          source: {
            type: "smart",
            mode: s.mode,
            filterGroup: (s as any).filterGroup,
            smartParams: (s as any).smartParams,
            refreshIntervalMinutes: (s as any).refreshIntervalMinutes,
          } as any,
          // Surface user-configured overrides so resolveShelfAppIds +
          // Shelf.tsx can apply them on top of the mode's candidates.
          sort: (s as any).sort,
          manualOrder: (s as any).manualOrder,
          manualBaseSort: (s as any).manualBaseSort,
        } as any));
    }
  }

  // Placement logic:
  //  - atBottom: normal first, then smart
  //  - hideRecents + NOT replace-injecting: DOM order is [...normal, ...smart]
  //    so a normal shelf is always the first DOM child (Opção B can promote
  //    it into the recents slot — smart shelves are heuristic and may
  //    render `null`, so they must never be ahead of any normal in the DOM).
  //    Visual order is restored via CSS `order` further down: promoted
  //    normal at order 0, smart at order 1, remaining normals at order 2 —
  //    yields the user-intended [firstNormal, smart, restNormal] interleave
  //    even when the first normal happens to render empty.
  //  - replace-injecting or default: smart first (or last if atBottom), then normal
  //    (when replace-injecting, shelf1 is already in the native recents slot; normalShelves
  //     already has it removed, so the "after first" special case must not apply)
  const normalFirst = settings.smartShelvesAtBottom
    || (settings.hideRecents === true && !(replaceInjecting && !replaceKillSwitch));
  const shelves: Shelf[] = normalFirst
    ? [...normalShelves, ...smartShelves]
    : [...smartShelves, ...normalShelves];

  // Visual interleave mode: when hiding recents AND the user did NOT request
  // smart-shelves-at-bottom, we render [normal..., smart...] in the DOM but
  // present them visually as [promoted normal, smart, rest of normal] via
  // flex `order`. When `smartShelvesAtBottom=true`, the user explicitly
  // wants smart at the end — no reorder needed, the array order matches.
  const interleaveSmart = settings.hideRecents === true
    && !settings.smartShelvesAtBottom
    && !(replaceInjecting && !replaceKillSwitch);

  // When the plugin is disabled, there are no visible shelves, or all shelves
  // are hidden — always ensure recents are visible regardless of the toggle
  // value (we never force-change the setting, just override the DOM state).
  if (!settings.enabled || !visibleShelves.length) {
    applyHideRecents(false);
    if (!settings.enabled) logWarn("HOME", "plugin disabled — recents forced visible");
    return null;
  }
  logInfo("HOME", "rendering shelves via portal", { visible: shelves.length, mountConnected: mountEl.isConnected });

  return createPortal(
    <PlatformProvider platform={homePlatform}>
      <ShelvesContainer mountEl={mountEl} shelves={shelves} globalMatchNativeSize={settings.globalMatchNativeSize === true} globalHighlightFirst={settings.globalHighlightFirst === true} globalHighlightAll={settings.globalHighlightAll === true} globalHideStatusLine={settings.globalHideStatusLine === true} globalHideNewBadge={settings.globalHideNewBadge === true} globalHideCompatIcons={settings.globalHideCompatIcons === true} globalHideNonSteamBadge={settings.globalHideNonSteamBadge === true} globalHideShelfTitle={settings.globalHideShelfTitle === true} shelfHeroBackground={settings.hideRecents === true && settings.shelfHeroBackground === true && !(replaceInjecting && !replaceKillSwitch)} hideRecentsSetting={settings.hideRecents === true && (settings.recentsReplaceSource !== true || replaceKillSwitch)} interleaveSmart={interleaveSmart} />
    </PlatformProvider>,
    mountEl,
  ) as any;
}

function ShelvesContainer({ mountEl, shelves, globalMatchNativeSize = false, globalHighlightFirst = false, globalHighlightAll = false, globalHideStatusLine = false, globalHideNewBadge = false, globalHideCompatIcons = false, globalHideNonSteamBadge = false, globalHideShelfTitle = false, shelfHeroBackground = false, hideRecentsSetting = false, interleaveSmart = false }: { mountEl: HTMLElement; shelves: any[]; globalMatchNativeSize?: boolean; globalHighlightFirst?: boolean; globalHighlightAll?: boolean; globalHideStatusLine?: boolean; globalHideNewBadge?: boolean; globalHideCompatIcons?: boolean; globalHideNonSteamBadge?: boolean; globalHideShelfTitle?: boolean; shelfHeroBackground?: boolean; hideRecentsSetting?: boolean; interleaveSmart?: boolean }) {
  useEffect(() => {
    // One-time nav tree API detection — result surfaced in About > Diagnostics
    const navApi = detectNavTreeApi();
    logDiagnostic(
      navApi.available ? 'info' : 'warn',
      navApi.available ? 'Gamepad nav tree API available' : 'Gamepad nav tree API unavailable',
      navApi.detail,
    );

    // Apply idempotent patches (menu/edge/bridge) on every mount-subtree
    // mutation. Reparent runs independently with its own triggers because
    // Steam can rebuild our nav node's parent without touching our DOM
    // subtree (e.g. when native home re-registers focusables around us).
    const applyPatches = () => {
      try {
        reparentNavTreeNodes(mountEl);
        patchShelfEdgeNavigation(mountEl);
        patchMenuButton();
        installVerticalFocusBridge(mountEl);
        installPassiveMenuHook();
        installPassiveShowContextMenuHook();
        tryRestoreFocus();
      } catch (e) { logInfo("HOME", "applyPatches failed", String(e)); }
    };
    const reparentOnly = () => {
      try { reparentNavTreeNodes(mountEl); } catch (e) { logInfo("HOME", "reparentOnly failed", String(e)); }
    };

    applyPatches();
    // Proactive extraction via `prewarmMenuExtraction` was removed: it
    // invoked the native `onMenuButton` handler on mount, which briefly
    // opened a real Steam context menu on the home screen — users saw
    // this as "the menu button being pressed by itself" right after
    // Steam restart. Extraction still happens lazily on the first user
    // MENU press (inside `showGameMenu`), and the passive hooks
    // (`installPassiveMenuHook` / `installPassiveShowContextMenuHook`)
    // keep capturing opportunistically when Steam itself renders a
    // native menu (e.g. in the library game detail view).

    // Observer 1: mutations inside our mount (shelf render, collapse/expand)
    const obs = new MutationObserver(applyPatches);
    obs.observe(mountEl, { childList: true, subtree: true });

    // Observer 2: mutations on mount's PARENT — catches Steam's native home
    // re-adding/re-ordering siblings, which is when it re-registers our nav
    // node at the wrong tree level. Only listens to direct-child changes.
    let parentObs: MutationObserver | null = null;
    if (mountEl.parentElement) {
      parentObs = new MutationObserver(reparentOnly);
      parentObs.observe(mountEl.parentElement, { childList: true });
    }

    // Safety net: poll every 3s. Stability guard short-circuits when the
    // position is correct, so the wake-ups cost near-zero in steady state.
    // MutationObservers (inside mount + on parent) + focusin + popstate +
    // hashchange already cover every real reparent trigger; the interval
    // only catches exotic Steam re-registers with no DOM mutation at all.
    // Previously ran at 750ms — 4× the wake-ups for no measurable benefit.
    const poll = window.setInterval(reparentOnly, 3000);

    // Focus events also signal Steam-driven tree changes; run reparent on
    // focusin at the document level (cheap; guard will no-op when correct).
    const doc = mountEl.ownerDocument;
    const onFocusIn = () => reparentOnly();
    doc?.addEventListener("focusin", onFocusIn, true);

    const win = getPreferredSteamWindow();
    const onNavEvent = () => { applyPatches(); if (hasPendingFocus()) beginFocusRestoreLoop(); };
    win.addEventListener("popstate", onNavEvent);
    win.addEventListener("hashchange", onNavEvent);

    return () => {
      obs.disconnect();
      parentObs?.disconnect();
      window.clearInterval(poll);
      doc?.removeEventListener("focusin", onFocusIn, true);
      win.removeEventListener("popstate", onNavEvent);
      win.removeEventListener("hashchange", onNavEvent);
    };
  }, [mountEl]);

  // Monitor shelves -> if hideRecentsSetting is true but there are no visible
  // shelves or none resolve to items, force recents visible and emit disable event.
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const visible = (shelves ?? []).filter((s) => s.enabled && !s.hidden);
        if (!hideRecentsSetting) {
          if (alive) globalThis.dispatchEvent(new CustomEvent('deck-shelves-hideRecents-disabled', { detail: { disabled: false } }));
          return;
        }
        if (!visible.length) {
          applyHideRecents(false);
          if (alive) globalThis.dispatchEvent(new CustomEvent('deck-shelves-hideRecents-disabled', { detail: { disabled: true } }));
          return;
        }
        const resolved = await Promise.all(visible.map((sh) => homePlatform.resolveShelfAppIds(sh.source, sh.limit).catch(() => [])));
        const anyHas = resolved.some((r) => Array.isArray(r) && r.length > 0);
        if (!anyHas) {
          applyHideRecents(false);
          if (alive) globalThis.dispatchEvent(new CustomEvent('deck-shelves-hideRecents-disabled', { detail: { disabled: true } }));
        } else {
          if (hideRecentsSetting) applyHideRecents(true);
          if (alive) globalThis.dispatchEvent(new CustomEvent('deck-shelves-hideRecents-disabled', { detail: { disabled: false } }));
        }
      } catch (e) {
        if (alive) globalThis.dispatchEvent(new CustomEvent('deck-shelves-hideRecents-disabled', { detail: { disabled: false } }));
      }
    };
    check();
    return () => { alive = false; };
  }, [shelves, hideRecentsSetting, mountEl]);

  // When recents are hidden, move gamepad focus to the first shelf card
  // using the Steam FocusNavController API (element.focus() alone does not
  // update the gamepad nav tree).  Retries because shelf content loads async.
  useEffect(() => {
    if (!hideRecentsSetting) return;
    let cancelled = false;
    const tryFocus = () => {
      if (cancelled) return true;
      try {
        // Do not hijack focus if the user is already navigating inside the
        // shelves — effect re-runs on shelves.length changes (5s interval).
        if (mountEl.querySelector('.ds-shelf .gpfocus, .deck-shelves-root .gpfocus')) return true;
        const firstCard = mountEl.querySelector('.ds-shelf .ds-card') as HTMLElement | null;
        if (firstCard) return focusElement(firstCard);
        const firstRow = mountEl.querySelector('.ds-shelf .ds-row-scroll') as HTMLElement | null;
        if (firstRow) return focusElement(firstRow);
      } catch (e) { logInfo("HOME", "focus first shelf failed", String(e)); }
      return false;
    };
    if (!tryFocus()) {
      const t1 = setTimeout(tryFocus, 500);
      const t2 = setTimeout(tryFocus, 1500);
      const t3 = setTimeout(tryFocus, 3000);
      return () => { cancelled = true; clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
    }
    return () => { cancelled = true; };
  }, [hideRecentsSetting, mountEl, shelves?.length]);

  const rootRef = useRef<HTMLDivElement>(null);

  // Which shelf id is actually the first rendered `.ds-shelf` right now —
  // updated by a MutationObserver on the mount. Needed because the first
  // entry in the `shelves` array may render `null` (e.g. a filter resolves
  // to 0 apps), so "first in the array" ≠ "first on screen". Only the
  // first on-screen shelf should be promoted to the native-recents slot
  // when `hideRecentsSetting` is on — via `forceExpanded`.
  // Smart shelves are never promoted to the recents slot — they appear and
  // disappear based on heuristics, so handing them the recents-slot styling
  // would make the slot's identity flicker. Only normal (user-defined)
  // shelves are eligible for promotion.
  const [firstVisibleId, setFirstVisibleId] = useState<string | null>(null);
  useEffect(() => {
    if (!hideRecentsSetting) { setFirstVisibleId(null); return; }
    const rootEl = rootRef.current;
    if (!rootEl) return;
    // Walk shelves in CONFIG order (not DOM order) and pick the first
    // non-smart shelf that's currently rendering content. Two reasons:
    //   1. Skip empty/unresolved shelves so a 0-apps first shelf does not
    //      get promoted while another shelf's content sits below with the
    //      empty shelf's title still nominally claiming the slot.
    //   2. Keep the candidate stable regardless of which shelf finishes
    //      resolving first — pure DOM-order scans pick the fastest
    //      resolver, which often is a non-Steam / smaller shelf instead of
    //      the user's intended first shelf.
    const scan = () => {
      const renderedIds = new Set(
        Array.from(rootEl.querySelectorAll<HTMLElement>('.ds-shelf[data-shelfid]'))
          .map((el) => el.getAttribute('data-shelfid'))
          .filter((id): id is string => !!id),
      );
      const pick = pickFirstVisibleShelfId(shelves ?? [], renderedIds);
      setFirstVisibleId((prev) => (prev === pick ? prev : pick));
    };
    scan();
    const obs = new MutationObserver(scan);
    obs.observe(rootEl, { childList: true, subtree: false });
    return () => obs.disconnect();
  }, [hideRecentsSetting, shelves]);

  // CSS Loader compat — narrow scope by design.
  //
  // Themes that restyle the UNIVERSAL shelf surface (card shape, transitions,
  // generic animations) target classes our cards inherit naturally from
  // React/Decky (`Panel`, `Focusable`, plus the hashed component tokens) —
  // those themes already reach every DS shelf at all times without any
  // intervention from us.
  //
  // Themes that restyle the RECENTS WRAPPER (hero art height, banner mode,
  // ArtHero family etc.) target the obfuscated class on the parent of the
  // native recents block. Our shelves don't carry that class — so when the
  // user hides native recents we promote ONLY the first visible shelf into
  // that selector space by adding `data-ds-recents-slot` + the live wrapper
  // class read from `mountEl.previousElementSibling`.
  //
  // Invariants enforced by the guard chain below — do NOT loosen without
  // updating `checks/plugins/cssloader/arthero.sh`:
  //   1. Promotion only when `hideRecentsSetting` is true.
  //   2. Promotion only on the FIRST visible shelf (`firstVisibleId`).
  //   3. Promotion only when at least one CSS Loader theme is active.
  //   4. Class assignment is purely additive — `ds-*` is never stripped.
  useEffect(() => {
    if (!hideRecentsSetting) return;       // INVARIANT 1
    if (!firstVisibleId) return;            // INVARIANT 2
    if (!isCssLoaderActive()) return;       // INVARIANT 3
    const rootEl = rootRef.current;
    if (!rootEl) return;
    const nativeClass = getNativeRecentsClassName(mountEl);
    if (!nativeClass) return;
    const target = rootEl.querySelector<HTMLElement>(`.ds-shelf[data-shelfid="${CSS.escape(firstVisibleId)}"]`);
    if (!target) return;
    target.setAttribute('data-ds-recents-slot', 'true');
    target.classList.add(nativeClass);      // INVARIANT 4
    return () => {
      try {
        target.removeAttribute('data-ds-recents-slot');
        target.classList.remove(nativeClass);
      } catch {}
    };
  }, [hideRecentsSetting, firstVisibleId, mountEl]);

  // Drag-to-reorder shelves by holding the title (touch/mouse only; D-pad nav
  // stays untouched). The hook scopes to `.ds-shelf[data-shelfid]` under the
  // root container and only acts on ids that match REGULAR shelves in
  // settings (smart shelves are position-managed separately via their toggle).
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
      saveSettings({ ...s, shelves: next });
    },
    axis: 'vertical',
    allowedPointerTypes: ['mouse', 'touch'],
  });

  // Visual interleave: when needed, REORDER the shelves array so the DOM
  // matches the visual order. CSS `order` was tried but it doesn't move
  // gamepad/accessibility focus — navigation followed DOM order, jumping
  // from promoted to "rest of normal" without visiting smart in between.
  // Reordering at React level fixes both rendering and navigation in one
  // pass. Falls back to the original `shelves` array when interleave is
  // off OR when `firstVisibleId` isn't yet known.
  const orderedShelves = useMemo(() => {
    if (!interleaveSmart) return shelves;
    return interleaveSmartShelves(shelves, firstVisibleId);
  }, [shelves, interleaveSmart, firstVisibleId]);

  return (
    <Focusable
      ref={rootRef}
      className="deck-shelves-root"
      flow-children="column"
      style={{ width: "100%", display: "flex", flexDirection: "column", paddingBottom: 8, marginBottom: 24, position: "relative" }}
    >
      {shelfHeroBackground && <HeroBackground mountEl={mountEl} />}
      {orderedShelves.map((shelf: any) => <ShelfView key={shelf.id} shelf={shelf} globalMatchNativeSize={globalMatchNativeSize} globalHighlightFirst={globalHighlightFirst} globalHighlightAll={globalHighlightAll} globalHideStatusLine={globalHideStatusLine} globalHideNewBadge={globalHideNewBadge} globalHideCompatIcons={globalHideCompatIcons} globalHideNonSteamBadge={globalHideNonSteamBadge} globalHideShelfTitle={globalHideShelfTitle} forceExpanded={hideRecentsSetting && shelf.id === firstVisibleId} />)}
    </Focusable>
  );
}
