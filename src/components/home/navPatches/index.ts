/**
 * Navigation tree patches for shelf integration with Steam's GamepadUI.
 *
 * - `reparentNavTreeNodes` — moves our shelf nav nodes to the correct
 *   position in Steam's focus navigation tree.
 * - `patchMenuButton` — intercepts Options/Menu button to show our
 *   game context menu when a shelf card is focused.
 * - `patchShelfEdgeNavigation` — prevents D-pad from escaping the shelf
 *   row horizontally and blocks DOWN wrap on the last shelf.
 * - `installVerticalFocusBridge` — post-nav focus bridge between our
 *   mount and its neighbors (UP/DOWN).
 */
export { reparentNavTreeNodes } from "./reparent";
export { patchMenuButton } from "./menuButton";
export { patchShelfEdgeNavigation } from "./edgeNavigation";
export { installVerticalFocusBridge } from "./verticalBridge";
