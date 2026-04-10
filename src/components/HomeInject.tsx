import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ShelfView } from "./Shelf";
import type { Settings } from "../types";
import { refreshSettings, subscribeSettings } from "../settingsStore";
import { PlatformProvider } from "../runtime/platformContext";
import { createDeckyPlatform } from "../runtime/deckyPlatform";
import { logInfo, logWarn } from "../runtime/logger";
import { logDiagnostic } from "../runtime/diagnostics";
import { getPreferredSteamDocument, getPreferredSteamWindow } from "../runtime/steamHost";
import { applyHideRecents, getMountFailed } from "../runtime/homePatch";
import { Focusable } from "@decky/ui";
import { installPassiveMenuHook } from "../core/steamGameMenu";
import { tryRestoreFocus, hasPendingFocus, beginFocusRestoreLoop } from "../core/focusRestore";
import { HeroBackground } from "./shelf/HeroBackground";
import { reparentNavTreeNodes, patchShelfEdgeNavigation, patchMenuButton } from "./home/navPatches";

const ROOT_ID = "deck-shelves-home-root";
const homePlatform = createDeckyPlatform();


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
  try { if (doc.querySelector('div._282X0J4BtrSF1IXctmOe-X')) return true; } catch (e) { logInfo("HOME", "hasHomeDomSignals: class selector failed", String(e)); }
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
    // Long fallback for edge cases the observer misses (e.g. iframe navigation)
    const timer = window.setInterval(updateMount, 10000);
    win.addEventListener("hashchange", updateMount);
    win.addEventListener("popstate", updateMount);

    return () => {
      alive = false;
      obs.disconnect();
      window.clearInterval(timer);
      win.removeEventListener("hashchange", updateMount);
      win.removeEventListener("popstate", updateMount);
      doc.getElementById(ROOT_ID)?.remove();
    };
  }, []);

  useEffect(() => {
    if (!mountEl) return;
    let alive = true;
    mountEl.dataset.deckShelvesRenderer = 'react';
    const unsub = subscribeSettings((s) => { if (alive) setSettings(s); });
    refreshSettings().then((s) => { if (alive) setSettings(s); }).catch(() => undefined);

    const onSettingsChanged = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail && alive) setSettings(detail);
    };
    globalThis.addEventListener("deck-shelves-settings-changed", onSettingsChanged);

    return () => {
      alive = false;
      unsub();
      globalThis.removeEventListener("deck-shelves-settings-changed", onSettingsChanged);
      delete mountEl.dataset.deckShelvesRenderer;
    };
  }, [mountEl]);

  // Apply hideRecents — only actually hide when the plugin is enabled and has
  // visible shelves.  Otherwise force recents visible regardless of the toggle
  // (we never change the stored setting, only the DOM state).
  useEffect(() => {
    const visibleShelves = (settings?.shelves ?? []).filter((s: any) => s.enabled && !s.hidden);
    const canHide = settings?.enabled && settings?.hideRecents === true && visibleShelves.length > 0;
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
  }, [settings?.hideRecents, settings?.enabled, settings?.shelves, mountEl]);

  if (!mountEl) return null;
  if (!settings) return null;

  // Crash protection: don't attempt to render if mounting has failed
  if (getMountFailed()) {
    logWarn("HOME", "mount failed — skipping render");
    return null;
  }

  const shelves = (settings.shelves ?? []).filter((s) => s.enabled && !s.hidden);

  // When the plugin is disabled, there are no visible shelves, or all shelves
  // are hidden — always ensure recents are visible regardless of the toggle
  // value (we never force-change the setting, just override the DOM state).
  if (!settings.enabled || !shelves.length) {
    applyHideRecents(false);
    if (!settings.enabled) logWarn("HOME", "plugin disabled — recents forced visible");
    return null;
  }
  logInfo("HOME", "rendering shelves via portal", { visible: shelves.length, mountConnected: mountEl.isConnected });

  return createPortal(
    <PlatformProvider platform={homePlatform}>
      <ShelvesContainer mountEl={mountEl} shelves={shelves} globalMatchNativeSize={settings.globalMatchNativeSize === true} globalHighlightFirst={settings.globalHighlightFirst === true} globalHideStatusLine={settings.globalHideStatusLine === true} shelfHeroBackground={settings.hideRecents === true && settings.shelfHeroBackground === true} hideRecentsSetting={settings.hideRecents === true} />
    </PlatformProvider>,
    mountEl,
  ) as any;
}

