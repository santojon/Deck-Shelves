// Shelf stylesheet template. Pure CSS string builder.
// Outer ctx values are computed by the caller in shelfStyles.ts
// from cachedNativeDims + cachedCardRadius (dim-detector state).

export type ShelfStylesheetCtx = {
  cardRadius: string;
  cardW: number;
  cardH: number;
  cardArtH: number;
  cardGap: number;
  featuredW: number;
  featuredH: number;
  featuredArtH: number;
};

export function buildShelfStylesheet(ctx: ShelfStylesheetCtx): string {
  return `
    :root {
      --ds-card-radius: ${ctx.cardRadius};
      --ds-card-dim: 0.9;
      --ds-card-bg: rgba(55, 55, 58, 0.52);
      --ds-shell-bg: transparent;
      --ds-page-bg: rgb(0, 0, 0);
      --ds-native-card-w: ${ctx.cardW}px;
      --ds-native-card-h: ${ctx.cardH}px;
      --ds-native-card-gap: ${ctx.cardGap}px;
      --ds-native-card-art-h: ${ctx.cardArtH}px;
      --ds-native-feat-w: ${ctx.featuredW}px;
      --ds-native-feat-h: ${ctx.featuredH}px;
      --ds-native-feat-art-h: ${ctx.featuredArtH}px;
      --ds-card-h: ${ctx.cardH}px;
      --ds-row-base-gap: ${ctx.cardGap}px;
    }
    #deck-shelves-home-root { margin-top: -32px !important; }
    .deck-shelves-root { background: transparent; }
    .Panel.ds-shelf { background: transparent !important; }
    .ds-row-scroll { scrollbar-width: none; -ms-overflow-style: none; }
    .ds-row-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }

    /* The Opção B promotion adds the native wrapper class to our shelves
       so theme rules (Obsidian backgrounds, Delly fades, ArtHero
       hero/mask, etc.) reach our shelf naturally. But that wrapper class
       also drags in the native rule ._39tNvaLedsTrVh0fFsP4Jm { height:
       105vh }, which would inflate the shelf to 5% past the viewport.
       Reset every DS shelf to auto unconditionally so it stays compact
       (just title + row) by default — forceCssLoaderThemes adds the
       wrapper class to ALL shelves, so the reset must cover all of them,
       not only the promoted one. The ArtHero-specific layout below has
       higher specificity and still opts the promoted shelf back into the
       tall flex container when needed. */
    .Panel.ds-shelf {
      height: auto !important;
    }

    /* ── SLH alt C shim (data-ds-slh="1") ─────────────────────────────────
       Problem: the SLH theme uses position:absolute/bottom:0 on the native
       recents grid inside a height:100vh/overflow:hidden container. When DS
       hides the native recents (height:0), that grid disappears but the
       fixed-height container stays. Our promoted shelf
       (data-ds-recents-slot="true") sits OUTSIDE that container inside
       #deck-shelves-home-root, so it is not caught by the theme's
       absolute-positioning rule and ends up at the top instead of the bottom.

       Fix: expand #deck-shelves-home-root to viewport height and pin the
       promoted shelf to its bottom via absolute positioning — mirroring the
       theme's layout contract without touching any native class names.

       NOTE: Requires validation on a real Deck with the theme active. The
       56px header offset is based on CDP observations from 2026-05-14. */
    [data-ds-slh="1"] #deck-shelves-home-root {
      height: calc(100vh - 56px);
      position: relative;
      overflow: visible;
    }
    [data-ds-slh="1"] .deck-shelves-root {
      height: 100%;
      position: relative;
    }
    [data-ds-slh="1"] .ds-shelf[data-ds-recents-slot="true"] {
      position: absolute !important;
      bottom: 0 !important;
      left: 0 !important;
      right: 0 !important;
      height: auto !important;
      /* SLH pads the grid top by the lift amount so the hero image above
         it doesn't overlap the card row. Mirror via the same variable. */
      padding-top: calc(var(--SLH-lift-hero-px, 0px) + 6px);
    }
    /* SLH + ArtHero: the ArtHero flex column still applies inside the
       absolute-positioned promoted shelf. */
    [data-ds-slh="1"] .deck-shelves-root[data-ds-hero-label="true"] .ds-shelf[data-ds-recents-slot="true"] {
      display: flex !important;
      flex-direction: column;
    }

    /* ── Centered Home shim (data-ds-centered="1") ─────────────────────────
       The Centered Home theme (by Morz) shifts the library home content into
       a centered column using a left padding defined by --center-home-padding.
       DS shelves sit in a portal outside that column and therefore stay
       full-width, not centered. We compensate by applying the same left-padding
       variable so DS shelves align with native content.

       NOTE: --center-home-padding name needs verification on a real Deck with
       the theme active. If the theme uses a different property name, update the
       detection in ensureStyles() and this rule together. */
    [data-ds-centered="1"] #deck-shelves-home-root,
    [data-ds-centered="1"] .deck-shelves-root {
      padding-left: var(--ds-centered-pad, var(--center-home-padding, 0px));
      padding-right: var(--ds-centered-pad, var(--center-home-padding, 0px));
      box-sizing: border-box;
    }
    /* The row's own left padding (2.8vw, inline-styled) compounds with the
       container padding above and offsets cards too far right. Override to 0
       so cards sit flush with the centered native column. */
    [data-ds-centered="1"] .ds-shelf .ds-row-scroll {
      padding-left: 0 !important;
    }
    [data-ds-centered="1"] .ds-shelf .ds-shelf-title {
      padding-left: 0 !important;
    }

    /* "Show game info above the cards" (data-ds-info-above) ONLY shows the
       focused game's info clone above the row — it does NOT make the shelf
       full-page (that's the fullPageShelf toggle / hero-fullscreen theme,
       below). The band above the cards is reserved inline in DeckRow's
       paddingTop, so it stacks UNDER the logo/description instead of fighting
       the inline logo reservation, and is skipped on full-page shelves where
       flex-end already leaves room above the cards. */

    /* Hero-label overlay (ArtHero etc.): when the active theme requires the
       focused card's info to be shown above the row, PerShelfHero clones
       the .ds-card-label DOM into a wrapper here. The cloned label keeps
       its own classes (so all formatting matches the in-card label exactly)
       but its inline position:absolute / top:artH was meaningful only
       inside the card — reset it to static here so it lays out naturally
       in the wrapper. The original IN-CARD label is hidden so the focused
       card doesn't render the same label twice — scoped to the
       ".ds-card .ds-card-label" descendant so it does NOT also hide the
       cloned overlay label, which lives in .ds-promoted-hero-label and
       not inside a card. */
    .ds-shelf[data-ds-info-above="true"] .ds-card .ds-card-label {
      display: none !important;
    }
    .ds-promoted-hero-label .ds-card-label {
      position: static !important;
      top: auto !important;
      left: auto !important;
      width: auto !important;
      padding-top: 0 !important;
      opacity: 1 !important;
      display: block !important;
    }
    /* Match the native ArtHero recents game-info overlay exactly (values
       read via CDP from the native recents shelf):
         name   — 22px / weight 800 / rgb(255,255,255)
         status — 14.67px / weight 700 / rgba(255,255,255,0.5) /
                  uppercase / letter-spacing 0.5px
       Status icons are dropped — the native overlay shows just text. */
    .ds-promoted-hero-label .ds-card-label-name {
      font-size: 22px !important;
      font-weight: 800 !important;
      line-height: 1.15 !important;
      color: rgb(255, 255, 255) !important;
      white-space: nowrap !important;
      text-shadow: 0 2px 12px rgba(0, 0, 0, 0.85);
    }
    .ds-promoted-hero-label .ds-card-status {
      font-size: 14.6667px !important;
      font-weight: 700 !important;
      opacity: 1 !important;
      color: rgba(255, 255, 255, 0.5) !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5px !important;
      margin-top: 2px !important;
      text-shadow: 0 1px 8px rgba(0, 0, 0, 0.85);
    }
    /* Hide only the play icon (installed + no pending update). The download
       icon (not installed) and the update icon (installed + update pending)
       stay visible — they convey actionable state the user needs to see. */
    .ds-promoted-hero-label .ds-card-status-icon.ds-card-status-play {
      display: none !important;
    }
    .ds-card {
      border-radius: var(--ds-card-radius, ${ctx.cardRadius}) !important;
      /* overflow:visible so the badge band can extend above the card. */
      overflow: visible;
      /* Native-recents baseline shadow (CDP-measured). */
      box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
      scroll-margin-top: 90px;
      scroll-margin-bottom: 52px;
      scroll-margin-inline-end: 2.8vw;
    }
    /* Card transitions: mirror native cards (CDP-measured: filter +
       box-shadow + transform at 0.4s cubic-bezier(0, 0.73, 0.48, 1)).
       The shorter 160ms transition we used previously was visibly
       snappier than native and was the perceived "different animation"
       complaint. Steam's nav controller debounce is NOT tied to CSS
       transition duration — verified by side-by-side timing — so the
       longer native-matching curve does not re-introduce the press
       swallowing that the earlier transform transition caused. */
    #deck-shelves-home-root .ds-card.Focusable,
    #deck-shelves-home-root .ds-card {
      transition:
        filter 0.4s cubic-bezier(0, 0.73, 0.48, 1),
        box-shadow 0.4s cubic-bezier(0, 0.73, 0.48, 1),
        transform 0.4s cubic-bezier(0, 0.73, 0.48, 1) !important;
    }
    /* Focus pop: native wraps each card in its own perspective:300px
       container so translateZ(7px) foreshortens into a ~2.4 % zoom.
       DS has no per-card wrapper; perspective on the row tanked nav
       latency (17 s spikes). 1.025 bumped the swallow rate from 0 % to
       33 %; 1.015 kept 0 % but read as too subtle. 1.02 is the middle
       ground — more visible zoom while staying within the hit-test
       tolerance Steam's nav controller allows. */
    #deck-shelves-home-root .ds-card:focus,
    #deck-shelves-home-root .ds-card.gpfocus,
    #deck-shelves-home-root .ds-card:hover {
      transform: scale(1.025);
    }
    /* Inline badge stays visible on focused cards too — the focus ring
       can visually overlap but the badge must never disappear. */
    /* Cancel native brightness on .ds-card so it does not create a stacking
       context that traps the badge host's z-index. Brightness is applied to
       .ds-card-art below instead. */
    #deck-shelves-home-root .ds-card { filter: none !important; }
    #deck-shelves-home-root .deck-shelves-root:focus,
    #deck-shelves-home-root .deck-shelves-root.gpfocus,
    #deck-shelves-home-root .deck-shelves-root.gpfocuswithin,
    #deck-shelves-home-root .ds-row-scroll:focus,
    #deck-shelves-home-root .ds-row-scroll.gpfocus,
    #deck-shelves-home-root .ds-row-scroll.gpfocuswithin,
    #deck-shelves-home-root .Panel.gpfocus,
    #deck-shelves-home-root .Focusable.gpfocus,
    #deck-shelves-home-root [class*="row"].gpfocus {
      outline: none !important;
      border: none !important;
      box-shadow: none !important;
      animation: none !important;
    }
    #deck-shelves-home-root .ds-card:focus,
    #deck-shelves-home-root .ds-card.gpfocus,
    #deck-shelves-home-root .ds-card:hover {
      outline: none !important;
      outline-offset: 0px !important;
      border: none !important;
      box-shadow: rgba(0, 0, 0, 0.5) 0px 16px 24px 0px !important;
      z-index: 12;
    }
    /* Suppress our focus drop shadow when the "Focus Highlight Color" theme's
       Round Compatibility patch is on — that patch removes the native card
       focus indicator, so DS cards should match. Spec needs the #id prefix
       to beat the (1,2,0) original focus rule. */
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:focus,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card.gpfocus,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:hover {
      box-shadow: none !important;
    }
    /* Synthetic decoration cards with placeholder=false (the default)
       render no background fill - the native card class still carries
       a baseline drop shadow from the theme, which paints against
       nothing and looks like a floating shadow with no card. Suppress
       it across every state (idle / focus / hover) for transparent
       decoration slots; placeholder=true keeps the shadow so the
       grey card panel reads as a real card. */
    #deck-shelves-home-root .ds-card--synthetic-noshadow,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:focus,
    #deck-shelves-home-root .ds-card--synthetic-noshadow.gpfocus,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:hover {
      box-shadow: none !important;
    }
    /* Shadow-only-on-focus mode: suppress drop shadow at idle, restore it
       on focus/hover. Mirrors the native focus shadow so the framed look
       only kicks in when the user actually navigates to the card. */
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only {
      box-shadow: none !important;
    }
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only:focus,
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only.gpfocus,
    #deck-shelves-home-root .ds-card--synthetic-shadow-focus-only:hover {
      box-shadow: 0 8px 16px rgba(0,0,0,0.5) !important;
    }
    /* Same suppression for the native shine ::after layer — paints
       over a transparent card it can't visually anchor against. */
    #deck-shelves-home-root .ds-card--synthetic-noshadow::after,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:focus::after,
    #deck-shelves-home-root .ds-card--synthetic-noshadow.gpfocus::after,
    #deck-shelves-home-root .ds-card--synthetic-noshadow:hover::after {
      opacity: 0 !important;
      animation: none !important;
    }
    /* Also kill the Game Cover Shine ::after animation/opacity under the same
       flag — that pseudo paints over the card on focus and isn't controlled
       by the Round Compat patch on its own. */
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:focus::after,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card.gpfocus::after,
    #deck-shelves-home-root .deck-shelves-root[data-ds-theme-focus-round-compat="true"] .ds-card:hover::after {
      opacity: 0 !important;
      animation: none !important;
    }
    #deck-shelves-home-root { z-index: 10 !important; }
    /* Round Compat ON: hide the FocusRing entirely. Gated on the html-level
       flag so the rule can reach the FocusRing's subtree (which sits outside
       .deck-shelves-root). Hash kept in sync with classmap entry for
       FocusRing — if a Steam release breaks this, update the class below. */
    html[data-ds-theme-focus-round-compat="true"] ._1wPplsegQqCoe06wXPhzKT {
      animation: none !important;
      border: none !important;
      outline: none !important;
      opacity: 0 !important;
    }
    /* Round Compat OFF: the FocusRing carries TWO visual layers — a static
       white border (Steam native) and a themed colored outline (animated
       blinker). Suppress the border AND switch box-sizing to border-box so
       the ring's box stays the exact card size on all four sides (default
       content-box made the border push the right/bottom edges 4px out).
       Then outline-offset: 2px places the colored outline 2px outside the
       card edge symmetrically. Scoped via:has() to apply only when a ds-card
       is the focused element, leaving other Steam screens alone. */
    html:has(.ds-card.gpfocus):not([data-ds-theme-focus-round-compat="true"]) ._1wPplsegQqCoe06wXPhzKT,
    html:has(.ds-card:focus):not([data-ds-theme-focus-round-compat="true"]) ._1wPplsegQqCoe06wXPhzKT {
      box-sizing: border-box !important;
      border: 0 none transparent !important;
      margin: 0 !important;
      outline-offset: 2px !important;
    }
    /* Layout-only ::after: matches the card's art height/radius so any
       theme overlay (e.g. Game Cover Shine focus animation) targets the
       right region. Opacity is NOT forced here — the cover-shine theme
       relies on opacity 0 by default + opacity 0.8 on :focus to run its
       shine animation. Forcing opacity 1 made the shine gradient static-
       visible on every card (purple stripe at bottom-right). */
    #deck-shelves-home-root .ds-card::after {
      content: '' !important;
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      bottom: auto !important;
      height: var(--ds-card-art-h, 100%) !important;
      border-radius: var(--ds-card-radius, ${ctx.cardRadius}) !important;
      pointer-events: none !important;
      display: inline !important;
    }
    #deck-shelves-home-root .ds-card.gpfocus::after,
    #deck-shelves-home-root .ds-card:focus::after,
    #deck-shelves-home-root .ds-card:hover::after {
      height: var(--ds-card-art-h, 100%) !important;
      bottom: auto !important;
      border-radius: var(--ds-card-radius, ${ctx.cardRadius}) !important;
    }
    #deck-shelves-home-root .ds-card .ds-card-shimmer {
      position: absolute;
      inset: 0;
      background: linear-gradient(90deg, rgba(90,90,90,0.18) 0%, rgba(160,160,160,0.32) 50%, rgba(90,90,90,0.18) 100%);
      background-size: 200% 100%;
      animation: ds-shelf-shimmer 2s ease-in-out infinite;
      pointer-events: none;
      z-index: 1;
      border-radius: var(--ds-card-radius, 4px);
    }
    #deck-shelves-home-root .ds-card .ds-card-shimmer--loaded { display: none; }
    /* Hero img opacity gate — defends against the browser's broken-
       image glyph painting during the gap between src assignment and
       first decoded byte (especially for slot swaps where the new
       URL hasn't loaded yet but its wrapper is already at full
       opacity from the cross-fade). 60 ms transition (was 180 ms) so
       cached/cold loads alike feel near-instant. PerShelfHero sets
       is-loaded synchronously via a ref callback when the img is
       already decoded (hot blob URL / HTTP cache hit), so cached
       hero swaps don't even need a render cycle to flip the class.
       ID-scoped under #deck-shelves-home-root to beat the
       no-hero-gradient theme rule's (0,4,0) specificity. */
    /* Hero img opacity gating — the transition runs ONLY on the up-leg
       (going from 0 → 1 when the image actually decodes). Going back to
       0 (fallback chain advancing to the next URL after an error, src
       reassigned to a different game on focus change, etc.) is instant.
       A symmetric transition let a frame of the BROWSER'S broken-img
       placeholder peek through during the fade-out — visible as a quick
       broken-hero flash when the first shelf is in the recents slot
       (there's no native hero behind to mask it). */
    #deck-shelves-home-root .ds-per-shelf-hero-img { opacity: 0 !important; transition: none !important; }
    #deck-shelves-home-root .ds-per-shelf-hero-img.is-loaded { opacity: 1 !important; transition: opacity 0.06s ease !important; }
    /* TiltedHome integration: see the block scoped under
       [data-ds-theme-tilted-home="true"] further down. The intermediate
       skew-based version was removed because it conflicted with the
       theme's own rotateY transforms. */
    /* Refresh icon spin — driven by class added on click via DOM (not React
       state) so the animation survives the upstream setAppIds() that may
       reconcile the row while playing. The class is re-added each click via
       a remove + reflow + add sequence so consecutive clicks restart the
       spin from 0deg instead of stuttering. */
    @keyframes ds-refresh-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    .ds-refresh-icon.ds-refresh-spinning {
      animation: ds-refresh-spin 0.7s cubic-bezier(0.4, 0.05, 0.4, 1);
    }
    @keyframes ds-shelf-shimmer {
      0% { background-position: 0% 0%; opacity: 0; }
      40% { opacity: 1; }
      100% { background-position: -200% 0%; opacity: 0; }
    }
    @keyframes ds-focus-pulse {
      0% { opacity: 0; }
      40% { opacity: 1; }
      100% { opacity: 0; }
    }
    #deck-shelves-home-root .ds-card *:focus { outline: none !important; box-shadow: none !important; }
    .ds-card-art {
      position: absolute !important;
      inset: 0 !important;
      height: var(--ds-card-art-h, 100%) !important;
      padding-top: 0 !important;
      border-radius: var(--ds-card-radius, ${ctx.cardRadius});
      overflow: hidden;
      filter: brightness(var(--ds-card-dim, 0.9)) !important;
      transition: filter 0.4s cubic-bezier(0, 0.73, 0.48, 1);
    }
    .ds-card-art img {
      border-radius: var(--ds-card-radius, ${ctx.cardRadius});
    }
    #deck-shelves-home-root .ds-card.gpfocus .ds-card-art,
    #deck-shelves-home-root .ds-card:focus .ds-card-art,
    #deck-shelves-home-root .ds-card:hover .ds-card-art {
      z-index: 2;
      filter: brightness(1) !important;
    }

    /* =================================================================
       TiltedHome theme integration — single, native-equivalent
       =================================================================
       Activated only when isTiltedHomeActive() returns true (HomeInject
       sets data-ds-theme-tilted-home="true" on .deck-shelves-root). The
       prior implementation applied a 2-D skew using --ren-tilt-angle
       blindly whenever the variable was defined, but native TiltedHome
       uses perspective + rotateY (3-D fan), so DS cards were rendered
       skewed while native cards rotated — visual conflict the user
       reported as "duas implementações sobrepondo".

       Approach (mirrors native TiltedHome exactly):
       - Default (cards LEFT of focus + the focused card before override):
         perspective(600px) rotateY(2*angle) — leans toward the right
       - Cards AFTER focused (sibling combinator ~): rotateY(-2*angle)
         — leans toward the left, completing the fan around the focused
         card
       - Focused card: scale(1.05) only, no rotation — pivot of the fan
         (matches native's .gpfocuswithin > div:first-child treatment)
       - Trailing tiles (.ds-refresh-card / .ds-more-card): tilted +
         scaled like native's GoToLibrary tile
       - Row: overflow-y visible + perspective parent so tilted edges
         aren't clipped

       Reads the user's --ren-tilt-angle and --ren-view-more-focus-scale
       directly from :root so the tilt intensity matches whatever the
       user configured in the TiltedHome theme module. Honors gpfocus
       AND gpfocuswithin (Steam toggles both during d-pad nav). */

    /* DS-side overrides target .ds-card > .ds-card-art (the same
       element TiltedHome's native selector targets via > div:first-child
       on the wrapper class we add via resolveNativeCardClass). That
       way TiltedHome's DEFAULT rule (the left-tilt rotation) reaches
       DS cards naturally via the shared wrapper class — no need to
       duplicate it here. We only ADD the cases TiltedHome's native
       selectors can't reach because they rely on the ReactVirtualized
       grid structure DS doesn't replicate:

       - Right-side override: cards AFTER the focused one need the
         opposite-sign rotation. TiltedHome's rule wraps this in a
         ReactVirtualized__Grid__innerScrollContainer + gpfocuswithin
         sibling selector chain that DS doesn't have, so we mirror it
         with our own sibling combinator (.ds-card.gpfocuswithin ~
         .ds-card).
       - Focused override: native applies scale(1.02) to the focused
         tile's first child; we apply slightly larger scale(1.05).

       All overrides target .ds-card-art so they cascade together
       with TiltedHome's rule on the same element (no double transform
       on the wrapper). */
    /* =================================================================
       DS-side TiltedHome implementation — full mode-aware support.
       =================================================================
       Why DS-side and not class-adoption: Decky's Focusable puts a
       tabindex on the same wrapper that would adopt nativeCardWrapper,
       and some TiltedHome modules' focused-state selectors use the
       tabindex attribute to match the focused tile — which would then
       match EVERY DS card and replace the tilt with a flat scale on
       all of them. Until we rebuild on a custom focus primitive
       (NativeFocusable) that puts tabindex on a deeper element
       matching native's hierarchy, DS implements its own tilt CSS
       that mirrors each TiltedHome variant exactly.

       Mode detection lives in cssLoaderDetect.ts:getTiltedHomeMode()
       and is published as data attrs on .deck-shelves-root by
       HomeInject:
         data-ds-theme-tilt-method = "skew" | "3d"
         data-ds-theme-tilt-direction = "one-way" | "opposites"

       Variants supported:
       - SKEW one-way: every tile gets skew(angle) — most common
         TiltedHome install (one CSS Loader module, no opposite override)
       - SKEW opposites: cards before focus skew(+angle), after skew(-angle)
       - 3D one-way: every tile gets perspective + rotateY(angle)
       - 3D opposites: same with sibling override

       Tilt is applied to .ds-card ITSELF (not the wrapping div) so the
       Focusable's box-shadow focus indicator (computed from the card's
       bounding rect) follows the tilt — fixes the "foco aparentemente
       alinhado por dentro do card" issue where the focus ring stayed
       rectangular inside a tilted parallelogram visual.

       The wrapping div added in GameCard / MoreCard / RefreshCard
       intentionally stays — it lets the card art keep its existing
       layout while the parent tilts as a single unit. PlaceholderCard
       and SyntheticCard don't have the wrapping div but render the
       art element directly as the card's child, which also tilts
       because the transform is on the .ds-card parent. */

    /* Row needs perspective context for 3D tilts to compose around a
       fixed eye-point, plus overflow-y: visible so tilted edges
       aren't clipped at the row boundary. */
    .deck-shelves-root[data-ds-theme-tilted-home="true"] .ds-row-scroll {
      overflow-y: visible !important;
      perspective: 600px !important;
    }
    /* Tilt applied to .ds-card ITSELF (the wrapper) — NOT the inner
       first-child div — so the Focusable's box-shadow focus indicator
       (computed from the wrapper's bounding rect) follows the tilt
       visually. All rules use !important to beat Steam's native
       higher-specificity :focus rule
       (.BasicUI .WYgDg9NyCcMIVuMyZ_NBC.Focusable:focus._3VOR2AeYATx3qSE0I-Pm-5
       { transform: translateZ(7px) }) which would otherwise zero out
       our tilt on the focused card. We compose translateZ(7px) into
       the focused rule so the native depth-lift effect is preserved. */

    /* SKEW one-way: every card tilts same direction. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) !important;
      transition: transform 0.4s !important;
    }
    /* SKEW opposites: default lean one way, sibling-after-focused flips. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus ~ .ds-card {
      transform: skew(calc(-1 * var(--ren-tilt-angle, -5deg))) !important;
    }
    /* SKEW focused — one-way mode: KEEP the directional tilt + scale +
       Steam's translateZ. The whole row leans the same direction so
       the selected card stays integrated by keeping its tilt.
       Opposites mode: focused goes FLAT (no skew, just scale +
       translateZ) — the surrounding cards form a fan converging on
       the focused tile, so the pivot of the fan reads correctly
       only when it itself has no tilt (matches native behaviour). */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-card:focus {
      transform: skew(var(--ren-tilt-angle, -5deg)) scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-card:focus {
      transform: scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }

    /* 3D one-way: every card gets perspective + rotateY same direction. */
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-card {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) !important;
      transform-style: preserve-3d !important;
      transition: transform 0.4s !important;
    }
    /* 3D opposites: default lean left (+2*angle), sibling-after-focused
       flips to right (-2*angle). Together these form the fan
       composition converging on the focused card. */
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) !important;
      transform-style: preserve-3d !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus ~ .ds-card {
      transform: perspective(600px) rotateY(calc(-2 * var(--ren-tilt-angle, -5deg))) !important;
    }
    /* 3D focused — same direction rule as SKEW. One-way keeps the
       rotation; opposites flattens the focused pivot. */
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-card:focus {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-card:focus {
      transform: scale(1.05) translateZ(7px) !important;
      z-index: 3 !important;
    }

    /* Trailing tiles (Refresh / More) — view-more / GoToLibrary
       treatment. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"] .ds-refresh-card,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"] .ds-more-card {
      transform: skew(var(--ren-tilt-angle, -5deg)) scale(var(--ren-view-more-focus-scale, 0.88)) !important;
      transition: transform 0.4s !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"] .ds-refresh-card,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"] .ds-more-card {
      transform: perspective(600px) rotateY(calc(-2 * var(--ren-tilt-angle, -5deg))) scale(var(--ren-view-more-focus-scale, 0.88)) !important;
      transition: transform 0.4s !important;
    }
    /* Trailing tiles focused — same one-way-keeps-tilt /
       opposites-flattens rule as game tiles. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="one-way"] .ds-more-card.gpfocus {
      transform: skew(var(--ren-tilt-angle, -5deg)) scale(1.05) translateZ(7px) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="skew"][data-ds-theme-tilt-direction="opposites"] .ds-more-card.gpfocus {
      transform: scale(1.05) translateZ(7px) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="one-way"] .ds-more-card.gpfocus {
      transform: perspective(600px) rotateY(calc(2 * var(--ren-tilt-angle, -5deg))) scale(1.05) translateZ(7px) !important;
    }
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-refresh-card.gpfocus,
    .deck-shelves-root[data-ds-theme-tilt-method="3d"][data-ds-theme-tilt-direction="opposites"] .ds-more-card.gpfocus {
      transform: scale(1.05) translateZ(7px) !important;
    }

    /* Most-recent / first tile offset — mirrors native's
       --ren-most-recent-offset shift. */
    .deck-shelves-root[data-ds-theme-tilted-home="true"] .ds-row-scroll > .ds-card:first-child {
      margin-left: var(--ren-most-recent-offset, 2%);
    }

    /* Counter-tilt the verified / playable badge so it reads
       horizontally even though the card is tilted. */
    .deck-shelves-root[data-ds-theme-tilt-method="skew"] .ds-card .ds-compat {
      transform: skew(calc(-1 * var(--ren-tilt-angle, -5deg)));
    }

    .ds-card .ds-card-label {
      opacity: 0;
      transition: opacity .15s ease;
    }

    /* Compact label variant: hide the status line but keep title positioning */
    .ds-card-label--compact .ds-card-status { display: none !important; }
    .ds-card.gpfocus .ds-card-label,
    .ds-card:focus .ds-card-label,
    .ds-card:hover .ds-card-label {
      opacity: 1;
    }
    .ds-card img:not(.ds-card-icon):not(.ds-card-logo) { transition: opacity .15s ease; width: 100% !important; height: 100% !important; object-fit: cover !important; }
    .ds-card .ds-card-icon { width: 20px !important; height: 20px !important; object-fit: contain !important; }
    .ds-compat {
      position: absolute; bottom: 4px; right: 4px;
      display: var(--ds-compat-display, flex); align-items: center;
      background: rgba(0,0,0,0.7);
      border-radius: 20px;
      padding: 2px;
      z-index: 3; pointer-events: none;
      width: 40px; height: 20px;
      opacity: 0;
      transition: opacity .15s ease;
    }
    .ds-card.gpfocus .ds-compat,
    .ds-card:focus .ds-compat,
    .ds-card:hover .ds-compat { opacity: var(--ds-compat-opacity, 1); }
    .ds-compat svg { flex-shrink: 0; width: 20px; height: 20px; }
    .ds-compat-deck-icon { color: var(--custom-compat-icons-deck, rgba(255,255,255,0.84)); }
    .ds-compat-verified .ds-compat-verdict-icon { color: var(--custom-compat-icons-verified, rgb(89, 191, 64)); }
    .ds-compat-playable .ds-compat-verdict-icon { color: var(--custom-compat-icons-playable, rgb(255, 200, 44)); }
    .ds-compat-unsupported .ds-compat-verdict-icon { color: var(--custom-compat-icons-unsupported, rgb(220, 222, 223)); }
    .ds-compat-unknown .ds-compat-verdict-icon { color: var(--custom-compat-icons-unknown, rgba(255,255,255,0.4)); }
    body.ds-hide-non-steam-badges .nonsteam-badge,
    .ds-card--hide-non-steam-badge .nonsteam-badge { display: none !important; }
    .ds-new-badge-band {
      position: absolute; top: 0px; left: 0; right: 0;
      height: 24px;
      display: flex; justify-content: center; align-items: flex-start;
      pointer-events: none;
      z-index: 21;
    }
    .ds-card .ds-card-badge-host {
      top: -2px;
      height: calc(100% + 2px);
    }
    .ds-card.gpfocus .ds-card-badge-host--inline,
    .ds-card:focus .ds-card-badge-host--inline,
    .ds-card:hover .ds-card-badge-host--inline,
    .ds-card.is-selected .ds-card-badge-host--inline {
      visibility: hidden;
    }
    .ds-new-badge {
      /* Mirrors the native SteamOS "New" badge color resolution:
         themes may override --ds-new-badge-bg directly; otherwise the
         badge falls back to --colored-toggles-main-color (the same var
         the native badge uses, set by themes like Colored Toggles), and
         finally to the Steam-default blue when no theme is active.
         Round / More Round themes set --round-radius-size on :root —
         badges (new + discount, both share this class) inherit it
         unconditionally so the round always applies regardless of
         force / promoted-slot state. */
      background: var(--ds-new-badge-bg, var(--colored-toggles-main-color, rgb(26, 159, 255)));
      color: var(--ds-new-badge-color, #fff);
      font: 700 10px/20px "Motiva Sans", Helvetica, Arial, sans-serif;
      letter-spacing: 0.5px; text-transform: uppercase;
      padding: 2px 12px;
      border-radius: var(--ds-new-badge-radius, var(--round-radius-size, 0px));
      box-shadow: rgb(37, 53, 83) 0 1px 8px 0;
      pointer-events: none;
      z-index: 21;
    }
    .ds-shelf-title {
      color: var(--ds-native-heading-color, inherit);
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }

    .ds-shelf-collapse-icon {
      font-size: 14px;
      opacity: 0.5;
      transition: transform 0.2s;
      display: inline-block;
    }
    .ds-card-label-name {
      color: var(--ds-native-heading-color, inherit);
      font-size: inherit;
      line-height: 1.2;
      font-weight: bold;
      white-space: nowrap;
      overflow: visible;
    }
    .ds-card-status {
      display: flex;
      align-items: center;
      gap: 6px;
      opacity: 0.7;
      font-size: 0.75em;
      line-height: 1.3;
      font-weight: bold;
      text-transform: uppercase;
      margin-top: 4px;
      white-space: nowrap;
      overflow: visible;
    }
    [data-ds-playtime-position="center"] .ds-card-status { justify-content: center; }
    [data-ds-playtime-position="right"]  .ds-card-status { justify-content: flex-end; }
    /* Enrichment renderers — logo overlay over the art, prepended icon,
       description snippet. Logo: max 80 % of the card width, anchored
       to the bottom of the art so it composes the same way the native
       game-view layout does. Icon: square ~14 px before the name span.
       Description: clamped to 2 lines, ~3 cards wide, ellipsis. */
    .ds-card-logo-overlay {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 12px;
      box-sizing: border-box;
    }
    .ds-card-logo-overlay[data-ds-position="left"] { align-items: flex-start; }
    .ds-card-logo-overlay[data-ds-position="right"] { align-items: flex-end; }
    /* Description below the install row inherits the same horizontal
       alignment when the logo is shown, for visual consistency. */
    .ds-card-description[data-ds-position="left"] { text-align: left; margin-left: 0; margin-right: auto; }
    .ds-card-description[data-ds-position="center"] { text-align: center; margin-left: auto; margin-right: auto; }
    .ds-card-description[data-ds-position="right"] { text-align: right; margin-left: auto; margin-right: 0; }
    .ds-card-logo {
      width: 92%;
      max-height: 60%;
      object-fit: contain;
      filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.7));
    }
    .ds-card-icon {
      width: 12px;
      height: 12px;
      object-fit: contain;
      flex-shrink: 0;
      border-radius: 2px;
    }
    .ds-card-description {
      /* Anchored to the text column (which is set to position:relative
         in GameCard) so the snippet starts at the same x as the game
         name / playtime row — even when the icon is shown to its left.
         Width is 4 cards + 3 inter-card gaps so it visually spans the
         next 4 cards' worth of space; only the focused card's snippet
         is visible (others stay opacity:0). */
      position: absolute;
      top: 100%;
      margin-top: 2px;
      font-size: calc(0.7em * var(--ds-eff-desc-scale, 1));
      line-height: 1.2;
      opacity: 0;
      transition: opacity 0.18s ease;
      /* min() clamps against the viewport so the snippet never overflows
         the screen on a card focused near the right edge — without this
         the absolute element walks straight off the side. */
      width: min(calc(var(--ds-eff-card-w, 188px) * 4 + var(--ds-eff-card-gap, 16px) * 3), 72vw);
      max-width: min(calc(var(--ds-eff-card-w, 188px) * 4 + var(--ds-eff-card-gap, 16px) * 3), 72vw);
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: normal;
      font-weight: normal;
      text-transform: none;
      pointer-events: none;
      z-index: 5;
    }
    .ds-card-description[data-ds-position="left"]   { left: 0; right: auto; text-align: left; }
    .ds-card-description[data-ds-position="center"] { left: 50%; transform: translateX(-50%); text-align: center; }
    .ds-card-description[data-ds-position="right"]  { right: 0; left: auto; text-align: right; }
    .ds-card.gpfocus .ds-card-description,
    .ds-card.gpfocuswithin .ds-card-description { opacity: 0.88; }
    .ds-card-description--below-logo {
      margin-top: 6px;
      max-width: 80%;
    }
    .ds-card-status-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      flex-shrink: 0;
      line-height: 0;
    }
    .ds-card-status-play { color: var(--ds-native-heading-color, rgb(89, 191, 64)); }
    .ds-friend-avatars {
      position: absolute;
      z-index: 4;
      display: flex;
      flex-direction: row;
      gap: 3px;
      pointer-events: none;
    }
    .ds-friend-avatar {
      position: relative;
      width: var(--ds-friend-avatar-size, 23px);
      height: var(--ds-friend-avatar-size, 23px);
      flex-shrink: 0;
      box-shadow: 2px 2px 8px 1px rgba(0, 0, 0, 0.3);
    }
    .ds-friend-avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: #1b2838;
    }
    .ds-friend-avatar-status {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 9%;
      min-height: 2px;
      background: var(--ds-native-heading-color, rgb(89, 191, 64));
    }
    .ds-more-card-text {
      font-size: 16px;
      font-weight: 400;
      line-height: 1.35;
      text-align: center;
    }
    .ds-card-art-placeholder {
      font-size: 11px;
      opacity: 0.5;
      text-align: center;
      word-break: break-word;
    }
    .ds-card.ds-card--featured .ds-card-art img { object-position: center top; }

    /* ── Per-shelf hero art ─────────────────────────────────────────────────
       Hero images rendered by PerShelfHero (in DeckRow when heroEnabled=true).
       Subtle zoom animation mirrors the 25s native Steam hero zoom. */
    @keyframes ds-per-shelf-hero-zoom {
      from { transform: scale(1); }
      to   { transform: scale(var(--ds-hero-zoom-scale, 1.06)); }
    }
    .ds-shelf[data-ds-hero-enabled="true"] .ds-per-shelf-hero-img {
      animation: ds-per-shelf-hero-zoom var(--ds-hero-zoom-duration, 25s) var(--ds-hero-zoom-ease, ease) infinite alternate;
      transition: opacity 0.5s cubic-bezier(0.17,0.45,0.14,0.83),
                  filter 0.35s ease;
      /* Respect theme overrides via CSS variables for fit/position/filter */
      object-fit: var(--ds-hero-fit, cover);
      object-position: var(--ds-hero-position, 50% 18%);
      filter: var(--ds-hero-appearance-filter, none);
      mask-image: var(--ds-hero-mask, none);
      -webkit-mask-image: var(--ds-hero-mask, none);
    }

    /* Global promoted hero background container — themes can override the
       mask via --ds-hero-mask on :root. Fallback mirrors the native linear
       bottom fade when no theme provides a mask. */
    .ds-hero-background {
      mask-image: var(--ds-hero-mask, linear-gradient(rgb(0,0,0) 90%, rgba(0,0,0,0) calc(100% - 5px)));
      -webkit-mask-image: var(--ds-hero-mask, linear-gradient(rgb(0,0,0) 90%, rgba(0,0,0,0) calc(100% - 5px)));
    }

    /* Obsidian without ArtHero: apply grayscale+contrast to per-shelf hero
       images so they match the first shelf. When ArtHero is also active
       (data-ds-hero-label set on .deck-shelves-root), the first shelf shows
       colour — so skip grayscale on all per-shelf heroes to match. */
    [data-ds-obsidian="1"] .deck-shelves-root:not([data-ds-hero-label="true"]) .ds-shelf[data-ds-hero-enabled="true"] .ds-per-shelf-hero-img {
      filter: grayscale(1) contrast(1.1);
    }

    /* Theme inheritance for promoted (recents-slot) shelves. The slot
       attribute scopes these rules to the first shelf (hideRecents) or to
       every shelf (force on). */

    /* Carousel transparency: only the portrait artwork dims. Label keeps
       its own opacity:0 default (visible on focus); badge band stays at 1
       because it's not in the selector. Specificity bump (#deck-shelves-
       home-root) outranks the carousel theme's gpfocuswithin rule. */
    #deck-shelves-home-root .ds-card:not(.gpfocus):not(.is-selected):not(:hover):not(:focus) .ds-card-art {
      opacity: var(--carousel-opacity, 1) !important;
      transition: opacity 0.2s ease-in-out;
    }
    #deck-shelves-home-root .ds-card.gpfocus .ds-card-art,
    #deck-shelves-home-root .ds-card:focus .ds-card-art,
    #deck-shelves-home-root .ds-card:hover .ds-card-art,
    #deck-shelves-home-root .ds-card.is-selected .ds-card-art {
      opacity: 1 !important;
    }
    .ds-card { opacity: 1 !important; }

    /* First DS shelf below native (hideRecents off): 150px upward bleed
       with a 6-stop top fade that lands opaque at the shelf top. Bottom
       fade is extended to 132px / 5 stops for a smoother blend into the
       next shelf. */
    /* First-shelf hero override removed — JS's per-shelf mask (subtle
     * fade for !isFirstShelf, opaque-top for isFirstShelf) plus the
     * native recents' built-in bottom fade handle the composition
     * correctly without our intervention. Adding a CSS override here
     * was conflicting with full-page mode (caused a visible black band
     * at the fade-in boundary). */

    /* Second DS shelf top bleed — tuned based on what the first is.
       Default inline -140 stays for force/other cases. */

    /* No force + native visible: larger bleed for the second (170). */
    .deck-shelves-root > .ds-shelf:first-child:not([data-ds-recents-slot="true"]) + .ds-shelf [data-ds-per-shelf-hero="true"] {
      --ds-hero-top: -170px;
      --ds-hero-h: calc(100% + 170px);
    }

    /* No force + recents hidden: smaller bleed for the second (110). */
    .deck-shelves-root > .ds-shelf[data-ds-recents-slot="true"]:first-child + .ds-shelf:not([data-ds-recents-slot="true"]) [data-ds-per-shelf-hero="true"] {
      --ds-hero-top: -110px;
      --ds-hero-h: calc(100% + 110px);
    }

    /* No Hero Gradient — strip mask/zoom on promoted heroes. */
    [data-ds-theme-no-hero-gradient="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-per-shelf-hero-img {
      mask-image: none !important;
      -webkit-mask-image: none !important;
      filter: none !important;
      opacity: 1 !important;
      animation: none !important;
    }

    /* Hero Fullscreen — the promoted (recents-slot) shelf takes the full
       viewport under a hero-fullscreen theme. This is the theme's own
       full-page intent on the first shelf (or all promoted shelves under
       force-CSS-Loader); independent of the gameInfoAbove label band. */
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"] .ds-shelf[data-ds-recents-slot="true"] {
      height: 100vh !important;
      --ds-hero-top: 0px;
      --ds-hero-h: 100vh;
    }
    /* First DS shelf pulled UP 56px only when recents are hidden (no
       native content above) — covers the transparent header band without
       overlapping native when it stays visible. Applies under a CSS Loader
       fullscreen-hero theme OR DS's own fullscreen hero background. */
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"][data-ds-recents-hidden="true"] > .ds-shelf[data-ds-recents-slot="true"]:first-child,
    .deck-shelves-root[data-ds-hero-background="true"][data-ds-recents-hidden="true"] > .ds-shelf[data-ds-recents-slot="true"]:first-child {
      margin-top: -56px;
    }
    /* Decoupled first shelf (recents hidden, DS hero art on, NOT the themed
       recents-slot): bleed the hero ART up 56px under the transparent Steam
       header so the top isn't a black strip. Only the art moves
       (--ds-hero-top); the shelf box, logo and label stay put — a margin-top
       pull-up like above would shove the logo/label under the header on this
       non-full-page shelf (it keeps minHeight:auto per the no-forced-full-page
       rule). Without an ArtHero theme the rules above don't match, which is
       what left the 56px header gap. */
    .deck-shelves-root[data-ds-recents-hidden="true"] > .ds-shelf[data-ds-hero-enabled="true"]:first-child:not([data-ds-recents-slot="true"]) [data-ds-per-shelf-hero="true"] {
      --ds-hero-top: -56px;
      --ds-hero-h: calc(100% + 56px);
    }
    /* FORCE: clean page-per-shelf (no margin, no hero fade). */
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"][data-ds-force-themes="true"] .ds-shelf {
      margin-bottom: 0 !important;
    }
    .deck-shelves-root[data-ds-theme-hero-fullscreen="true"][data-ds-force-themes="true"] .ds-shelf[data-ds-recents-slot="true"] [data-ds-per-shelf-hero="true"] {
      mask-image: none !important;
      -webkit-mask-image: none !important;
    }

    /* No Home Text — only engages under force (per user spec). */
    [data-ds-force-themes="true"][data-ds-theme-no-home-text="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-card-label,
    [data-ds-force-themes="true"][data-ds-theme-no-home-text="true"] .ds-shelf[data-ds-recents-slot="true"] .ds-promoted-hero-label {
      visibility: hidden !important;
    }
  `;
}
