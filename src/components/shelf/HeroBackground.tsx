import { useEffect, useState, useRef } from "react";
import { getPreferredSteamDocument } from "../../runtime/steamHost";
import { getRuntimeClassMap } from "../../core/webpackCompat";

/** URLs for the hero background — library_hero.jpg is the large landscape art
 *  used by native recents. header.jpg is a smaller fallback. */
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

export function HeroBackground({ mountEl }: { mountEl: HTMLElement }) {
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [nativeImgClass, setNativeImgClass] = useState('');
  const [nativeContainerClass, setNativeContainerClass] = useState('');
  const imgRef = useRef<HTMLImageElement>(null);
  const fallbackIdx = useRef(0);
  const currentAppid = useRef(0);
  const allUrls = useRef<string[]>([]);

  // Discover native hero img classes from the recents section for theme compatibility
  useEffect(() => {
    const discoverClasses = () => {
      const doc = getPreferredSteamDocument();
      if (!doc) return;
      const prev = mountEl.previousElementSibling as HTMLElement | null;
      if (!prev) return;
      // Find the large hero image in native recents
      const imgs = Array.from(prev.querySelectorAll('img'));
      for (const img of imgs) {
        const r = img.getBoundingClientRect();
        if (r.width > 400 && r.height > 200) {
          setNativeImgClass(Array.from(img.classList).join(' '));
          if (img.parentElement) {
            setNativeContainerClass(Array.from(img.parentElement.classList).join(' '));
          }
          return;
        }
      }
    };
    discoverClasses();
    const t = setTimeout(discoverClasses, 2000);
    return () => clearTimeout(t);
  }, [mountEl]);

  useEffect(() => {
    const updateHero = () => {
      // Find focused card in the first shelf only
      const firstShelf = mountEl.querySelector('.ds-shelf');
      if (!firstShelf) { setVisible(false); return; }

      const focused = firstShelf.querySelector('.ds-card.gpfocus, .ds-card:focus') as HTMLElement | null;
      if (!focused) { setVisible(false); return; }

      const appid = Number(focused.getAttribute('data-appid') ?? 0);
      if (appid <= 0) { setVisible(false); return; }

      if (appid !== currentAppid.current) {
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
      if (!related || !mountEl.contains(related)) {
        setVisible(false);
      }
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
    } else {
      setVisible(false);
    }
  };

  if (!heroUrl) return null;

  // The hero extends from above the mount (negative top) to fill the area
  // that native recents would occupy. position:absolute relative to the
  // deck-shelves-root which has position:relative.
  return (
    <div
      className="ds-hero-background"
      style={{
        position: "absolute",
        top: -60,
        left: 0,
        right: 0,
        height: 420,
        overflow: "hidden",
        zIndex: 0,
        pointerEvents: "none",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83)",
      }}
    >
      <div
        className={nativeContainerClass || undefined}
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
        }}
      >
        <img
          ref={imgRef}
          className={nativeImgClass || undefined}
          src={heroUrl}
          onError={onImgError}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 50%",
            display: "block",
            transition: "opacity 0.5s cubic-bezier(0.17, 0.45, 0.14, 0.83)",
          }}
          loading="eager"
        />
      </div>
      {/* Gradient fade at the bottom to blend with content below */}
      <div style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: "60%",
        background: "linear-gradient(to top, rgba(14,16,18,1) 0%, rgba(14,16,18,0) 100%)",
        pointerEvents: "none",
        zIndex: 1,
      }} />
    </div>
  );
}
