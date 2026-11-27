import { gamepadDialogClasses } from '../../runtime/host/decky'

// quickAccessControlsClasses is undefined in SharedJSContext, so read the tokens the QAM saved.
const FALLBACK_PANEL_SECTION = '_10BxjeNEe7t7ZWYcnl3-J6'
const FALLBACK_PANEL_SECTION_ROW = 'JAewWdUpiV3X2NTJykahD'
const FALLBACK_PANEL_SECTION_TITLE = '_321l150NTQBTsPZ9NnzZIz'

function strOr(v: unknown, fallback: string, key: string): string {
  return typeof v === 'string' && v && v !== key ? v : fallback
}

function getPanelClasses(): { section: string; row: string; title: string } {
  try {
    const raw = (typeof window !== 'undefined' && window.localStorage)
      ? window.localStorage.getItem('ds_qam_panel_classes')
      : null
    if (raw) {
      const parsed = JSON.parse(raw) ?? {}
      return {
        section: strOr(parsed.PanelSection, FALLBACK_PANEL_SECTION, 'PanelSection'),
        row:     strOr(parsed.PanelSectionRow, FALLBACK_PANEL_SECTION_ROW, 'PanelSectionRow'),
        title:   strOr(parsed.PanelSectionTitle, FALLBACK_PANEL_SECTION_TITLE, 'PanelSectionTitle'),
      }
    }
  } catch {}
  return { section: FALLBACK_PANEL_SECTION, row: FALLBACK_PANEL_SECTION_ROW, title: FALLBACK_PANEL_SECTION_TITLE }
}

export function DeckModalStyles() {
  const { section: _panelSection, row: _panelSectionRow, title: _panelSectionTitle } = getPanelClasses()
  return (
    <style>{`
      .deck-shelves-dialog .ds-tour-modal .DialogHeader {
        display: none;
      }
      .deck-shelves-dialog .DialogHeader {
        padding-inline-start: var(--ds-pad-row, 16px);
      }

      .deck-shelves-dialog .${gamepadDialogClasses.Field}:has([role="checkbox"]) {
        background: var(--ds-surface, rgba(255, 255, 255, 0.04)) !important;
        border: 1px solid var(--ds-border, rgba(255, 255, 255, 0.06));
        border-radius: var(--ds-radius-md, 6px);
      }
      .deck-shelves-dialog .${gamepadDialogClasses.Field}:has([role="checkbox"]).${gamepadDialogClasses.WithBottomSeparatorStandard}::after {
        display: none;
      }

      .deck-shelves-dialog .${gamepadDialogClasses.Field}:is(.${gamepadDialogClasses.WithBottomSeparatorStandard}, .${gamepadDialogClasses.WithBottomSeparatorThick})::after {
        display: none;
      }
      .deck-shelves-dialog .${gamepadDialogClasses.Field}.${gamepadDialogClasses.WithBottomSeparatorStandard}:not(:has([role="checkbox"])) {
        box-shadow: inset 0 -1px 0 var(--ds-border-strong, rgba(255, 255, 255, 0.1));
      }
      .deck-shelves-dialog .${gamepadDialogClasses.Field}.${gamepadDialogClasses.WithBottomSeparatorThick}:not(:has([role="checkbox"])) {
        box-shadow: inset 0 -2px 0 var(--ds-border-strong, rgba(255, 255, 255, 0.1));
      }

      .deck-shelves-dialog .deck-shelves-editor-fields .${gamepadDialogClasses.Field} {
        margin-inline: 0;
        width: auto;
        padding-inline: var(--ds-pad-row, 16px);
      }
      .deck-shelves-dialog .deck-shelves-title-input {
        padding-inline: var(--ds-pad-row, 16px);
        margin-block: var(--ds-gap-sm, 6px);
      }
      .deck-shelves-dialog .deck-shelves-title-input .${gamepadDialogClasses.Field} {
        margin-inline: 0;
        width: auto;
        padding-inline: 0;
      }

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

      .deck-shelves-dialog .ds-editor-tabs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ds-gap-xs, 4px);
        padding: var(--ds-gap-xs, 4px) 0 var(--ds-gap-md, 8px);
      }
      .deck-shelves-dialog .ds-editor-tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 34px;
        padding: 0 12px;
        border-radius: 17px;
        box-sizing: border-box;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        color: #dcdedf;
        cursor: pointer;
        user-select: none;
      }
      .deck-shelves-dialog .ds-editor-tab[data-active="1"] {
        color: #ffffff;
        background: rgba(255, 255, 255, 0.15);
      }
      .deck-shelves-dialog .ds-editor-tab:is(.gpfocus, :focus-visible) {
        box-shadow: inset 0 0 0 2px var(--ds-accent, #4a9eff);
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


    `}</style>
  )
}
