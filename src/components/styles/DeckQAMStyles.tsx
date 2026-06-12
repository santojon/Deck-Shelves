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
        background: rgba(255,255,255,0.14);
        border-radius: 8px;
        padding: 1px 7px;
        font-size: 10px;
        font-weight: 700;
        margin-right: 4px;
        color: #fff;
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
        background: rgb(14, 20, 27);
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
        background: rgb(14, 20, 27);
        border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        box-sizing: border-box;
        z-index: 2;
      }
      .ds-sidecar-body {
        position: absolute;
        top: 24px;
        left: 0;
        right: 0;
        /* Leave a visual gap below the body so the last item never
           sits flush against the sidecar's bottom edge. We don't use
           padding-bottom for this because dpad navigation can't move
           into padding space — keeping the gap *outside* the scrollable
           area means the user sees breathing room without dpad ever
           "missing" a target. */
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
