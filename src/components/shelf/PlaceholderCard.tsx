import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Focusable, GamepadButton } from "../../runtime/host/decky";
import { useTranslation } from "react-i18next";
import i18n from "../../i18n";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { type DeckRowItem, CARD_W, CARD_ART_H } from "./types";
import { getCachedCardRadius } from "./shelfStyles";
import { resolveNativeCardClass, retryWithIntervals } from "./cardUtils";
import { toggleCardHighlight } from "./GameCard";

export function PlaceholderCard({
  item,
  cardW = CARD_W,
  cardH = CARD_ART_H,
  artH,
  featured = false,
  previewMode = false,
  removableSet,
  onRemoveCard,
  hiddenSet,
  onHideCard,
}: {
  item: DeckRowItem;
  cardW?: number;
  cardH?: number;
  artH?: number;
  featured?: boolean;
  previewMode?: boolean;
  removableSet?: Set<number>;
  onRemoveCard?: (appid: number) => void;
  hiddenSet?: Set<number>;
  onHideCard?: (appid: number) => void;
}) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [nativeCardClass, setNativeCardClass] = useState('');
  const appid = item.appid ?? 0;

  useEffect(() => {
    return retryWithIntervals(() => {
      const cls = resolveNativeCardClass(getPreferredSteamDocument());
      if (cls === null) return false;
      setNativeCardClass(cls);
      return true;
    }, [250, 500, 800, 1200]);
  }, []);

  /* View (SELECT) binding — mirrors GameCard. Needed here because cards
     without library art fall through to PlaceholderCard, and the user
     still expects the "Atualizar / Retomar / Jogar / Instalar" hint +
     action on the View button for owned-library items. */
  const isLibraryGame = useMemo(() => {
    if (previewMode || !appid) return false;
    try { return !!(globalThis as any).appStore?.GetAppOverviewByAppID?.(appid); }
    catch { return false; }
  }, [appid, previewMode]);
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
      const RUNNING = ds === 1 || ds === 4;
      const UPDATE = ds === 2 || ds === 5 || ds === 7 || ds === 8 || ds === 12 || ds === 13 || ds === 19;
      if (RUNNING) return { label: i18n.t('menu_resume'), action: 'raise' };
      if (UPDATE) return { label: i18n.t('menu_update'), action: 'resume_update' };
      return { label: i18n.t('menu_play'), action: 'run' };
    } catch { return { label: undefined, action: 'run' }; }
  }, [appid, previewMode]);
  /* Mirror GameCard: open the native menu and click its first item —
     same dispatch as the user picking that item manually. Avoids the
     state-specific Steam APIs (RunGame / RaiseWindowForGame /
     ResumeAppUpdate) which behave inconsistently on the Deck. */
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
  }, [appid, previewMode, item.onMenuButton]);
  const buttonDownHandler = useCallback((evt: any) => {
    if (previewMode || !appid) return;
    try {
      if (evt?.detail?.button === GamepadButton.SELECT) quickLaunch();
    } catch {}
  }, [appid, previewMode, quickLaunch]);

  const cachedCardRadius = getCachedCardRadius();
  // Mirror GameCard: size off the per-shelf --ds-eff-* vars so a native-dims
  // change reflows through CSS with no re-render; the prop is the fallback.
  const cssW = `var(${featured ? "--ds-eff-feat-w" : "--ds-eff-card-w"}, ${cardW}px)`;
  const cssH = `var(${featured ? "--ds-eff-feat-h" : "--ds-eff-card-h"}, ${cardH}px)`;
  const cssArtH = `var(${featured ? "--ds-eff-feat-art-h" : "--ds-eff-card-art-h"}, ${typeof artH === "number" ? artH : cardH}px)`;
  const discount = item.discountPercent;
  const showDiscountBadge = typeof discount === 'number' && discount > 0;
  const showNewBadge = item.isNew === true && !showDiscountBadge;

  return (
    <Focusable
      ref={cardRef}
      className={`ds-card${featured ? ' ds-card--featured' : ''}${nativeCardClass ? ` ${nativeCardClass}` : ''}`}
      focusClassName="gpfocus"
      role="listitem"
      onActivate={item.onToggleSelection ?? item.onActivate}
      onOKButton={item.onToggleSelection ?? item.onActivate}
      onMenuButton={item.onMenuButton}
      onMenuActionDescription={!previewMode && item.onMenuButton ? i18n.t('card_options') : undefined}
      onContextMenu={item.onMenuButton}
      // Y → highlight toggle. Same gating as GameCard: only outside
      // previewMode (the modal owns highlight via its picker) and only
      // when the card has a real appid.
      onOptionsActionDescription={!previewMode && appid
        ? i18n.t('card_highlight_toggle')
        : undefined}
      onOptionsButton={!previewMode && appid ? () => { try { toggleCardHighlight(item.shelfId, appid); } catch {} } : undefined}
      // X → remove (for menu-added cards) or hide (otherwise). Same
      // context-aware shape as GameCard, including the short
      // home-only labels via `card_remove` / `card_hide`.
      onSecondaryActionDescription={
        appid && removableSet?.has(appid) && onRemoveCard
          ? i18n.t(previewMode ? 'menu_remove_from_shelf' : 'card_remove')
          : appid && onHideCard
            ? i18n.t(previewMode
                ? (hiddenSet?.has(appid) ? 'show_in_shelf' : 'hide_from_shelf')
                : (hiddenSet?.has(appid) ? 'card_show' : 'card_hide'))
            : undefined}
      onSecondaryButton={
        appid && removableSet?.has(appid) && onRemoveCard
          ? () => { try { onRemoveCard(appid); } catch {} }
          : appid && onHideCard
            ? () => { try { onHideCard(appid); } catch {} }
            : undefined}
      onButtonDown={isLibraryGame ? buttonDownHandler : undefined}
      actionDescriptionMap={isLibraryGame && cardState.label ? { [GamepadButton.SELECT]: cardState.label } : undefined}
      data-appid={item.appid || undefined}
      data-shelfid={item.shelfId || undefined}
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
        // Pass artH through the same `--ds-card-art-h` variable GameCard uses,
        // so the art region fills the right height in the modal preview (where
        // cardH includes the label strip and artH is shorter).
        ["--ds-card-art-h" as string]: cssArtH,
      }}
    >
      <div
        className="ds-card-art"
        style={{
          overflow: "hidden",
          background: "linear-gradient(313deg, rgba(51,51,51,0.667), rgba(85,85,85,0.667))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: featured ? 16 : 6,
          boxSizing: "border-box",
          borderRadius: cachedCardRadius,
        }}
      >
        <span style={{
          fontSize: featured ? 14 : 11,
          opacity: 0.5,
          textAlign: "center",
          wordBreak: "break-word",
          lineHeight: 1.3,
        }}>
          {item.name}
        </span>
        {showDiscountBadge && (
          <div className="ds-new-badge-band">
            <div className="ds-new-badge" style={{ background: '#2a7f2a' }}>
              {t('badge_discount', { count: discount }) ?? `${discount}% off`}
            </div>
          </div>
        )}
        {showNewBadge && (
          <div className="ds-new-badge-band">
            <div className="ds-new-badge">{t('badge_new')}</div>
          </div>
        )}
      </div>
    </Focusable>
  );
}
