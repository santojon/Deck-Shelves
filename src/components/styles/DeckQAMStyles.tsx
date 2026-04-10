import { gamepadDialogClasses, quickAccessControlsClasses } from '@decky/ui'

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
      }

      .deck-shelves-qam-scope .deck-shelves-empty {
        padding: 10px 16px;
        color: #8b929a;
        font-size: 14px;
      }
    `}</style>
  )
}
