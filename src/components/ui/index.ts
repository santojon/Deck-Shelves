/**
 * Shared UI primitives used across modals, the QAM panel, and shelves.
 * All components here are presentation-only and domain-agnostic — they
 * know about Decky UI conventions (modal scope, negative-margin fields,
 * `field-item-container`) but never about shelves, smart shelves,
 * filters, or any specific feature. Feature-specific compositions live
 * in their own folders (e.g. `qam/modals/editShelf/`).
 */
export { ModalShell } from './ModalShell'
export { FieldContainer } from './FieldContainer'
export { LabeledTextField } from './LabeledTextField'
export { CollapsibleSection } from './CollapsibleSection'
export { DSSliderField } from './DSSliderField'
export { PositionField, type HorizontalPosition } from './PositionField'
