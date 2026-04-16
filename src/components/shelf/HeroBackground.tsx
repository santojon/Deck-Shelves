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
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const prevHero = useRef<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [nativeClasses, setNativeClasses] = useState<NativeHeroClasses | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const fallbackIdx = useRef(0);
  const currentAppid = useRef(0);
  const allUrls = useRef<string[]>([]);

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

  useEffect(() => {
    const updateHero = () => {
      const firstShelf = mountEl.querySelector('.ds-shelf');
      if (!firstShelf) return;
      const focused = firstShelf.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      if (!focused) return;
      const appid = Number(focused.getAttribute('data-appid') ?? 0);
      if (appid <= 0) return;
      if (appid !== currentAppid.current) {
        prevHero.current = heroUrl;
        currentAppid.current = appid;
        const urls = getHeroUrls(appid);
        allUrls.current = urls;
        fallbackIdx.current = 0;
        setHeroUrl(urls[0] ?? null);
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

  const onImgError = () => {
    fallbackIdx.current += 1;
    if (fallbackIdx.current < allUrls.current.length) {
      setHeroUrl(allUrls.current[fallbackIdx.current]);
    } else if (prevHero.current) {
      setHeroUrl(prevHero.current);
      setVisible(true);
    } else {
      setVisible(false);
    }
  };

  if (!heroUrl) return null;

  // Build native-matching DOM structure:
  // outer (clip) > wrappers (with native classes → bring native CSS including mask) > zoom > img
  const wrappers = nativeClasses?.wrapperClasses ?? [];

  let inner = (
    <div
      className={nativeClasses?.zoomContainerClass || undefined}
      style={{ position: "absolute", inset: 0, overflow: "visible" }}
    >
      <img
        ref={imgRef}
        className={nativeClasses?.imgClass || undefined}
        src={heroUrl}
        onError={onImgError}
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

  // Wrap in intermediate containers — native classes bring their own mask-image via CSS
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

  return (
    <div
      className="ds-hero-background"
      style={{
        position: "absolute",
        // Match native recents hero dimensions (probed via CDP on ArtHero):
        // top: -1, height: 374 with a ~5px linear fade at the bottom.
        top: -1,
        left: 0,
        right: 0,
        height: 374,
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
      {inner}
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
