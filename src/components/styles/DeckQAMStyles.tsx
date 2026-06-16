import { gamepadDialogClasses, quickAccessControlsClasses } from '../../runtime/host/decky'

// Bridge: `quickAccessControlsClasses` is undefined in SharedJSContext (where
// DeckModalStyles renders), but it IS defined here in the QAM context. Persist
// the three obfuscated class tokens we use in modal CSS to localStorage on
// module load so DeckModalStyles can pick them up via the same key without
// hardcoding values that drift on every Steam Big Picture update. Storage key
// must match the read in `DeckModalStyles.tsx`.
try {
  const w: any = (typeof window !== 'undefined') ? window : null
  const cls: any = quickAccessControlsClasses as any
  if (w?.localStorage && cls?.PanelSection) {
    w.localStorage.setItem('ds_qam_panel_classes', JSON.stringify({
      PanelSection: cls.PanelSection,
      PanelSectionRow: cls.PanelSectionRow,
      PanelSectionTitle: cls.PanelSectionTitle,
    }))
  }
} catch {}

export function DeckQAMStyles() {
  return (
    <style>{`
      /* ───── Deck Shelves design tokens ─────
         Single source of truth for colour / radius / spacing across QAM,
         sidecar, About page, Settings page and modals. Themes can
         override at the :root level via CSS Loader. */
      :where(.deck-shelves-qam-scope, .deck-shelves-settings-page, .deck-shelves-root, .deck-shelves-about, .deck-shelves-modal-scope) {
        --ds-surface:        rgba(255, 255, 255, 0.04);
        --ds-surface-hi:     rgba(255, 255, 255, 0.08);
        --ds-surface-row:    rgba(255, 255, 255, 0.03);
        --ds-border:         rgba(255, 255, 255, 0.06);
        --ds-border-strong:  rgba(255, 255, 255, 0.10);
        --ds-text:           #fff;
        --ds-text-dim:       rgba(255, 255, 255, 0.65);
        --ds-text-faint:     rgba(255, 255, 255, 0.45);
        --ds-accent:         var(--gpSystemLighterStill, rgba(120, 180, 255, 0.85));
        --ds-accent-soft:    rgba(120, 180, 255, 0.18);
        --ds-danger:         rgba(255, 110, 110, 0.95);
        --ds-danger-soft:    rgba(255, 80, 80, 0.10);
        --ds-warn:           rgba(255, 200, 90, 0.9);
        --ds-callout-note:        #5b9bd5;
        --ds-callout-note-soft:   rgba(91, 155, 213, 0.10);
        --ds-callout-tip:         #4caf50;
        --ds-callout-tip-soft:    rgba(76, 175, 80, 0.10);
        --ds-callout-caution:     #f0a742;
        --ds-callout-caution-soft:rgba(240, 167, 66, 0.10);
        --ds-radius-sm: 4px;
        --ds-radius-md: 6px;
        --ds-radius-lg: 8px;
        --ds-gap-xs:  4px;
        --ds-gap-sm:  6px;
        --ds-gap-md:  8px;
        --ds-gap-lg: 12px;
        --ds-pad-row:    "8px 10px";
        --ds-pad-card:   "12px 14px";
      }

      .deck-shelves-qam-scope {
        width: inherit;
        height: inherit;
        flex: 1 1 1px;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-content: stretch;
        overflow-x: hidden;
        position: relative;
      }
      .deck-shelves-qam-flex {
        display: flex;
        flex-direction: row;
        flex: 1 1 auto;
        align-items: stretch;
      }
      .deck-shelves-qam-main {
        width: 300px;
        min-width: 300px;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-content: stretch;
      }
      /* When expanded, scope and its constrained ancestors must allow the
         sidecar to overflow to the right (the Decky plugin tab wrapper
         normally clips at 300px). */
      .deck-shelves-qam-scope[data-ds-qam-expanded="1"] {
        overflow-x: visible;
        overflow-y: visible;
      }
      .deck-shelves-root:has(.deck-shelves-qam-scope[data-ds-qam-expanded="1"]),
      .deck-shelves-root:has(.deck-shelves-qam-scope[data-ds-qam-expanded="1"]) ~ *,
      [id^="quickaccess_content_"]:has(.deck-shelves-qam-scope[data-ds-qam-expanded="1"]),
      [id^="quickaccess_content_"]:has(.deck-shelves-qam-scope[data-ds-qam-expanded="1"]) > * {
        overflow: visible !important;
      }

      .deck-shelves-qam-scope .${quickAccessControlsClasses.PanelSection} {
        padding: 0px;
      }
      .deck-shelves-qam-scope .${quickAccessControlsClasses.PanelSectionTitle} {
        margin-top: 3px;
        margin-left: 5px;
      }

      .deck-shelves-qam-scope .${gamepadDialogClasses.FieldChildrenInner} {
        margin: 0px 16px;
      }
      .deck-shelves-qam-scope .${gamepadDialogClasses.FieldLabel} {
        margin-left: 16px;
      }

      .deck-shelves-qam-scope .add-shelf-btn .${gamepadDialogClasses.Field}.${gamepadDialogClasses.WithBottomSeparatorStandard}::after,
      .deck-shelves-qam-scope .deck-shelves-action-btn .${gamepadDialogClasses.Field}.${gamepadDialogClasses.WithBottomSeparatorStandard}::after {
        display: none;
      }
      .deck-shelves-qam-scope .add-shelf-btn .${gamepadDialogClasses.FieldLabel},
      .deck-shelves-qam-scope .deck-shelves-action-btn .${gamepadDialogClasses.FieldLabel} {
        display: none;
      }
      .deck-shelves-qam-scope .add-shelf-btn .${gamepadDialogClasses.FieldChildrenInner},
      .deck-shelves-qam-scope .deck-shelves-action-btn .${gamepadDialogClasses.FieldChildrenInner} {
        width: calc(100% - 32px);
      }

      .deck-shelves-qam-scope .deck-shelves-separator {
        width: 100%;
        height: 1px;
        background: #23262e;
        margin: 0;
      }

      /* Side nav row — Netflix / macOS dock style focus animation.
         No gpfocus ring; instead a thick left bar, a strong tinted
         gradient, a soft glow, and a tiny scale-bump that slides in
         from the left. rem / em / vw / clamp so it scales handheld →
         docked TV → 4K. */
      @keyframes ds-sidenav-bump {
        from { transform: translateX(-0.5em) scale(0.98); opacity: 0.75; }
        to   { transform: translateX(0)      scale(1.05); opacity: 1; }
      }
      .ds-sidenav-row {
        transition: transform 180ms cubic-bezier(0.2, 0.85, 0.3, 1.2),
                    background 220ms ease,
                    box-shadow 220ms ease;
        will-change: transform;
        transform-origin: left center;
        border-radius: 6px;
      }
      .ds-sidenav-row--focused {
        background: linear-gradient(
          to right,
          var(--gpSystemLighterStill, rgba(255, 255, 255, 0.35)) 0%,
          var(--gpSystemLighter,      rgba(255, 255, 255, 0.18)) 55%,
          rgba(255, 255, 255, 0.02) 100%
        ) !important;
        box-shadow:
          -10px 0 24px -4px var(--gpSystemLighterStill, rgba(255, 255, 255, 0.45)),
          inset 4px 0 0 0 var(--gpSystemLighterStill, rgba(255, 255, 255, 0.95))
          !important;
        animation: ds-sidenav-bump 200ms cubic-bezier(0.2, 0.85, 0.3, 1.2) forwards;
      }
      .ds-sidenav-row--focused span {
        color: white !important;
        font-weight: 700 !important;
        text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
      }

      /* Quick Search pill — strip the default Decky TextField chrome so
         the rendered input looks like a typed-text pill while still
         being a real input (Steam Deck shows the virtual keyboard only
         on focused VISIBLE inputs). */
      .ds-search-pill .${gamepadDialogClasses.Field} {
        padding: 0;
        margin: 0;
        background: transparent;
        border: none;
        width: 100%;
      }
      .ds-search-pill .${gamepadDialogClasses.Field} input {
        background: transparent;
        border: none;
        outline: none;
        color: white;
        font-size: inherit;
        font-weight: 600;
        text-align: center;
        padding: 0;
        width: 100%;
        min-width: 0;
      }
      .ds-search-pill .${gamepadDialogClasses.FieldChildrenInner} {
        background: transparent;
        width: 100%;
      }
      /* Inside the sidecar, the per-section divider should stop short of
         the eye-button column so it doesn't run under the section eye. */
      .ds-sidecar-body .deck-shelves-separator {
        width: calc(100% - 60px);
      }

      .deck-shelves-qam-scope .deck-shelves-section-header {
        font-weight: 600;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #b8bcbf;
        padding: 8px 16px 6px;
      }

      .deck-shelves-qam-scope .deck-shelves-shelf-list {
        padding: 0;
      }
      /* Force ellipsis on shelf titles within ReorderableList entries */
      .deck-shelves-qam-scope .deck-shelves-shelf-list .${gamepadDialogClasses.Field} {
        overflow: hidden;
      }
      .deck-shelves-qam-scope .deck-shelves-shelf-list .${gamepadDialogClasses.Field} > div {
        overflow: hidden;
        min-width: 0;
      }
      .deck-shelves-qam-scope .deck-shelves-shelf-list .${gamepadDialogClasses.FieldChildrenInner} {
        overflow: hidden;
        min-width: 0;
        flex-wrap: nowrap !important;
      }
      .deck-shelves-qam-scope .deck-shelves-shelf-list .${gamepadDialogClasses.FieldLabel} {
        overflow: hidden;
        min-width: 0;
        flex: 1 1 0;
      }

      .deck-shelves-qam-scope .deck-shelves-label-cont {
        display: flex;
        align-items: center;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow: hidden;
      }
      .deck-shelves-qam-scope .deck-shelves-hidden-icon {
        margin-right: 8px;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        opacity: 0.85;
      }
      .deck-shelves-qam-scope .deck-shelves-label-text {
        white-space: nowrap;
        min-width: 0;
        max-width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.3;
        flex: 1 1 0;
      }
      .deck-shelves-qam-scope .deck-shelves-hidden {
        opacity: 0.56;
      }

      .deck-shelves-qam-scope .no-sep .${gamepadDialogClasses.FieldLabel},
      .deck-shelves-qam-scope .no-sep .${gamepadDialogClasses.Field}.${gamepadDialogClasses.WithBottomSeparatorStandard}::after,
      .deck-shelves-qam-scope .no-sep.${gamepadDialogClasses.Field}.${gamepadDialogClasses.WithBottomSeparatorStandard}::after {
        display: none;
      }
      .deck-shelves-qam-scope .no-sep .${gamepadDialogClasses.FieldChildrenInner},
      .deck-shelves-qam-scope .no-sep .${gamepadDialogClasses.FieldChildrenWithIcon} {
        width: 100%;
        margin: 0;
      }

      .deck-shelves-qam-scope .deck-shelves-empty {
        padding: 10px 16px;
        color: #8b929a;
        font-size: 14px;
      }

      .deck-shelves-qam-scope .ds-collapsible-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px 6px;
        cursor: pointer;
        font-weight: 600;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        color: #b8bcbf;
        user-select: none;
        width: 100%;
        box-sizing: border-box;
        border-radius: 0;
        transition: background 0.1s;
      }
      .deck-shelves-qam-scope .ds-collapsible-header:focus,
      .deck-shelves-qam-scope .ds-collapsible-header.gpfocus,
      .deck-shelves-qam-scope .ds-collapsible-header [data-cs-gpfocused="true"],
      .deck-shelves-qam-scope .ds-collapsible-header:focus-within {
        background: rgba(255, 255, 255, 0.1);
        outline: none;
      }
      .deck-shelves-qam-scope .ds-collapsible-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: var(--ds-surface-hi, rgba(255,255,255,0.14));
        border-radius: var(--ds-radius-lg, 8px);
        padding: 1px 7px;
        font-size: 10px;
        font-weight: 700;
        margin-right: 4px;
        color: #fff;
      }

      /* ───── Shared "card" surface used by Settings details + About
         page + modals. Uses --ds-* tokens so themes can override. */
      .ds-settings-section,
      .ds-about-section {
        display: flex;
        flex-direction: column;
        gap: var(--ds-gap-md, 8px);
        padding: 12px 14px;
        margin-bottom: var(--ds-gap-md, 8px);
        border-radius: var(--ds-radius-lg, 8px);
        background: var(--ds-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.06));
      }
      .ds-settings-section__header {
        display: flex;
        align-items: flex-start;
        gap: var(--ds-gap-lg, 12px);
      }
      .ds-settings-section__heading { flex: 1; min-width: 0; }
      .ds-settings-section__title {
        font-weight: 600;
        font-size: 14px;
        color: var(--ds-text, #fff);
      }
      .ds-settings-section__desc {
        font-size: 12px;
        color: var(--ds-text-dim, rgba(255, 255, 255, 0.65));
        margin-top: 4px;
        line-height: 1.35;
      }
      .ds-settings-section__trailing { flex-shrink: 0; display: inline-flex; align-items: center; gap: var(--ds-gap-sm, 6px); }
      .ds-settings-section__body { display: flex; flex-direction: column; gap: var(--ds-gap-md, 8px); }
      .ds-settings-row {
        display: flex;
        align-items: center;
        gap: var(--ds-gap-md, 10px);
        padding: 8px 10px;
        border-radius: var(--ds-radius-md, 6px);
        background: var(--ds-surface-row, rgba(255, 255, 255, 0.03));
      }
      .ds-settings-row--danger {
        background: var(--ds-danger-soft, rgba(255, 80, 80, 0.10));
        border: 1px solid rgba(255, 80, 80, 0.25);
      }

      /* ───── Shared button primitives. Compose with default
         DialogButton — these add layout, not chrome (so the underlying
         Decky DialogButton colour/focus rules continue to apply). */
      .ds-btn {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        gap: var(--ds-gap-xs, 4px);
        padding: 0 12px !important;
        height: 32px !important;
        min-width: 0 !important;
        font-size: 13px !important;
      }
      .ds-btn--compact {
        height: 28px !important;
        padding: 0 10px !important;
        font-size: 12px !important;
      }
      .ds-btn--icon {
        width: 32px !important;
        padding: 0 !important;
      }
      .ds-btn--icon-compact {
        width: 28px !important;
        height: 28px !important;
        padding: 0 !important;
      }
      .ds-btn--danger {
        color: var(--ds-danger, rgba(255, 110, 110, 0.95)) !important;
      }

      /* Log row focus state — visible highlight on gamepad focus */
      .ds-log-row.gpfocus,
      .ds-log-row:focus,
      .ds-log-row:focus-within,
      .ds-log-row[data-cs-gpfocused="true"] {
        background: var(--ds-surface-hi, rgba(255,255,255,0.10)) !important;
        outline: none;
      }

      /* Chip / badge used for BUILT-IN / ACTIVE / log level markers */
      .ds-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 6px;
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        border-radius: 999px;
        background: var(--ds-surface-hi, rgba(255, 255, 255, 0.10));
        color: var(--ds-text, #fff);
      }
      .ds-chip--accent {
        background: var(--ds-accent-soft, rgba(120, 180, 255, 0.18));
        color: var(--ds-accent, rgba(120, 180, 255, 0.95));
      }
      .ds-chip--builtin {
        background: rgba(120, 220, 120, 0.18);
        color: rgba(180, 240, 180, 0.95);
      }
      .ds-settings-section__header {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .ds-settings-section__heading { flex: 1; min-width: 0; }
      .ds-settings-section__title {
        font-weight: 600;
        font-size: 14px;
        color: #fff;
      }
      .ds-settings-section__desc {
        font-size: 12px;
        opacity: 0.65;
        margin-top: 4px;
        line-height: 1.35;
      }
      .ds-settings-section__trailing { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; }
      .ds-settings-section__body { display: flex; flex-direction: column; gap: 8px; }
      .ds-settings-row {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 10px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.03);
      }
      .ds-settings-row__main { flex: 1; min-width: 0; }
      .ds-settings-row__name { font-weight: 600; font-size: 13px; }
      .ds-settings-row__sub { opacity: 0.55; font-size: 11px; margin-top: 2px; }
      .ds-settings-row__actions { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; }
      .ds-settings-row--danger {
        background: rgba(255, 80, 80, 0.08);
        border: 1px solid rgba(255, 80, 80, 0.25);
      }

      /* Expand-toggle button (always visible, top of panel). */
      .deck-shelves-qam-scope .deck-shelves-qam-expand-toggle {
        display: inline-flex;
        align-items: center;
        margin: 6px 8px;
        padding: 4px 10px;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.06);
        color: #d6d9dc;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        cursor: pointer;
        user-select: none;
        align-self: flex-end;
      }
      .deck-shelves-qam-scope .deck-shelves-qam-expand-toggle.gpfocus,
      .deck-shelves-qam-scope .deck-shelves-qam-expand-toggle:focus,
      .deck-shelves-qam-scope .deck-shelves-qam-expand-toggle:focus-within {
        background: rgba(255, 255, 255, 0.14);
        outline: none;
      }

      /* Sidecar panel — mirrors the native Friends & Chat second-column
         pattern. Rendered via React Portal directly into the QAM body so
         Steam's gamepad nav sees it as a top-level focusable sibling
         (rather than buried inside the constrained Decky plugin tab
         wrapper). position: fixed lays it over the otherwise-empty right
         portion of the QAM panel (left edge ~351 = 51 tab strip +
         300 DS plugin tab width). */
      .deck-shelves-qam-sidecar {
        position: absolute;
        left: 300px;
        top: 0;
        width: 503px;
        height: 440px;
        /* No explicit background -- Steam does not expose theme CSS vars
           on documentElement (CDP confirmed empty main-editor-bg-color /
           gamepad-ui-bg-color), so we let the QAM popup own gradient
           show through instead of forcing the legacy rgb(14,20,27). */
        background: transparent;
        border-left: 1px solid rgba(255, 255, 255, 0.06);
        padding: 0;
        z-index: 5;
        box-sizing: border-box;
      }
      .ds-sidecar-title {
        position: absolute;
        /* Nudge the title up so it sits roughly at the same vertical
           band as Decky's "Deck Shelves" header in the QAM frame above. */
        top: -8px;
        left: 0;
        right: 0;
        height: 32px;
        padding: 4px 16px;
        font-weight: 700;
        font-size: 18px;
        color: #ffffff;
        letter-spacing: 0.3px;
        background: transparent;
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        box-sizing: border-box;
        z-index: 2;
      }
      .ds-sidecar-body {
        position: absolute;
        top: 24px;
        left: 0;
        right: 0;
        bottom: 16px;
        overflow-y: auto;
        padding: 16px;
        box-sizing: border-box;
      }
      .deck-shelves-qam-sidecar-placeholder {
        color: #8b929a;
        font-size: 13px;
        text-align: center;
        margin-top: 40%;
      }

      /* Sidecar General tab — hideable rows + eye buttons. */
      .ds-hide-row {
        display: flex;
        align-items: center;
        width: 100%;
        gap: 8px;
        padding-right: 8px;
        box-sizing: border-box;
        position: relative;
      }
      /* The Decky-generated Field wrapper becomes the first flex child here,
         so give it the grow space and let the eye button take the rest. */
      .ds-hide-row > :first-child {
        flex: 1 1 auto;
        min-width: 0;
      }
      /* Strip Decky's bottom separator on toggles that sit inside a
         hide-row, then redraw it ourselves only across the toggle column
         — so the line stops short of the eye button instead of running
         under it. */
      .ds-hide-row .${gamepadDialogClasses.WithBottomSeparatorStandard}::after {
        display: none;
      }
      .ds-hide-row::after {
        content: '';
        position: absolute;
        left: 16px;
        right: 60px;
        bottom: 0;
        height: 1px;
        background: rgba(255, 255, 255, 0.06);
        pointer-events: none;
      }
      .ds-eye-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 36px;
        min-width: 44px;
        flex: 0 0 auto;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.04);
        color: #b8bcbf;
        cursor: pointer;
        user-select: none;
      }
      .ds-eye-btn.gpfocus,
      .ds-eye-btn:focus,
      .ds-eye-btn:focus-within {
        background: rgba(255, 255, 255, 0.20);
        color: #ffffff;
        outline: 2px solid rgba(255, 255, 255, 0.45);
        outline-offset: -2px;
      }
      .ds-eye-btn[data-ds-eye-state="hidden"] {
        opacity: 0.55;
      }
      .ds-eye-btn-section {
        margin: 8px 8px 0 0;
      }
    `}</style>
  )
}
