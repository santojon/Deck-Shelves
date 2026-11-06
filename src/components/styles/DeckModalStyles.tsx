import { gamepadDialogClasses } from '../../runtime/host/decky'

// Last-known fallback values for the QAM panel classes. `quickAccessControlsClasses`
/* is undefined in SharedJSContext (where this style block renders), so we read
   the live tokens from localStorage — written by `DeckQAMStyles` on module
   load (QAM context HAS the classes). When the user has never opened the QAM,
   we still need a working CSS string, so the constants below are the seed.
   They will drift on Steam updates; the QAM-side bridge keeps them current. */
const FALLBACK_PANEL_SECTION = '_10BxjeNEe7t7ZWYcnl3-J6'
const FALLBACK_PANEL_SECTION_ROW = 'JAewWdUpiV3X2NTJykahD'
const FALLBACK_PANEL_SECTION_TITLE = '_321l150NTQBTsPZ9NnzZIz'

function strOr(v: unknown, fallback: string): string {
  return typeof v === 'string' && v ? v : fallback
}

function getPanelClasses(): { section: string; row: string; title: string } {
  try {
    const raw = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('ds_qam_panel_classes')
      : null
    if (raw) {
      const parsed = JSON.parse(raw) ?? {}
      return {
        section: strOr(parsed.PanelSection, FALLBACK_PANEL_SECTION),
        row:     strOr(parsed.PanelSectionRow, FALLBACK_PANEL_SECTION_ROW),
        title:   strOr(parsed.PanelSectionTitle, FALLBACK_PANEL_SECTION_TITLE),
      }
    }
  } catch {}
  return { section: FALLBACK_PANEL_SECTION, row: FALLBACK_PANEL_SECTION_ROW, title: FALLBACK_PANEL_SECTION_TITLE }
}

export function DeckModalStyles() {
  const { section: _panelSection, row: _panelSectionRow, title: _panelSectionTitle } = getPanelClasses()
  return (
    <style>{`
      /* Title-less dialogs (the first-run tour): the native header still renders
         an empty 28 px band when no title is given — collapse it. */
      .deck-shelves-dialog .ds-tour-modal .DialogHeader {
        display: none;
      }
      /* The title starts where our dialog content does. */
      .deck-shelves-dialog .DialogHeader {
        padding-inline-start: var(--ds-pad-row, 16px);
      }

      /* Toggle rows: re-skin the native Decky slate to the themed row surface
         (matches the config/Shortcuts rows) and drop the native separator. */
      .deck-shelves-dialog .${gamepadDialogClasses.Field}:has([role="checkbox"]) {
        background: var(--ds-surface, rgba(255, 255, 255, 0.04)) !important;
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.06));
        border-radius: var(--ds-radius-md, 6px);
      }
      .deck-shelves-dialog .${gamepadDialogClasses.Field}:has([role="checkbox"]).${gamepadDialogClasses.WithBottomSeparatorStandard}::after {
        display: none;
      }

      /* The client's line under a field row stops short of both ends; draw it
         across the whole row instead (toggle rows keep the card look above). */
      .deck-shelves-dialog .${gamepadDialogClasses.Field}:is(.${gamepadDialogClasses.WithBottomSeparatorStandard}, .${gamepadDialogClasses.WithBottomSeparatorThick})::after {
        display: none;
      }
      .deck-shelves-dialog .${gamepadDialogClasses.Field}.${gamepadDialogClasses.WithBottomSeparatorStandard}:not(:has([role="checkbox"])) {
        box-shadow: inset 0 -1px 0 var(--ds-border-strong, rgba(255, 255, 255, 0.1));
      }
      .deck-shelves-dialog .${gamepadDialogClasses.Field}.${gamepadDialogClasses.WithBottomSeparatorThick}:not(:has([role="checkbox"])) {
        box-shadow: inset 0 -2px 0 var(--ds-border-strong, rgba(255, 255, 255, 0.1));
      }

      /* In the editors the client's edge-to-edge field box gives way to the
         container's own side padding; rows keep our inset inside it. */
      .deck-shelves-dialog .deck-shelves-editor-fields .${gamepadDialogClasses.Field} {
        margin-inline: 0;
        width: auto;
        padding-inline: var(--ds-pad-row, 16px);
      }
      /* The name field: our inset on the block, none on the client's row. */
      .deck-shelves-dialog .deck-shelves-title-input {
        padding-inline: var(--ds-pad-row, 16px);
        margin-block: var(--ds-gap-sm, 6px);
      }
      .deck-shelves-dialog .deck-shelves-title-input .${gamepadDialogClasses.Field} {
        margin-inline: 0;
        width: auto;
        padding-inline: 0;
      }

      /* Collapsible sections (filter conditions, visibility rule groups): a card
         each, and a ring around the header row that holds the focus, since the
         client draws none on it. */
      .deck-shelves-dialog .ds-collapsible-box {
        margin-top: var(--ds-gap-sm, 6px);
        background: var(--ds-surface, rgba(255, 255, 255, 0.04));
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.06));
        border-radius: var(--ds-radius-md, 6px);
      }
      .deck-shelves-dialog .ds-collapsible-row {
        display: flex;
        align-items: center;
        min-height: 40px;
        border-radius: var(--ds-radius-md, 6px);
      }
      .deck-shelves-dialog .ds-collapsible-row:is(.gpfocuswithin, :focus-within) {
        background: rgba(255, 255, 255, 0.1);
        box-shadow: inset 0 0 0 2px var(--ds-accent, #4a9eff);
      }
      .deck-shelves-dialog .ds-collapsible-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ds-gap-md, 8px);
        padding: 8px var(--ds-pad-row, 16px);
        font-weight: 600;
        cursor: pointer;
        user-select: none;
        box-sizing: border-box;
      }
      .deck-shelves-dialog .ds-collapsible-badge {
        padding: 1px 7px;
        border-radius: var(--ds-radius-lg, 8px);
        background: var(--ds-surface-hi, rgba(255, 255, 255, 0.14));
        font-size: 10px;
        font-weight: 700;
      }
      .deck-shelves-dialog .ds-collapsible-content {
        padding: 2px 0 var(--ds-gap-md, 8px);
      }
      .deck-shelves-dialog .deck-shelves-divider {
        margin-inline: var(--ds-pad-row, 16px);
        border-top: 1px solid var(--ds-border-strong, rgba(255, 255, 255, 0.1));
      }

      .deck-shelves-dialog .deck-shelves-editor-fields .${_panelSection} {
        padding: 0;
      }
      .deck-shelves-dialog .deck-shelves-editor-fields .${_panelSectionTitle} {
        padding-left: 0;
        padding-right: 0;
      }
      .deck-shelves-dialog .deck-shelves-editor-fields .${_panelSectionRow} {
        padding: 0;
        margin: 0;
      }
      .deck-shelves-dialog .deck-shelves-editor-fields .${_panelSectionRow} input[type="text"] {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }

      /* Reduce the save/cancel button footer so tab content has more room. */
      .deck-shelves-dialog .${gamepadDialogClasses.BottomButtons} {
        padding-top: 4px;
        padding-bottom: 4px;
        gap: 6px;
      }
      .deck-shelves-dialog .${gamepadDialogClasses.BottomButtons} .${gamepadDialogClasses.Button} {
        padding-top: 6px;
        padding-bottom: 6px;
        min-height: 0;
      }

    `}</style>
  )
}
