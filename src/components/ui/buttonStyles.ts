import type { CSSProperties } from "react";

// Button looks set through the style attribute: Decky's DialogButton doesn't
// forward className, so its layout has to sit beside its own inline style.

export const BTN_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
  padding: "0 12px",
  height: 32,
  minWidth: 0,
  fontSize: 13,
};

export const BTN_COMPACT_STYLE: CSSProperties = {
  ...BTN_STYLE,
  padding: "0 10px",
  height: 28,
  fontSize: 12,
};

export const BTN_ICON_STYLE: CSSProperties = {
  ...BTN_STYLE,
  width: 32,
  padding: 0,
};

export const BTN_ICON_COMPACT_STYLE: CSSProperties = {
  ...BTN_STYLE,
  width: 28,
  height: 28,
  padding: 0,
};
