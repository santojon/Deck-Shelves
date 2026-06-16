import { useEffect, useRef, useCallback, useMemo, useState } from "react";
import { Focusable, GamepadButton } from "../../runtime/host/decky";
import { dispatchHomeButtonDown } from "../../runtime/homeInputBus";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { buildSelectorFromToken, getRuntimeClassMap } from "../../core/webpackCompat";
import { getPortraitUrls, getLandscapeUrls, getLogoUrls, getIconUrls, getAppAssetCacheKey } from "../../core/steamAssets";
import { getHotCachedImageSrc, warmCacheBackground, firstCacheableUrl } from "../../core/imageCache";
import { getAppDescriptions, preloadAppDescriptions } from "../../steam/appDescriptionsCache";
import { logInfo } from "../../runtime/logger";
import i18n from "../../i18n";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { formatPlaytime } from "./shelfStyles";
import { PlaceholderCard } from "./PlaceholderCard";
import { resolveNativeCardClass } from "./cardUtils";
import { getCurrentSettings, saveSettings } from "../../store/settingsStore";
import { patchShelfInSettings } from "../../domain/settings";
import { saveFocusTarget, beginFocusRestoreLoop } from "../../core/focusRestore";
import { BTN, createMatcherState, matchEvent, parseCombo, parseRawCombo, resolveBindings } from "../../runtime/buttonBindings";
import { subscribeControllerInput } from "../../runtime/controllerInput";

// Build a {buttonId: label} map for Decky's Focusable `actionDescriptionMap`.
// Only single-button bindings get a legend; chords/doubles silently drop.
function buildActionDescriptionMap(args: {
  previewMode: boolean;
  appid: number | undefined;
  isLibraryGame: boolean;
  quickLaunchLabel: string | undefined;
  removable: boolean;
  hideable: boolean;
  hiddenNow: boolean;
}): Record<number, string> | undefined {
  const b = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled);
  const TOKEN_TO_BTN: Record<string, number> = {
    X: BTN.SECONDARY, Y: BTN.OPTIONS,
    L1: BTN.L1, R1: BTN.R1, L2: BTN.L2, R2: BTN.R2,
    VIEW: BTN.VIEW, SELECT: BTN.VIEW,
    LSTICK: BTN.LSTICK, RSTICK: BTN.RSTICK,
    DPAD_UP: BTN.DPAD_UP, DPAD_DOWN: BTN.DPAD_DOWN,
    DPAD_LEFT: BTN.DPAD_LEFT, DPAD_RIGHT: BTN.DPAD_RIGHT,
  };
  const single = (raw: string | null | undefined): number | null => {
    if (!raw || raw.includes("+")) return null;
    return TOKEN_TO_BTN[raw.trim().toUpperCase()] ?? null;
  };
  const out: Record<number, string> = {};
  if (!args.previewMode && args.appid) {
    const qb = single(b.cardQuickLaunch);
    if (qb !== null && args.isLibraryGame && args.quickLaunchLabel) out[qb] = args.quickLaunchLabel;
    const hb = single(b.cardHideRemove);
    if (hb !== null) {
      if (args.removable) out[hb] = i18n.t('card_remove');
      else if (args.hideable) out[hb] = i18n.t(args.hiddenNow ? 'card_show' : 'card_hide');
    }
    const yb = single(b.cardHighlightToggle);
    if (yb !== null) out[yb] = i18n.t('card_highlight_toggle');
  }
  return Object.keys(out).length ? out : undefined;
}

// Y-button quick-action: toggle a per-card highlight (entry in
// `highlightedAppIds`). When the card was being highlighted via the
// shelf-level highlightAll / highlightFirst flags, this clears the
// shelf-level source instead so the user gets a predictable visual
// "off". Mirrors the context-menu "Highlight this game" path.
export function toggleCardHighlight(shelfId: string | undefined, appid: number): void {
  if (!shelfId || !appid) return;
  const s = getCurrentSettings();
  if (!s) return;
  // Smart shelves carry their own settings array — fall back to it when
  // the id doesn't match a regular shelf so Y-button toggle works on
  // friends_playing / spare_time / etc cards too.
  const regular = (s.shelves ?? []) as any[];
  const smart = ((s as any).smartShelves ?? []) as any[];
  const isSmart = !regular.find((sh) => sh.id === shelfId);
  const shelf = isSmart ? smart.find((sh) => sh.id === shelfId) : regular.find((sh) => sh.id === shelfId);
  if (!shelf) return;
  const ids: number[] = shelf.highlightedAppIds ?? [];
  const wasInIds = ids.includes(appid);
  const wasViaAll = !!shelf.highlightAll;
  const patch: Record<string, any> = {};
  if (wasInIds || wasViaAll) {
    if (wasInIds) patch.highlightedAppIds = ids.filter((id) => id !== appid);
    if (wasViaAll) patch.highlightAll = false;
  } else {
    patch.highlightedAppIds = [...ids, appid];
  }
  // saveSettings triggers a Shelf re-render that may unmount/remount the
  // card and lose focus. Mirror the context-menu "Highlight" path: save
  // the focus target + start the restore loop so the card stays focused
  // across the settings → React reconcile cycle.
  try { saveFocusTarget(appid, shelfId); beginFocusRestoreLoop(); } catch {}
  if (isSmart) {
    const updated = smart.map((sh: any) => sh.id === shelfId ? { ...sh, ...patch } : sh);
    void saveSettings({ ...s, smartShelves: updated } as any);
  } else {
    void saveSettings(patchShelfInSettings(s, shelfId, patch));
  }
}