function ShelvesContainer({ mountEl, shelves, globalMatchNativeSize = false, globalHighlightFirst = false, globalHideStatusLine = false, shelfHeroBackground = false, hideRecentsSetting = false }: { mountEl: HTMLElement; shelves: any[]; globalMatchNativeSize?: boolean; globalHighlightFirst?: boolean; globalHideStatusLine?: boolean; shelfHeroBackground?: boolean; hideRecentsSetting?: boolean }) {
  useEffect(() => {
    // One-time nav tree API detection — result surfaced in About > Diagnostics
    const navApi = detectNavTreeApi();
    logDiagnostic(
      navApi.available ? 'info' : 'warn',
      navApi.available ? 'Gamepad nav tree API available' : 'Gamepad nav tree API unavailable',
      navApi.detail,
    );

    const applyPatches = () => {
      try {
        reparentNavTreeNodes(mountEl);
        patchShelfEdgeNavigation(mountEl);
        patchMenuButton();
        installPassiveMenuHook();
        tryRestoreFocus();
      } catch (e) { logInfo("HOME", "applyPatches failed", String(e)); }
    };

    // Run patches immediately, then on DOM mutations + long fallback
    applyPatches();
    const obs = new MutationObserver(applyPatches);
    obs.observe(mountEl, { childList: true, subtree: true });
    const fallback = setInterval(applyPatches, 10000);

    const win = getPreferredSteamWindow();
    const onNavEvent = () => { applyPatches(); if (hasPendingFocus()) beginFocusRestoreLoop(); };
    win.addEventListener("popstate", onNavEvent);
    win.addEventListener("hashchange", onNavEvent);

    return () => {
      obs.disconnect();
      clearInterval(fallback);
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
    const timer = setInterval(check, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, [shelves?.length, hideRecentsSetting, mountEl]);

  // When recents are hidden, focus the first card in the first shelf.
  // Uses a short delay to wait for shelf content to render.
  useEffect(() => {
    if (!hideRecentsSetting) return;
    const tryFocus = () => {
      try {
        // Prefer focusing the first game card directly (Focusable) for gamepad nav
        const firstCard = mountEl.querySelector('.ds-shelf .ds-card') as HTMLElement | null;
        if (firstCard && typeof firstCard.focus === 'function') {
          firstCard.focus();
          return true;
        }
        // Fallback: focus the row scroll container
        const firstRow = mountEl.querySelector('.ds-shelf .ds-row-scroll') as HTMLElement | null;
        if (firstRow && typeof firstRow.focus === 'function') {
          firstRow.focus();
          return true;
        }
      } catch (e) { logInfo("HOME", "focus first shelf failed", String(e)); }
      return false;
    };
    // Try immediately, then retry after a short delay for async shelf loading
    if (!tryFocus()) {
      const t1 = setTimeout(tryFocus, 300);
      const t2 = setTimeout(tryFocus, 1000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [hideRecentsSetting, mountEl, shelves?.length]);

  return (
    <Focusable
      className="deck-shelves-root"
      flow-children="column"
      style={{ width: "100%", display: "flex", flexDirection: "column", paddingBottom: 8, marginBottom: 24, position: "relative" }}
    >
      {shelfHeroBackground && <HeroBackground mountEl={mountEl} />}
      {shelves.map((shelf) => <ShelfView key={shelf.id} shelf={shelf} globalMatchNativeSize={globalMatchNativeSize} globalHighlightFirst={globalHighlightFirst} globalHideStatusLine={globalHideStatusLine} />)}
    </Focusable>
  );
}
