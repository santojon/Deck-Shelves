import { useEffect, useState, useRef } from "react";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { logInfo } from "../../runtime/logger";

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
  useEffect(() => {
    const measure = () => {
      const firstShelf = mountEl.querySelector('.ds-shelf') as HTMLElement | null;
      if (!firstShelf) return;
      const h = firstShelf.getBoundingClientRect().height;
      if (h > 80) setHeroHeight(Math.round(h));
    };
    measure();
    const obs = new MutationObserver(measure);
    obs.observe(mountEl, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [mountEl]);

  useEffect(() => {
    const updateHero = () => {
      const focused = mountEl.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      if (!focused) return;
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
      } else {
        setVisible(true);
      }
    };

    const observer = new MutationObserver(updateHero);
    observer.observe(mountEl, { subtree: true, attributes: true, attributeFilter: ['class'] });
    mountEl.addEventListener('focusin', updateHero);
    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !mountEl.contains(related)) setVisible(false);
    };
    mountEl.addEventListener('focusout', onFocusOut);
    return () => {
      observer.disconnect();
      mountEl.removeEventListener('focusin', updateHero);
      mountEl.removeEventListener('focusout', onFocusOut);
    };
  }, [mountEl]);

  const onImgError = (slot: 'A' | 'B') => () => {
    fallbackIdx.current += 1;
    const next = allUrls.current[fallbackIdx.current];
    if (next) {
      if (slot === 'A') setSlotA(next); else setSlotB(next);
    } else {
      // No fallback left — hide this slot. If the previous slot still holds
      // a valid image, flip back to it instead of going blank.
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
    </div>
  );
}
