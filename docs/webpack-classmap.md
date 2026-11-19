# Webpack class map

Steam's Gaming Mode UI is a webpack bundle whose CSS classes are hashed
(`_3PhGYbMWIcIaZCfllWN19N`) and renamed by Steam updates without notice. The
plugin needs some of them: to find the Home's scroll viewport for focus and
centering, and to give its shelves and cards the same classes as Steam's own,
so CSS Loader themes (ArtHero, TiltedHome and others) style them too. This
page explains where those tokens come from and how to refresh them.

> **Never hardcode a token in application logic.** Read it through the class
> map (`src/core/webpackCompat.ts`), and keep a structural fallback for when
> it is missing.

## Where the map comes from

The map is a JSON object of semantic name → token, shipped as a seed in
`src/runtime/classmap.json`. At boot `src/runtime/embeddedClassMap.ts` writes
it to `window.__DS_CLASS_MAP` and to `localStorage["ds_class_map"]` (shared
between Steam's windows). `getRuntimeClassMap()` reads the target window's
`__DS_CLASS_MAP` first, then `localStorage`.

The plugin does not discover tokens while it runs. When a Steam update renames
a class, the seed has to be refreshed and a new version shipped. Until then the
selectors fall back to generic `[class*="…"]` patterns and to structure
(siblings of the plugin's mount, `role` attributes), which keeps things working
with less precision: themes may stop matching the shelves exactly.

## Keys in the seed

| Keys | What they mark | Used for |
|---|---|---|
| `viewport` | The Home's vertically scrolling container | Centering the focused row, focus restore |
| `shelfSection`, `scrollGrid`, `nativeShelfContainer` | Steam's shelf section, its horizontal grid and wrapper | Matching native row spacing and layout |
| `nativeCard`, `nativeCardWrapper`, `nativeCardInner`, `nativeCardFocusable`, `nativeCardOverlay` | A native game card and its layers | Native classes on the plugin's cards |
| `nativeCardArt`, `nativeCardArtOuter`, `nativeCardArtPortrait`, `nativeCardImg`, `nativeCardImgFade` | Card artwork and its fade-in | Native art sizing and animation |
| `nativeLabelOuter`, `nativeLabelInner` | The name label under a focused card | Native label styling |
| `heroRoot`, `heroInner` | The Recents hero art | The per-shelf hero |

Code may read other keys (for example `nativeShelfRow`); when the seed lacks
them, that code takes its fallback.

## Refreshing the seed after a Steam update

1. Open DevTools on the Big Picture page with the Home visible (see
   [cdp.md](./cdp.md)).
2. Find the new tokens. For the viewport, this lists hashed classes on large
   scrolling elements:

   ```js
   (() => {
     const found = new Set();
     for (const el of document.querySelectorAll("[class]")) {
       const cs = getComputedStyle(el);
       const scrolls = ["auto", "scroll", "overlay"].includes(cs.overflowY);
       if (scrolls && el.scrollHeight > el.clientHeight && el.clientHeight > 80) {
         for (const c of el.classList) if (c.startsWith("_") && c.length > 5) found.add(c);
       }
     }
     return [...found];
   })();
   ```

   For cards and labels, inspect a native Recents card in the Elements panel
   and read the classes on each layer. `discoverClassMap()` in
   `src/core/webpackCompat.ts` holds the full set of heuristics if you need to
   see how each key is located.
3. Try the new values before shipping them. In the Big Picture console:

   ```js
   window.__DS_CLASS_MAP = { ...JSON.parse(localStorage.getItem("ds_class_map")), viewport: "_newToken" };
   ```

   Values are bare class names, without a leading dot. Remove the override with
   `delete window.__DS_CLASS_MAP`; the seed applies again on the next boot.
4. Update `src/runtime/classmap.json`, deploy, and check the Home with a theme
   that depends on the classes (ArtHero, TiltedHome, Switch Like Home).

## Safety

The map holds UI class names only. Don't put anything else in
`ds_class_map`, and don't store tokens in plugin settings: they are tied to a
Steam build and would outlive it.