const downloadIcon = (
  <span className="ds-card-status-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" style={{ width: 14, height: 14, display: "block" }}>
      <path fillRule="evenodd" clipRule="evenodd" d="M29 23V27H7V23H2V32H34V23H29Z" fill="currentColor" />
      <path d="M20 14.1716L24.5858 9.58578L27.4142 12.4142L18 21.8284L8.58582 12.4142L11.4142 9.58578L16 14.1715V2H20V14.1716Z" fill="currentColor" />
    </svg>
  </span>
);
const playIcon = (
  <span className="ds-card-status-icon ds-card-status-play">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36" fill="none" style={{ width: 14, height: 14, display: "block" }}>
      <path d="M7.5 32.135a1 1 0 0 1-1.5-.866V4.73a1 1 0 0 1 1.5-.866l22.999 13.269a1 1 0 0 1 0 1.732l-23 13.269Z" fill="currentColor" />
    </svg>
  </span>
);
const updateIcon = (
  <span className="ds-card-status-icon">
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: 14, height: 14, display: "block" }}>
      <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z" />
    </svg>
  </span>
);
const deckLogoSvg = (
  <svg className="ds-compat-deck-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path opacity="0.84" fillRule="evenodd" clipRule="evenodd" d="M7.77715 4.30197C10.9241 4.30197 13.4752 6.85305 13.4752 9.99997C13.4752 13.1469 10.9241 15.698 7.77715 15.698V18.8889C12.6864 18.8889 16.666 14.9092 16.666 9.99997C16.666 5.09078 12.6864 1.11108 7.77715 1.11108V4.30197ZM7.77756 13.8889C9.92533 13.8889 11.6664 12.1477 11.6664 9.99997C11.6664 7.8522 9.92533 6.11108 7.77756 6.11108C5.62979 6.11108 3.88867 7.8522 3.88867 9.99997C3.88867 12.1477 5.62979 13.8889 7.77756 13.8889Z" fill="currentColor" />
  </svg>
);
const checkmarkSvg = (
  <svg className="ds-compat-verdict-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M10 19C14.9706 19 19 14.9706 19 10C19 5.02944 14.9706 1 10 1C5.02944 1 1 5.02944 1 10C1 14.9706 5.02944 19 10 19ZM8.33342 11.9222L14.4945 5.76667L16.4556 7.72779L8.33342 15.8556L3.26675 10.7833L5.22786 8.82223L8.33342 11.9222Z" fill="currentColor" />
  </svg>
);
const infoCircleSvg = (
  <svg className="ds-compat-verdict-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M10 19C14.9706 19 19 14.9706 19 10C19 5.02944 14.9706 1 10 1C5.02944 1 1 5.02944 1 10C1 14.9706 5.02944 19 10 19ZM8.61079 9.44444V15H11.3886V9.44444H8.61079ZM9.07372 8.05245C9.34781 8.23558 9.67004 8.33333 9.99967 8.33333C10.4417 8.33333 10.8656 8.15774 11.1782 7.84518C11.4907 7.53262 11.6663 7.10869 11.6663 6.66667C11.6663 6.33703 11.5686 6.0148 11.3855 5.74072C11.2023 5.46663 10.942 5.25301 10.6375 5.12687C10.3329 5.00072 9.99783 4.96771 9.67452 5.03202C9.35122 5.09633 9.05425 5.25507 8.82116 5.48815C8.58808 5.72124 8.42934 6.01821 8.36503 6.34152C8.30072 6.66482 8.33373 6.99993 8.45988 7.30447C8.58602 7.60902 8.79964 7.86931 9.07372 8.05245Z" fill="currentColor" />
  </svg>
);
const xCircleSvg = (
  <svg className="ds-compat-verdict-icon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M14.1931 15.6064C13.0246 16.4816 11.5733 17 10.001 17C6.13498 17 3.00098 13.866 3.00098 10C3.00098 8.42766 3.51938 6.97641 4.39459 5.80783L14.1931 15.6064ZM15.6074 14.1922C16.4826 13.0236 17.001 11.5723 17.001 10C17.001 6.13401 13.867 3 10.001 3C8.42864 3 6.97739 3.5184 5.80881 4.39362L15.6074 14.1922ZM19.001 10C19.001 14.9706 14.9715 19 10.001 19C5.03041 19 1.00098 14.9706 1.00098 10C1.00098 5.02944 5.03041 1 10.001 1C14.9715 1 19.001 5.02944 19.001 10Z" fill="currentColor" />
  </svg>
);

