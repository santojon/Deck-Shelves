import { gamepadDialogClasses } from '@decky/ui'

export function DeckModalStyles() {
  return (
    <style>{`
      .deck-shelves-modal-scope .${gamepadDialogClasses.GamepadDialogContent} .DialogHeader {
        margin-left: 15px;
      }

      .deck-shelves-modal-scope .${gamepadDialogClasses.ModalPosition} > .${gamepadDialogClasses.GamepadDialogContent} {
        background: radial-gradient(155.42% 100% at 0% 0%, #060a0e 0 0%, #0e141b 100%);
      }

      .deck-shelves-modal-scope .name-field .${gamepadDialogClasses.Field} {
        padding-bottom: 16px;
        padding-top: 0px;
      }

      .deck-shelves-modal-scope .${gamepadDialogClasses.Field}.${gamepadDialogClasses.WithBottomSeparatorStandard}::after {
        left: 1vw;
        right: 1vw;
      }

      .deck-shelves-modal-scope .field-item-container .${gamepadDialogClasses.Field} {
        padding: 10px calc(28px + 1.4vw);
      }

      .deck-shelves-modal-scope .field-item-container .${gamepadDialogClasses.FieldLabel} {
        color: #8b929a;
        font-size: 12px;
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

    `}</style>
  )
}
