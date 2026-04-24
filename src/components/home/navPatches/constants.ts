/**
 * Shared constants for the nav-patches family. `DIR_*` are the gamepad
 * button codes used by Steam's `FocusNavController.DispatchVirtualButtonClick`;
 * the `DS_*` marker names are property keys stamped on DOM/proto objects
 * to make each patch idempotent (installed at most once per target).
 */
export const DIR_DOWN = 10;
export const DIR_UP = 9;
export const DIR_LEFT = 11;
export const DIR_RIGHT = 12;
export const OPTIONS_BUTTON = 4;

export const DS_EDGE_PATCHED = "__ds_edge_patched__";
export const DS_EDGE_LISTENER = "__ds_edge_listener__";
export const DS_BRIDGE_ATTACHED = "__ds_bridge_attached__";
