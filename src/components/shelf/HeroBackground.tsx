import { useEffect, useState, useRef } from "react";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { logInfo } from "../../runtime/logger";
import { isArtHeroActive } from "../../core/cssLoaderDetect";

function getHeroUrls(appid: number): string[] {
  return [
    `/customimages/${appid}_hero.png`,
    `/customimages/${appid}_hero.jpg`,
    `/assets/${appid}/library_hero.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/library_hero.jpg`,
    `/assets/${appid}/header.jpg`,
    `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
  ];
}

// Native hero structure (CDP on SteamOS 3.8):
//   IMG  — filter: grayscale(1) contrast(1), 0.3s fade-in, object-fit: cover
//   DIV  — 25s ease alternate zoom animation
//   DIV  — mask-image: radial-gradient(75% 83% at 50% 18%, black 0%, rgba(0,0,0,0.6) 76%, transparent 100%)
//   DIV  — same mask-image (double masking)
//   DIV  — padding-top: 54px, Panel Focusable
//
// The fade is via radial-gradient mask-image. The bottom fade comes from
// the hero sitting inside a container with black background (rgb(0,0,0)).
// Since our mount has transparent background, we use a linear-gradient
// overlay at the bottom to replicate the same visual result.

type NativeHeroClasses = {
  imgClass: string;
  zoomContainerClass: string;
  wrapperClasses: string[];
};

export function HeroBackground({ mountEl }: { mountEl: HTMLElement }) {
  // The dual-hero risk (ours stacking on top of an ArtHero-family theme's
  // own hero) is already handled at the parent: HomeInject only renders
  // this component when `!replaceInjecting`. In that path the native
  // recents element is `visibility: hidden, height: 0`, so ArtHero's CSS
  // (which targets the native heroInner) isn't actually painting anything.
  // Our hero element here is the only visible hero; via the discovered
  // native classes below, ArtHero's mask-image fade still applies to OURS.
  // Two stacked image slots so the new hero can fade IN while the old one
  // fades OUT — matches the native Steam recents hero cross-fade. On each
  // focus change we assign the new URL to the currently-inactive slot and
  // flip `activeSlot` so only one layer is at opacity 1 at any time.
  const [slotA, setSlotA] = useState<string | null>(null);
  const [slotB, setSlotB] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<'A' | 'B'>('A');
  const [visible, setVisible] = useState(false);
  const [nativeClasses, setNativeClasses] = useState<NativeHeroClasses | null>(null);
  const [heroHeight, setHeroHeight] = useState(374);
  const fallbackIdx = useRef(0);
  const currentAppid = useRef(0);
  const allUrls = useRef<string[]>([]);
  const activeSlotRef = useRef<'A' | 'B'>('A');
  useEffect(() => { activeSlotRef.current = activeSlot }, [activeSlot]);

  // Themes like ArtHero overlay the focused game's info on top of the hero
  // (where the native recents component renders that info). Our shelf
  // doesn't carry the native game-info element, so we mirror it here by
  // CLONING the focused card's own `.ds-card-label` DOM — same classes,
  // same formatting (status icon + name + playtime), just repositioned
  // above the row. The in-card label is hidden in the promoted shelf via
  // CSS to avoid duplication. Detected once on mount via the structural
  // signature; stays out entirely when no theme that needs it is active.
  const [needsHeroLabel, setNeedsHeroLabel] = useState(() => {
    try { return isArtHeroActive(); } catch { return false; }
  });
  const [labelHtml, setLabelHtml] = useState<string | null>(null);

  // Re-evaluate when CSS Loader themes are added/removed at runtime — the
  // user can toggle ArtHero on/off without reloading the plugin, so the
  // initial mount value is just a starting point. CSS Loader appends and
  // removes <style class="css-loader-style"> tags directly in the Big
  // Picture document's <head> (verified via CDP). The Big Picture doc is
  // a different document than SharedJSContext where this React tree
  // lives, so we MUST observe via getPreferredSteamDocument() — using
  // the bare `document.head` watches the wrong tree and the observer
  // never fires.
  useEffect(() => {
    const recheck = () => {
      try { setNeedsHeroLabel(isArtHeroActive()); } catch {}
    };
    const doc = getPreferredSteamDocument();
    const head = doc?.head ?? doc?.documentElement;
    if (!head) return;
    const obs = new MutationObserver(recheck);
    obs.observe(head, { childList: true });
    return () => obs.disconnect();
  }, []);

  // When a hero-label theme is active, mark .deck-shelves-root so the
  // stylesheet can hide the in-card label inside the promoted shelf —
  // otherwise the focused card would render its label twice (once below
  // the art, once above via this overlay).
  useEffect(() => {
    if (!needsHeroLabel) return;
    const root = mountEl.querySelector('.deck-shelves-root') as HTMLElement | null;
    if (!root) return;
    root.setAttribute('data-ds-hero-label', 'true');
    return () => { root.removeAttribute('data-ds-hero-label'); };
  }, [needsHeroLabel, mountEl]);

  // Track the promoted shelf's row height so the label sits exactly above
  // the cards even when the row resizes (matchNativeSize discovery, smart
  // shelf changes, focused-card scale up). The label uses `position:
  // fixed` so `bottom` is relative to the viewport — and the row sits at
  // the viewport bottom (the shelf takes calc(100vh - 56px) and the row
  // is flexed to the bottom). `bottom: rowHeight + gap` puts the label
  // exactly `gap` pixels above the row's top edge.
  const [labelBottomPx, setLabelBottomPx] = useState(320);
  // Track the focused card's left edge so the label stays horizontally
  // aligned with it as the row scrolls. Native ArtHero behaves the same:
  // the label sits at the left edge of the focused tile, not at a fixed
  // viewport offset. Default 40 = the original hardcoded margin until we
  // know the real position.
  const [labelLeftPx, setLabelLeftPx] = useState(40);
  useEffect(() => {
    if (!needsHeroLabel) return;
    let observedRow: HTMLElement | null = null;
    const ro = new ResizeObserver(() => measure());
    const measure = () => {
      const row = mountEl.querySelector('.ds-shelf[data-ds-recents-slot="true"] .ds-row-scroll') as HTMLElement | null;
      if (!row) return;
      if (row !== observedRow) {
        if (observedRow) ro.unobserve(observedRow);
        ro.observe(row);
        observedRow = row;
      }
      const h = row.getBoundingClientRect().height;
      if (h > 0) setLabelBottomPx(Math.round(h) + 10);
    };
    measure();
    // Re-measure when the promoted shelf appears/disappears or its
    // descendants restructure (focused card flips to featured, etc.).
    const mo = new MutationObserver(measure);
    mo.observe(mountEl, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-ds-recents-slot', 'class', 'style'] });
    // The row's horizontal scroll moves the focused card — mirror it on the
    // label so the alignment keeps up with `centeredScrollLeft` animations.
    const onRowScroll = () => {
      const focusedCard = mountEl.querySelector('.ds-shelf[data-ds-recents-slot="true"] .ds-card.gpfocus, .ds-shelf[data-ds-recents-slot="true"] .ds-card:focus') as HTMLElement | null;
      if (!focusedCard) return;
      const cardLeft = focusedCard.getBoundingClientRect().left;
      setLabelLeftPx(Math.max(0, Math.round(cardLeft)));
    };
    const row = mountEl.querySelector('.ds-shelf[data-ds-recents-slot="true"] .ds-row-scroll') as HTMLElement | null;
    if (row) row.addEventListener('scroll', onRowScroll, { passive: true });
    return () => {
      ro.disconnect();
      mo.disconnect();
      if (row) row.removeEventListener('scroll', onRowScroll);
    };
  }, [needsHeroLabel, mountEl]);

  // Discover native hero classes from the recents section
  useEffect(() => {
    const discover = () => {
      const doc = getPreferredSteamDocument();
      if (!doc) return;
      const prev = mountEl.previousElementSibling as HTMLElement | null;
      if (!prev) return;
      const imgs = Array.from(prev.querySelectorAll('img'));
      for (const img of imgs) {
        const classes = Array.from(img.classList);
        const r = img.getBoundingClientRect();
        if ((r.width > 400 && r.height > 200) || classes.length >= 4) {
          const imgClass = Array.from(img.classList).join(' ');
          const zoomContainer = img.parentElement;
          if (!zoomContainer) continue;
          const zoomContainerClass = Array.from(zoomContainer.classList).join(' ');
          const wrapperClasses: string[] = [];
          let el = zoomContainer.parentElement;
          for (let i = 0; i < 4 && el && el !== prev; i++) {
            if (el.classList.contains('Focusable') || el.classList.contains('Panel')) break;
            wrapperClasses.push(Array.from(el.classList).join(' '));
            el = el.parentElement;
          }
          setNativeClasses({ imgClass, zoomContainerClass, wrapperClasses });
          logInfo("HOME", "HeroBackground: native classes discovered", {
            imgClass: imgClass.substring(0, 40),
            zoomContainerClass: zoomContainerClass.substring(0, 40),
            wrappers: wrapperClasses.length,
          });
          return;
        }
      }
    };
    discover();
    const t = setTimeout(discover, 2000);
    return () => clearTimeout(t);
  }, [mountEl]);

  // Clamp hero height to the first shelf's actual height so the art does not
  // bleed into the second shelf row when smart shelves are shorter than the
  // native recents section (which was used as the 374px baseline).
  // ResizeObserver is required because shelf height can change via *style*
  // (e.g. ArtHero opting in/out toggles `height: calc(100vh-56px)` ↔ `auto`
  // with no DOM mutation) — a MutationObserver alone would miss it and the
  // hero would stay stuck at the old height.
  useEffect(() => {
    let observedShelf: HTMLElement | null = null;
    const measure = () => {
      const firstShelf = mountEl.querySelector('.ds-shelf') as HTMLElement | null;
      if (!firstShelf) return;
      if (firstShelf !== observedShelf) {
        if (observedShelf) ro.unobserve(observedShelf);
        ro.observe(firstShelf);
        observedShelf = firstShelf;
      }
      const h = firstShelf.getBoundingClientRect().height;
      if (h > 80) setHeroHeight(Math.round(h));
    };
    const ro = new ResizeObserver(measure);
    measure();
    // MutationObserver catches the shelf swapping (e.g. promotion changes,
    // smart-shelf flip) so we can re-target the ResizeObserver.
    const mo = new MutationObserver(measure);
    mo.observe(mountEl, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [mountEl]);

  useEffect(() => {
    const updateHero = (e?: Event) => {
      // Prefer the focusin event's target — it's the card that just gained
      // focus, before any class transitions complete. Falls back to a DOM
      // query when called via the MutationObserver (no event payload).
      let focused: HTMLElement | null = null;
      if (e && e.target instanceof HTMLElement) {
        focused = e.target.closest('.ds-card[data-appid]') as HTMLElement | null;
      }
      if (!focused) {
        focused = mountEl.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      }
      if (!focused) return;
      // Hero art mirrors:
      //   - any shelf with `data-ds-hero-enabled="true"` (per-shelf opt-in
      //     via the edit modal Visual tab — regular + smart shelves)
      //   - OR the recents-slot promoted shelf when the global
      //     `shelfHeroBackground` is on
      // When the focused card lives in a shelf carrying either marker, we
      // update the hero overlay; otherwise we leave the previous hero in
      // place (matching native Steam's "sticky last hero" behaviour).
      // The global hero handles only the recents-slot promoted shelf.
      // Per-shelf hero (heroEnabled=true) is handled by PerShelfHero
      // rendered inside each DeckRow — skip those here to avoid doubling.
      const parentShelf = focused.closest('.ds-shelf') as HTMLElement | null;
      const isRecentsSlot = !!parentShelf && parentShelf.getAttribute('data-ds-recents-slot') === 'true';
      const isPerShelfHero = !!parentShelf && parentShelf.getAttribute('data-ds-hero-enabled') === 'true';
      if (isPerShelfHero) return;
      if (!isRecentsSlot) {
        // Fallback: when no shelf is promoted yet, use the first DS shelf
        // (legacy single-hero path for shelfHeroBackground global toggle).
        const fallbackShelf = mountEl.querySelector('.ds-shelf') as HTMLElement | null;
        if (fallbackShelf && !fallbackShelf.contains(focused)) return;
      }
      const appid = Number(focused.getAttribute('data-appid') ?? 0);
      if (appid <= 0) return;
      if (appid !== currentAppid.current) {
        currentAppid.current = appid;
        const urls = getHeroUrls(appid);
        allUrls.current = urls;
        fallbackIdx.current = 0;
        // Assign the new URL to the INACTIVE slot, then flip active so the
        // old layer fades out while the new layer fades in. One transition
        // span handles the cross-fade — same pattern Steam uses natively.
        const nextSlot: 'A' | 'B' = activeSlotRef.current === 'A' ? 'B' : 'A';
        if (nextSlot === 'A') setSlotA(urls[0] ?? null);
        else setSlotB(urls[0] ?? null);
        setActiveSlot(nextSlot);
        setVisible(true);
        // Clone the focused card's full label DOM (.ds-card-label with all
        // inner classes — name, status icon, playtime) so the hero overlay
        // mirrors it byte-for-byte. Same classes = same formatting; the
        // overlay positions it above the row instead of below.
        if (needsHeroLabel) {
          const labelEl = focused.querySelector('.ds-card-label') as HTMLElement | null;
          setLabelHtml(labelEl ? labelEl.outerHTML : null);
          // Align the hero label horizontally with the focused card's
          // left edge — matches native ArtHero, where the label tracks
          // the focused tile rather than sitting at a fixed viewport
          // offset. Floor to 0 so the label never gets pushed off the
          // viewport's left edge if the rect read returns negative
          // mid-animation. The rAF read defers to AFTER `centeredScrollLeft`
          // settles — the focusin event fires before Steam's smooth-scroll
          // animation completes, so reading rect.left synchronously yields a
          // stale x and the label visibly trails the card on wrap-around or
          // matchNative remeasures. The onRowScroll listener still tracks
          // mid-flight so the label keeps up frame-by-frame after the rAF.
          requestAnimationFrame(() => {
            try {
              setLabelLeftPx(Math.max(0, Math.round(focused.getBoundingClientRect().left)));
            } catch {}
          });
        }
      } else {
        setVisible(true);
      }
    };

    const observer = new MutationObserver(() => updateHero());
    observer.observe(mountEl, { subtree: true, attributes: true, attributeFilter: ['class'] });
    mountEl.addEventListener('focusin', updateHero);
    // Capture any already-focused card on mount or dep change. After back
    // navigation, Steam restores focus via BTakeFocus before React's useEffect
    // runs — the focusin event fires into the void. Calling updateHero() here
    // catches that case without waiting for the next user input.
    updateHero();
    // No focusout hide: native ArtHero keeps the last focused game's hero
    // visible until another card takes focus. During gamepad navigation
    // between rows, Steam can briefly emit focusout with relatedTarget=null
    // before the new card focuses — hiding the hero in that gap caused
    // intermittent disappearance of the hero art and label overlay.
    return () => {
      observer.disconnect();
      mountEl.removeEventListener('focusin', updateHero);
    };
    // `needsHeroLabel` is part of the deps so the closure inside `updateHero`
    // always sees its current value — without it, toggling ArtHero on after
    // mount keeps the captured `false` and the label branch never runs.
  }, [mountEl, needsHeroLabel]);

  // When `needsHeroLabel` flips ON, snapshot the currently focused card's
  // label immediately — otherwise the user would have to move focus once
  // for the next focusin to populate it. When it flips OFF, clear the
  // label so a stale clone doesn't briefly render before unmount.
  useEffect(() => {
    if (!needsHeroLabel) {
      setLabelHtml(null);
      return;
    }
    const focused = mountEl.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
    if (!focused) return;
    const inPromoted = !!focused.closest('.ds-shelf[data-ds-recents-slot="true"]');
    if (!inPromoted) return;
    const labelEl = focused.querySelector('.ds-card-label') as HTMLElement | null;
    setLabelHtml(labelEl ? labelEl.outerHTML : null);
    setLabelLeftPx(Math.max(0, Math.round(focused.getBoundingClientRect().left)));
  }, [needsHeroLabel, mountEl]);

  const onImgError = (slot: 'A' | 'B') => () => {
    fallbackIdx.current += 1;
    const next = allUrls.current[fallbackIdx.current];
    if (next) {
      if (slot === 'A') setSlotA(next); else setSlotB(next);
    } else {
      // No fallback left — hide this slot.
      setVisible(false);
    }
  };

  if (!slotA && !slotB) return null;

  // Build native-matching DOM structure for a single slot:
  // wrappers (with native classes → bring native CSS including mask) > zoom > img
  const wrappers = nativeClasses?.wrapperClasses ?? [];

  const buildLayer = (url: string | null, slot: 'A' | 'B') => {
    if (!url) return null;
    let inner: React.ReactNode = (
      <div
        className={nativeClasses?.zoomContainerClass || undefined}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <img
          className={nativeClasses?.imgClass || undefined}
          src={url}
          onError={onImgError(slot)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 50%",
            display: "block",
          }}
          loading="eager"
        />
      </div>
    );
    for (let i = wrappers.length - 1; i >= 0; i--) {
      inner = (
        <div
          className={wrappers[i] || undefined}
          style={{ position: "absolute", inset: 0, overflow: "visible" }}
        >
          {inner}
        </div>
      );
    }
    return inner;
  };

  const layerA = buildLayer(slotA, 'A');
  const layerB = buildLayer(slotB, 'B');

  // Extend 60px above (fills hidden recents gap) and 60px below (envelope effect
  // matching native hero which extended ~90px past the recents row bottom).
  const heroTop = -60;
  const heroH = heroHeight + 120;

  return (
    <div
      className="ds-hero-background"
      style={{
        position: "absolute",
        top: heroTop,
        left: 0,
        right: 0,
        height: heroH,
        overflow: "hidden",
        zIndex: -1,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83)",
        maskImage: "linear-gradient(rgb(0,0,0) 90%, rgba(0,0,0,0) calc(100% - 5px))",
        WebkitMaskImage: "linear-gradient(rgb(0,0,0) 90%, rgba(0,0,0,0) calc(100% - 5px))" as any,
      }}
    >
      {/* Solid background layer — fills behind the image so the native
          radial mask-image fades to the page background color instead of
          transparent. Only this div has the page bg, not the parent mount. */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "var(--ds-page-bg, rgb(0,0,0))",
        zIndex: -1,
      }} />
      {/* Two stacked image layers — only one is at opacity 1 at a time, the
          other fades in with a 0.5s transition. On focus change, the new
          URL is written into the inactive layer and `activeSlot` flips,
          producing a cross-fade between the old and new hero art. */}
      {layerA && (
        <div style={{
          position: "absolute", inset: 0, overflow: "visible",
          opacity: activeSlot === 'A' ? 1 : 0,
          transition: "opacity 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83)",
        }}>
          {layerA}
        </div>
      )}
      {layerB && (
        <div style={{
          position: "absolute", inset: 0, overflow: "visible",
          opacity: activeSlot === 'B' ? 1 : 0,
          transition: "opacity 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83)",
        }}>
          {layerB}
        </div>
      )}
      {/* Bottom fade — gradient from page bg to transparent at the top,
          ensuring a smooth transition at the bottom edge of the hero area.
          Uses var(--ds-page-bg) to follow the active theme color. */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "100%",
        background: "linear-gradient(to top, var(--ds-page-bg, rgb(0,0,0)) 0%, transparent 70%)",
        pointerEvents: "none",
        zIndex: 1,
      }} />
      {/* Game info overlay — clones the focused card's `.ds-card-label`
          DOM (all classes preserved) so the hero label is identical to
          the regular card label, only positioned above the row instead
          of below. The wrapper div carries `ds-promoted-hero-label`
          which the stylesheet uses to override the cloned label's own
          absolute positioning back to static. The in-card label is
          hidden via CSS on the promoted shelf so we don't render two
          copies of the same label. pointerEvents:none so it never
          intercepts focus. */}
      {needsHeroLabel && labelHtml && (
        <div
          className="ds-promoted-hero-label"
          style={{
            position: "fixed",
            left: labelLeftPx,
            bottom: labelBottomPx,
            pointerEvents: "none",
            zIndex: 2,
            opacity: visible ? 1 : 0,
            transition: "opacity 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83), left 0.2s ease, bottom 0.2s ease",
          }}
          dangerouslySetInnerHTML={{ __html: labelHtml }}
        />
      )}
    </div>
  );
}
