import { gamepadDialogClasses } from '@decky/ui'

// Hardcoded minified class names (quickAccessControlsClasses is undefined in SharedJSContext)
const _panelSection = '_10BxjeNEe7t7ZWYcnl3-J6'
const _panelSectionRow = 'JAewWdUpiV3X2NTJykahD'
const _panelSectionTitle = '_321l150NTQBTsPZ9NnzZIz'

export function DeckModalStyles() {
  return (
    <style>{`
      .deck-shelves-modal-scope .${gamepadDialogClasses.GamepadDialogContent} .DialogHeader {
        margin-left: 15px;
      }

      .deck-shelves-modal-scope .name-field .${gamepadDialogClasses.Field} {
        padding-bottom: 16px;
        padding-top: 0px;
      }

      .deck-shelves-modal-scope .${gamepadDialogClasses.Field}.${gamepadDialogClasses.WithBottomSeparatorStandard}::after {
        left: 0;
        right: 0;
      }

      .deck-shelves-modal-scope .field-item-container .${gamepadDialogClasses.Field} {
        padding-left: 0;
        padding-right: 0;
      }

      .deck-shelves-modal-scope .field-item-container .${gamepadDialogClasses.FieldLabel} {
        color: #8b929a;
        font-size: 12px;
      }

      .deck-shelves-modal-scope .field-item-container .${_panelSection} {
        padding: 0;
      }
      .deck-shelves-modal-scope .field-item-container .${_panelSectionTitle} {
        padding-left: 0;
        padding-right: 0;
      }
      .deck-shelves-modal-scope .field-item-container .${_panelSectionRow} {
        padding: 0;
        margin: 0;
      }
      .deck-shelves-modal-scope .field-item-container .${_panelSectionRow} input[type="text"] {
        width: 100%;
        min-width: 0;
        box-sizing: border-box;
      }


      .deck-shelves-modal-scope .deck-shelves-wide-field,
      .deck-shelves-modal-scope .deck-shelves-wide-field > div,
      .deck-shelves-modal-scope .deck-shelves-wide-field input {
        width: 100%;
        min-width: 0;
      }

      .deck-shelves-modal-scope .deck-shelves-extra-wide-field {
        width: calc(100% + 56px);
        margin-right: -56px;
        min-width: 0;
      }
      .deck-shelves-modal-scope .deck-shelves-extra-wide-field > div,
      .deck-shelves-modal-scope .deck-shelves-extra-wide-field input {
        width: 100%;
        min-width: 0;
      }

      .deck-shelves-modal-scope .deck-shelves-filter-text-field {
        width: calc(100% - 6px);
        min-width: 0;
      }
      .deck-shelves-modal-scope .deck-shelves-filter-text-field > div,
      .deck-shelves-modal-scope .deck-shelves-filter-text-field input {
        width: 100%;
        min-width: 0;
      }

      /* Reduce the save/cancel button footer so tab content has more room. */
      .deck-shelves-modal-scope .${gamepadDialogClasses.BottomButtons} {
        padding-top: 4px;
        padding-bottom: 4px;
        gap: 6px;
      }
      .deck-shelves-modal-scope .${gamepadDialogClasses.BottomButtons} .${gamepadDialogClasses.Button} {
        padding-top: 6px;
        padding-bottom: 6px;
        min-height: 0;
      }

    `}</style>
  )
}