export function GameCard({ item, cardW = CARD_W, cardH = CARD_ART_H, artH: artHProp, featured = false, cardIndex, hideStatusLine = false, hideNewBadge = false, hideDiscountBadge = false, hideCompatIcons = false, hideNonSteamBadge = false, hideGameName = false, hideInstallIndicator = false, enableLogo = false, enableIcon = false, enableDescription = false, descriptionBelowLogo = false, logoPosition = 'left', descriptionPosition = 'left', iconVerticalAlign = 'top', gameNamePosition = 'left', playtimePosition = 'left', inlineBadges = false, previewMode = false, removableSet, onRemoveCard, hiddenSet, onHideCard }: { item: DeckRowItem; cardW?: number; cardH?: number; artH?: number; featured?: boolean; cardIndex?: number; hideStatusLine?: boolean; hideNewBadge?: boolean; hideDiscountBadge?: boolean; hideCompatIcons?: boolean; hideNonSteamBadge?: boolean; hideGameName?: boolean; hideInstallIndicator?: boolean; enableLogo?: boolean; enableIcon?: boolean; enableDescription?: boolean; descriptionBelowLogo?: boolean; logoPosition?: 'left' | 'center' | 'right'; descriptionPosition?: 'left' | 'center' | 'right'; iconVerticalAlign?: 'top' | 'center' | 'bottom'; gameNamePosition?: 'left' | 'center' | 'right'; playtimePosition?: 'left' | 'center' | 'right'; inlineBadges?: boolean; previewMode?: boolean; removableSet?: Set<number>; onRemoveCard?: (appid: number) => void; hiddenSet?: Set<number>; onHideCard?: (appid: number) => void }) {
  const t = i18n.t.bind(i18n);
  const cardRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fallbackIdx = useRef(0);
  const appid = typeof item.id === "number" ? item.id : Number(item.appid ?? 0);
  const featuredW = cardW;
  const artH = artHProp ?? cardH;
  // Size off the per-shelf --ds-eff-* vars (set by DeckRow when matchNativeSize
  // is on) so a native-dims change reflows the card through CSS with no
  // re-render. The prop is the fallback: when the var is absent — non-native
  // shelves, or the brief window before ensureStyles sets the root vars — the
  // card keeps its prior prop-driven size.
  const cssW = `var(${featured ? "--ds-eff-feat-w" : "--ds-eff-card-w"}, ${cardW}px)`;
  const cssH = `var(${featured ? "--ds-eff-feat-h" : "--ds-eff-card-h"}, ${cardH}px)`;
  const cssArtH = `var(${featured ? "--ds-eff-feat-art-h" : "--ds-eff-card-art-h"}, ${artH}px)`;

  const [nativeCardClass, setNativeCardClass] = useState('');
  const [imgFailed, setImgFailed] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Dedupe activation: Focusable fires onActivate + onOKButton + dispatches
  // vgp_onok (listened below), so a single A-press can invoke item.onActivate
  // up to 3× — pushing multiple history entries and requiring 2× B to exit.
  const lastActivateRef = useRef(0);
  // When the editor sets `item.onToggleSelection`, the click target
  // switches from "open game" to "toggle selection" — keeps the preview
  // unified across highlight / hidden picker tabs (same real-card
  // render, just a different click handler + an overlay marker below).
  const onActivateRef = useRef(item.onToggleSelection ?? item.onActivate);
  onActivateRef.current = item.onToggleSelection ?? item.onActivate;
  const activate = useCallback(() => {
    const now = Date.now();
    if (now - lastActivateRef.current < 400) return;
    lastActivateRef.current = now;
    onActivateRef.current?.();
  }, []);
  // Select-button action mirrors the native menu's first item per
  // state: running → RaiseWindow; update-pending → ResumeAppUpdate;
  // else → RunGame.
  const cardState = useMemo(() => {
    if (previewMode || !appid) return { label: undefined as string | undefined, action: 'run' as 'run' | 'resume_update' | 'raise' };
    try {
      const overview = (globalThis as any).appStore?.GetAppOverviewByAppID?.(appid);
      if (!overview) return { label: undefined, action: 'run' };
      if (overview.installed !== true) return { label: i18n.t('menu_install'), action: 'run' };
      const ds = (() => {
        if (typeof overview.display_status === 'number') return overview.display_status;
        const pcd = overview.per_client_data ?? overview.local_per_client_data;
        if (Array.isArray(pcd) && pcd[0] && typeof pcd[0].display_status === 'number') return pcd[0].display_status;
        return 0;
      })();
      // EAppDisplayStatus: Launching=1, Reconfiguring=2, Installing=3,
      // Running=4, Validating=5, UpdateQueued=7, UpdatePaused=8,
      // Staging=12, Committing=13, Downloading=19.
      // Uninstalling/Suspended (ds 6 / 14 / 16) — Steam's native menu surfaces
      // "Uninstall" / "Cancel uninstall" as the first item, not Play.
      // Actively progressing download/install (3 / 5 / 7 / 12 / 13 / 19) —
      // the native menu's first item is "Pause" (not Update). Paused (8) /
      // Reconfiguring (2) keep the "Update" hint.
      const RUNNING = ds === 1 || ds === 4;
      const PAUSE = ds === 3 || ds === 5 || ds === 7 || ds === 12 || ds === 13 || ds === 19;
      const UPDATE = ds === 2 || ds === 8;
      const UNINSTALLING = ds === 6 || ds === 14 || ds === 16;
      if (RUNNING) return { label: i18n.t('menu_resume'), action: 'raise' };
      if (PAUSE) return { label: i18n.t('menu_pause'), action: 'resume_update' };
      if (UPDATE) return { label: i18n.t('menu_update'), action: 'resume_update' };
      if (UNINSTALLING) return { label: i18n.t('menu_uninstall'), action: 'run' };
      return { label: i18n.t('menu_play'), action: 'run' };
    } catch { return { label: undefined, action: 'run' }; }
  }, [appid, previewMode]);
  const quickLaunchLabel = cardState.label;
  // Replicate the native menu's first item by opening the menu and
  // dispatching click on its first .contextMenuItem. This guarantees the
  // exact same action as the user manually opening the menu and picking
  // the first item — without us having to reverse-engineer Steam's
  // internal Ie() resolver for Resume / Update / Play / Install.
  const quickLaunch = useCallback(() => {
    if (previewMode || !appid) return;
    if (typeof item.onMenuButton !== 'function') return;
    try {
      // Open the native context menu (same call the Y / Options button
      // uses). Steam renders it as a portal in the bp document.
      item.onMenuButton({} as any);
      const doc = cardRef.current?.ownerDocument ?? document;
      // Poll for the first menuitem to appear — Steam renders in a
      // microtask but the exact tick varies. Bounded retries with rAF
      // so we don't block. The first .contextMenuItem in document order
      // is the menu's primary action (Resume / Update / Play / Install).
      let attempts = 0;
      const tryClick = () => {
        const first = doc.querySelector('.contextMenuItem') as HTMLElement | null;
        if (first) {
          try { first.click(); } catch {}
          return;
        }
        if (attempts++ < 12) requestAnimationFrame(tryClick);
      };
      requestAnimationFrame(tryClick);
    } catch {}
  }, [appid, previewMode, item.onMenuButton]);
  // `isLibraryGame` = appid resolves to an AppOverview in the local Steam
  // store. True for any game the user owns (installed or not, Steam or
  // non-Steam shortcut). False for:
  //   - decorations (synthetic cards have no appid)
  //   - online items (wishlist / store cards the user doesn't own — Steam
  //     never adds them to the local appStore)
  //   - friends-playing non-owned (same: not in user library)
  //
  // Gates Options button, View/quick-launch, and install indicator —
  // none of those have meaningful behaviour on non-library appids.
  const isLibraryGame = useMemo(() => {
    if (previewMode || !appid) return false;
    try { return !!(globalThis as any).appStore?.GetAppOverviewByAppID?.(appid); }
    catch { return false; }
  }, [appid, previewMode]);
  const matcherRef = useRef(createMatcherState());
  const rawMatcherRef = useRef(createMatcherState());
  const buttonDownHandler = useCallback((evt: any) => {
    if (previewMode) return;
    try { dispatchHomeButtonDown(evt); } catch {}
    if (!appid) return;
    try {
      const b = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled);
      const state = matcherRef.current;
      if (matchEvent(evt, parseCombo(b.cardQuickLaunch), state)) { quickLaunch(); return; }
      if (matchEvent(evt, parseCombo(b.cardHideRemove), state)) {
        if (removableSet?.has(appid) && onRemoveCard) onRemoveCard(appid);
        else if (onHideCard) onHideCard(appid);
        return;
      }
      if (matchEvent(evt, parseCombo(b.cardHighlightToggle), state)) {
        try { toggleCardHighlight(item.shelfId, appid); } catch {}
        return;
      }
    } catch {}
  }, [appid, previewMode, quickLaunch, removableSet, onRemoveCard, onHideCard, item.shelfId]);

  // Raw stream subscription for tokens the Decky home-button bus doesn't
  // forward (back-grip L4/L5/R4/R5). Decky-known tokens stay on the
  // buttonDownHandler path above to avoid firing twice for the same press.
  // Gated by `.gpfocus` so only the focused card's binding fires — same
  // contract as Decky's onButtonDown, which only delivers to the focused
  // Focusable.
  useEffect(() => {
    if (previewMode || !appid) return;
    const usesRawOnly = (combo: string | null | undefined): boolean => {
      if (!combo) return false;
      const tokens = String(combo).toUpperCase().split("+");
      return tokens.some((t) => t === "L4" || t === "L5" || t === "R4" || t === "R5");
    };
    return subscribeControllerInput((e) => {
      if (!e.pressed) return;
      const el = cardRef.current;
      if (!el || !el.classList.contains("gpfocus")) return;
      try {
        const b = resolveBindings(getCurrentSettings()?.buttonBindings as any, (getCurrentSettings() as any)?.buttonBindingsDisabled);
        const state = rawMatcherRef.current;
        const evtLike = { button: e.button };
        if (usesRawOnly(b.cardQuickLaunch) && matchEvent(evtLike, parseRawCombo(b.cardQuickLaunch), state)) { quickLaunch(); return; }
        if (usesRawOnly(b.cardHideRemove) && matchEvent(evtLike, parseRawCombo(b.cardHideRemove), state)) {
          if (removableSet?.has(appid) && onRemoveCard) onRemoveCard(appid);
          else if (onHideCard) onHideCard(appid);
          return;
        }
        if (usesRawOnly(b.cardHighlightToggle) && matchEvent(evtLike, parseRawCombo(b.cardHighlightToggle), state)) {
          try { toggleCardHighlight(item.shelfId, appid); } catch {}
          return;
        }
      } catch {}
    });
  }, [appid, previewMode, quickLaunch, removableSet, onRemoveCard, onHideCard, item.shelfId]);

  useEffect(() => {
    function injectNativeClasses(): boolean {
      const doc = getPreferredSteamDocument();
      const cls = resolveNativeCardClass(doc);
      if (cls === null) return false;
      setNativeCardClass(cls);
      const map = doc ? getRuntimeClassMap(doc) : null;
      const sampleSelector = map?.nativeCard ? buildSelectorFromToken(map.nativeCard) : null;
      const nativeSample = sampleSelector ? doc?.querySelector(`${sampleSelector}:not(.ds-card)`) as HTMLElement | null : null;
      if (nativeSample) {

        try {
          const pa = getComputedStyle(nativeSample, '::after');
          const animName = (pa.animationName || '').split(',')[0] || '';
          const animDur = pa.animationDuration || '';
          const animTiming = pa.animationTimingFunction || '';
          const animIter = pa.animationIterationCount || '';
          if (cardRef.current) {
            if (animName && animName !== 'none') cardRef.current.style.setProperty('--ds-native-after-animation', animName);
            if (animDur) cardRef.current.style.setProperty('--ds-native-after-duration', animDur);
            if (animTiming) cardRef.current.style.setProperty('--ds-native-after-timing', animTiming);
            if (animIter) cardRef.current.style.setProperty('--ds-native-after-iteration', animIter);
          }
        } catch (e) {
          logInfo("HOME", "injectNativeClasses: animation read failed", String(e));
        }
      }
      if (!map) return true;
      const artEl = cardRef.current?.querySelector('.ds-card-art');
      if (artEl) {
        if (map.nativeCardArt && !artEl.classList.contains(map.nativeCardArt)) artEl.classList.add(map.nativeCardArt);
        if (map.nativeCardArtOuter && !artEl.classList.contains(map.nativeCardArtOuter)) artEl.classList.add(map.nativeCardArtOuter);
        if (map.nativeCardArtPortrait && !featured && !artEl.classList.contains(map.nativeCardArtPortrait)) artEl.classList.add(map.nativeCardArtPortrait);
      }
      if (imgRef.current) {
        if (map.nativeCardImg && !imgRef.current.classList.contains(map.nativeCardImg)) imgRef.current.classList.add(map.nativeCardImg);
        if (map.nativeCardImgFade && !imgRef.current.classList.contains(map.nativeCardImgFade)) imgRef.current.classList.add(map.nativeCardImgFade);
      }
      try {
        if (!nativeSample && map.nativeCard) {
          const maybe = doc.querySelector(buildSelectorFromToken(map.nativeCard) ?? '');
          if (maybe) {
            const pa = getComputedStyle(maybe, '::after');
            const animName = (pa.animationName || '').split(',')[0] || '';
            if (animName && animName !== 'none' && cardRef.current) cardRef.current.style.setProperty('--ds-native-after-animation', animName);
          }
        }
      } catch (e) {
        logInfo("HOME", "injectNativeClasses: fallback animation read failed", String(e));
      }
      return true;
    }

    let attempts = 0;
    const intervals = [250, 500, 800, 1200, 2000];
    let timer: number | null = null;
    const tryInject = () => {
      attempts += 1;
      const ok = injectNativeClasses();
      if (!ok && attempts < intervals.length) {
        timer = window.setTimeout(tryInject, intervals[attempts - 1]);
      }
    };
    tryInject();
    return () => { if (timer) clearTimeout(timer); };
  }, []);

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
  }, [item.onMenuButton, activate]);

  // Enrichment: logo overlay over the art; icon prepended to the name/status;
  // description snippet rendered below the status row or below the logo.
  // Re-key the URL memos on the live overview asset stamp so user-replaced
  // artwork (logo / icon / capsule / hero) propagates without a plugin
  // reload — the dep flips when Steam bumps local_cache_version / *_filename
  // / icon_hash, dropping the stale ?c=<old> URL and adopting the new one.
  const assetKey = getAppAssetCacheKey(appid);
  const logoUrls = useMemo(() => (enableLogo && appid > 0 ? getLogoUrls(appid) : []), [enableLogo, appid, assetKey]);
  const iconUrls = useMemo(() => (enableIcon && appid > 0 ? getIconUrls(appid) : []), [enableIcon, appid, assetKey]);
  const [logoIdx, setLogoIdx] = useState(0);
  const [iconIdx, setIconIdx] = useState(0);
  // Warm the loopback / CDN URLs in the background so subsequent renders of
  // the same appid hit the in-memory blob cache (3-9 ms) instead of going
  // back to the network. `getHotCachedImageSrc` returns a blob URL ready to
  // feed directly into `<img src>`.
  useEffect(() => {
    for (const u of iconUrls) if (!getHotCachedImageSrc(u)) warmCacheBackground(u);
  }, [iconUrls]);
  useEffect(() => {
    for (const u of logoUrls) if (!getHotCachedImageSrc(u)) warmCacheBackground(u);
  }, [logoUrls]);
  const logoSrc = (logoUrls[logoIdx] ? (getHotCachedImageSrc(logoUrls[logoIdx]) || logoUrls[logoIdx]) : null);
  const iconSrc = (iconUrls[iconIdx] ? (getHotCachedImageSrc(iconUrls[iconIdx]) || iconUrls[iconIdx]) : null);
  // Description lands in the cache asynchronously after `preloadAppDescriptions`
  // kicks off `RequestDescriptionsData`. A useMemo over the cache would never
  // re-evaluate, so we poll the cache for a few seconds and stop once we have
  // the snippet (or the cache's own retry budget runs out).
  const [description, setDescription] = useState<string | null>(null);
  useEffect(() => {
    if (!enableDescription || appid <= 0 || previewMode) { setDescription(null); return; }
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
  }, [enableDescription, appid, previewMode]);

  const allUrls = useMemo(() => {
    const urls: string[] = [];
    if (featured && appid > 0) {
      for (const u of getLandscapeUrls(appid)) urls.push(u);
      if (item.heroUrl && !urls.includes(item.heroUrl)) urls.push(item.heroUrl);
    } else {
      if (appid > 0) {
        urls.push(`/customimages/${appid}p.png`);
        urls.push(`/customimages/${appid}p.jpg`);
      }
      if (item.portraitUrl && !urls.includes(item.portraitUrl)) urls.push(item.portraitUrl);
      if (item.heroUrl && !urls.includes(item.heroUrl)) urls.push(item.heroUrl);
      if (appid > 0) {
        for (const u of getPortraitUrls(appid)) {
          if (!urls.includes(u)) urls.push(u);
        }
      }
    }
    return urls;
  }, [item.portraitUrl, item.heroUrl, appid, featured, assetKey]);

  // Track the *original* (non-blob) URL for each fallback step. Used by
  // onImgError so we always advance through the original URL chain even
  // when the current src is a cached blob URL.
  const currentOriginalUrl = useRef<string>("");

  // Walk the fallback chain and start at the first hot-cached URL so
  // remounts skip the 404 → next-URL cycle.
  const { initialSrc, initialOriginal, startIdx } = useMemo(() => {
    if (!allUrls.length) return { initialSrc: "", initialOriginal: "", startIdx: 0 };
    for (let i = 0; i < allUrls.length; i++) {
      try {
        const cached = getHotCachedImageSrc(allUrls[i]);
        if (cached) return { initialSrc: cached, initialOriginal: allUrls[i], startIdx: i };
      } catch {}
    }
    return { initialSrc: allUrls[0], initialOriginal: allUrls[0], startIdx: 0 };
  }, [allUrls]);

  useEffect(() => {
    fallbackIdx.current = startIdx;
    setImgFailed(false);
    setImgLoaded(false);
    currentOriginalUrl.current = initialOriginal;
    // Cache miss path — warm the FIRST CACHEABLE URL (typically the
    // CDN one). Warming `initialOriginal` was usually a no-op because
    // it's the local /customimages/ entry that cacheable() rejects,
    // so the persistent cache never populated and every reboot
    // re-downloaded every cover from the CDN.
    if (initialSrc === initialOriginal) {
      const warmTarget = firstCacheableUrl(allUrls);
      if (warmTarget) {
        try { warmCacheBackground(warmTarget); } catch {}
      }
    }
  }, [allUrls, startIdx, initialSrc, initialOriginal]);

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
  }, [allUrls]);

  const onImgLoad = useCallback(() => {
    setImgLoaded(true);
    // Persist successfully-loaded URL so the next visit is a hot hit.
    // warmCacheBackground dedupes if already cached / in-flight.
    if (currentOriginalUrl.current) warmCacheBackground(currentOriginalUrl.current);
  }, []);

  const firstUrl = initialSrc;

  const compat = item.deckCompatCategory ?? 0;
  const playtime = formatPlaytime(item.playtimeMinutes);

  const isNonSteam = item.isSteam === false;
  const suppressCompat = hideCompatIcons || (hideNonSteamBadge && isNonSteam);
  const compatClass = suppressCompat ? "" :
    compat === 3 ? "ds-compat ds-compat-verified"
    : compat === 2 ? "ds-compat ds-compat-playable"
    : compat === 1 ? "ds-compat ds-compat-unsupported"
    : "";
  const showNewBadge = !hideNewBadge && item.isNew === true;
  const discount = item.discountPercent;
  const showDiscountBadge = !hideDiscountBadge && typeof discount === 'number' && discount > 0;
  const hasBadge = showNewBadge || showDiscountBadge;

  // Badge: inline render only here. A single global BadgeFocusOverlay
  // (mounted by HomeInject) draws the on-focus badge above the focus
  // ring by reading data-isnew / data-discount from the focused card.

  // Placeholder fallback must be returned AFTER all hooks above so the
  // hook count stays stable across renders (React error #300 otherwise).
  if (imgFailed || !firstUrl) {
    return <PlaceholderCard
      item={item}
      cardW={cardW}
      cardH={cardH}
      artH={artH}
      featured={featured}
      previewMode={previewMode}
      removableSet={removableSet}
      onRemoveCard={onRemoveCard}
      hiddenSet={hiddenSet}
      onHideCard={onHideCard}
    />;
  }

  return (
    <Focusable
      ref={cardRef}
      className={`ds-card${featured ? ' ds-card--featured' : ''}${nativeCardClass ? ` ${nativeCardClass}` : ''}${hideCompatIcons ? ' ds-card--hide-compat' : ''}${hideNonSteamBadge ? ' ds-card--hide-non-steam-badge' : ''}`}
      focusClassName="gpfocus"
      role="listitem"
      onActivate={activate}
      onOKButton={activate}
      // Menu / Options button stays bound for EVERY real card (anything with
      // an onMenuButton supplied by the parent) — `recently added` /
      // wishlist / store shelves rely on it to surface Properties /
      // View store / DS submenu actions. Only View (below) is gated on
      // library presence since RunGame has no meaningful target for
      // non-library cards.
      onMenuButton={item.onMenuButton}
      onMenuActionDescription={!previewMode && item.onMenuButton ? i18n.t('card_options') : undefined}
      onContextMenu={item.onMenuButton}
      onButtonDown={previewMode ? undefined : buttonDownHandler}
      actionDescriptionMap={buildActionDescriptionMap({
        previewMode, appid, isLibraryGame, quickLaunchLabel,
        removable: !!(appid && removableSet?.has(appid) && onRemoveCard),
        hideable: !!(appid && onHideCard),
        hiddenNow: !!(appid && hiddenSet?.has(appid)),
      })}
      data-appid={appid || undefined}
      data-shelfid={item.shelfId || undefined}
      data-name={item.name || undefined}
      data-isnew={showNewBadge ? 'true' : undefined}
      data-discount={showDiscountBadge ? String(discount) : undefined}
      data-ds-card-index={cardIndex !== undefined ? String(cardIndex) : undefined}
      style={{
        position: "relative",
        width: cssW,
        minWidth: cssW,
        height: cssH,
        flexShrink: 0,
        padding: 0,
        margin: 0,
        background: "transparent",
        cursor: "pointer",
        overflow: "visible",
        ["--ds-card-art-h" as string]: cssArtH,
        // Per-card height/width ratio used by the TiltedHome compat CSS to
        // compute the exact zoom scale that covers the skewed parallelogram
        // — featured (landscape) and portrait cards need different scale
        // factors. Reflects the live rendered dimensions, so any screen-size
        // or theme-driven dim change automatically reaches the calc().
        ["--ds-card-h-w-ratio" as string]: featuredW > 0 ? (cardH / featuredW).toFixed(4) : "1.5",
      }}
    >
      {hasBadge && (
        <div
          className="ds-card-badge-host ds-card-badge-host--inline"
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: -2,
            left: 0,
            right: 0,
            height: 24,
            pointerEvents: 'none',
            zIndex: 50,
          }}
        >
          {showDiscountBadge && (
            <div className="ds-new-badge-band">
              <div className="ds-new-badge" style={{ background: '#2a7f2a' }}>
                {t('badge_discount', { count: discount }) ?? `${discount}% off`}
              </div>
            </div>
          )}
          {showNewBadge && !showDiscountBadge && (
            <div className="ds-new-badge-band">
              <div className="ds-new-badge">{t('badge_new')}</div>
            </div>
          )}
        </div>
      )}
      {/* Transform-target div — mirrors native card structure where
          theme CSS targets `_1HIFNGSxh4-jOhPiDynR4C > div:first-child`
          (TiltedHome's perspective + rotateY, ArtHero modules, etc).
          The Focusable wrapper above wears the nativeCardWrapper class
          via resolveNativeCardClass, so themes that walk
          "wrapper > div" land HERE without us replicating their CSS.
          Inline `height: cssArtH` matches native's inline-styled
          first-child div (native: `style="height: 201px;"`) so the
          tilt pivot + perspective frame match the native fan exactly. */}
      <div style={{ height: cssArtH, position: 'relative' }}>
        <div
          className="ds-card-art"
          style={{
            background: "var(--ds-card-bg, rgba(50, 50, 55, 0.55))",
            overflow: "hidden",
          }}
        >
          <img
            ref={(el) => {
              imgRef.current = el;
              // Eager-load detection: if the browser already has the
              // image decoded (hot blob URL, HTTP-cache hit), the
              // refCallback fires AFTER React has assigned `src` and
              // `el.complete + el.naturalWidth > 0` is true the same
              // tick. Mark loaded synchronously so cached images skip
              // the opacity-gate flash and never need a `onLoad` round
              // trip. Cold loads stay gated (no broken-icon flash) and
              // flip via the onLoad handler below.
              if (el && el.complete && (el.naturalWidth || 0) > 0 && !imgLoaded) {
                setImgLoaded(true);
              }
            }}
            src={firstUrl}
            alt={item.name}
            onError={onImgError}
            onLoad={onImgLoad}
            decoding="async"
            // opacity-gated again — `onError` swaps src through the
            // fallback chain (/customimages/* → CDN), and each failing
            // URL would otherwise briefly render the browser's broken-
            // image glyph before the next fallback kicks in. The gate
            // hides it; the ref callback above eliminates the visible
            // wait for cached images so this is "instant for cached,
            // glyph-free for cold".
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: imgLoaded ? 1 : 0 }}
            loading="eager"
            fetchPriority="high"
          />
          <div className={`ds-card-shimmer${imgLoaded ? ' ds-card-shimmer--loaded' : ''}`} aria-hidden="true" />
          {compatClass && (
            <div className={compatClass}>
              {deckLogoSvg}
              {compat === 3 ? checkmarkSvg : compat === 2 ? infoCircleSvg : xCircleSvg}
            </div>
          )}
        </div>
      </div>
      <div
        className={`ds-card-label${hideStatusLine ? ' ds-card-label--compact' : ''}`}
        style={{
          position: "absolute",
          top: cssArtH,
          left: 0,
          width: `calc(${cssW} + 20px)`,
          paddingTop: 10,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "row",
          alignItems: iconVerticalAlign === 'center' ? 'center' : iconVerticalAlign === 'bottom' ? 'flex-end' : 'flex-start',
          gap: 6,
        }}
      >
        {enableIcon && iconSrc && (() => {
          // Icon only renders when there's *some* text below the card —
          // name, status row, or description. Sits to the left of the text
          // column, vertically centred.
          const hasName = !hideGameName;
          const hasStatus = !hideStatusLine && isLibraryGame;
          const hasDesc = enableDescription && !!description && !(enableLogo && descriptionBelowLogo);
          if (!(hasName || hasStatus || hasDesc)) return null;
          return (
            <img
              className="ds-card-icon"
              src={iconSrc}
              alt=""
              aria-hidden="true"
              onError={() => setIconIdx((i) => i + 1)}
            />
          );
        })()}
        <div data-ds-playtime-position={playtimePosition} style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '1 1 auto', position: 'relative' }}>
        {!hideGameName && (
          <div className="ds-card-label-name" style={{ textAlign: gameNamePosition, width: '100%' }}>
            {item.name}
          </div>
        )}
        {/* Non-library items (wishlist / store / friends-playing non-owned)
            have no meaningful install state — Steam doesn't track them, so
            "Not installed" / install glyph would be misleading. Hidden per
            card so the rule fires only on the actually-non-owned ones in a
            mixed composite shelf; owned cards in the same row keep their
            indicator + status text. */}
        {!hideStatusLine && isLibraryGame && (() => {
          const hasUpdate = item.updatePending === true;
          const isInstalled = item.isInstalled === true;
          const hasPlaytime = !!playtime && item.playtimeMinutes && item.playtimeMinutes > 0;

          if (!isInstalled && !hasPlaytime) {
            return (
              <div className="ds-card-status">
                {!hideInstallIndicator && downloadIcon}
                <span>{t('status_not_installed')}</span>
              </div>
            );
          }
          if (!isInstalled && hasPlaytime) {
            return (
              <div className="ds-card-status">
                {!hideInstallIndicator && downloadIcon}
                <span>{t('playtime_label', { time: playtime })}</span>
              </div>
            );
          }
          if (isInstalled && hasUpdate) {
            return (
              <div className="ds-card-status">
                {!hideInstallIndicator && updateIcon}
                <span>{hasPlaytime ? t('playtime_label', { time: playtime }) : t('status_no_playtime')}</span>
              </div>
            );
          }
          if (isInstalled && !hasPlaytime) {
            return (
              <div className="ds-card-status">
                {!hideInstallIndicator && playIcon}
                <span>{t('status_no_playtime')}</span>
              </div>
            );
          }
          if (isInstalled && hasPlaytime) {
            return (
              <div className="ds-card-status">
                {!hideInstallIndicator && playIcon}
                <span>{t('playtime_label', { time: playtime })}</span>
              </div>
            );
          }
          return null;
        })()}
        {/* Description snippet — rendered below the install/playtime row.
            When `descriptionBelowLogo` is on AND the logo is rendered,
            the description is moved into the logo overlay instead so it
            sits under the title art. */}
        {enableDescription && description && !(enableLogo && descriptionBelowLogo) && (
          <div className="ds-card-description" data-ds-position={descriptionPosition}>{description}</div>
        )}
        </div>
      </div>
      {/* Logo overlay — composited over the art (top area). When active,
          the in-label game name is suppressed (`!hideGameName && !enableLogo`
          above). With `descriptionBelowLogo` and `enableDescription`, the
          description sits directly below the logo. */}
      {/* Logo + (optionally) description below it are rendered ONCE per
          shelf in `PerShelfHero` — tied to the currently focused card —
          not per card. See `PerShelfHero.tsx` for the focused-card logo
          + description render path. */}
      {/* Editor picker markers — siblings of the art / label, anchored
          to the Focusable's positioned wrapper. The colored ring uses
          the SAME box-shadow shape as the native focus ring (see
          shelfStyles.ts: `box-shadow: 0 0 0 2px ...`) so it sits at
          the OUTSIDE edge of the card — matches the focus position
          exactly across every preview tab. Dim layer + corner icon
          stay inside the art for hidden-state readability. */}
      {item.selectionMark && (
        <div
          aria-hidden='true'
          style={{
            position: 'absolute',
            // Confine to the art rectangle (top:0 + cssArtH) — the
            // label area sits at top:100% with absolute positioning
            // outside this overlay, so it stays unobscured.
            top: 0, left: 0, right: 0, height: cssArtH,
            pointerEvents: 'none',
            borderRadius: 'var(--ds-card-radius, 0)',
            // Outset ring at the SAME offset Steam's focus ring uses
            // — 2px outside the card edge. The colored ring lives on
            // this container's box-shadow so themes (Round / Outrun)
            // keep the corner curve and the line never crosses into
            // the art interior.
            boxShadow:
              item.selectionMark === 'grabbed'
                ? '0 0 0 2px #ffd54f, 0 0 0 5px rgba(255, 213, 79, 0.35)'
                : item.selectionMark === 'hidden'
                  ? '0 0 0 2px #ef5350'
                  : item.selectionMark === 'added'
                    ? '0 0 0 2px #2196f3'
                    : '0 0 0 2px #4caf50',
            zIndex: 4,
          }}
        >
          {item.selectionMark === 'hidden' && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', borderRadius: 'inherit' }} />
          )}
          {item.selectionMark === 'highlight' && (
            // Match the legacy `CheckIcon` exactly (14px, viewBox 24x24,
            // stroke #4caf50 width 2.5, polyline `20 6 9 17 4 12`).
            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#4caf50' strokeWidth='2.5' strokeLinecap='round' strokeLinejoin='round' style={{ position: 'absolute', top: 4, left: 4 }}>
              <polyline points='20 6 9 17 4 12' />
            </svg>
          )}
          {item.selectionMark === 'hidden' && (
            // Mirror the CheckIcon style: line-only X (no filled
            // circle). Same 14px / viewBox 24x24 / strokeWidth 2.5
            // grammar so check + X read as a coherent pair.
            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#f44336' strokeWidth='2.5' strokeLinecap='round' style={{ position: 'absolute', top: 4, left: 4 }}>
              <line x1='18' y1='6' x2='6' y2='18' />
              <line x1='6' y1='6' x2='18' y2='18' />
            </svg>
          )}
          {item.selectionMark === 'added' && (
            // Same line-art grammar as check / X — 14px, viewBox 24x24,
            // strokeWidth 2.5. Blue (#2196f3) marks "manually added to
            // shelf" (in manualOrder but not in the resolved source).
            <svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#2196f3' strokeWidth='2.5' strokeLinecap='round' style={{ position: 'absolute', top: 4, left: 4 }}>
              <line x1='12' y1='5' x2='12' y2='19' />
              <line x1='5' y1='12' x2='19' y2='12' />
            </svg>
          )}
        </div>
      )}
    </Focusable>
  );
}
