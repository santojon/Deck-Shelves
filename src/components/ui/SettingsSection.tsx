import React from "react";
import { Focusable } from "../../runtime/host/decky";

export interface SettingsSectionProps {
  title?: string;
  description?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  // When set, the whole section becomes a Focusable container with
  // flow-children="vertical" so gamepad nav can step into rows.
  vertical?: boolean;
}

// Themable card-style section. Visual tokens come from `.ds-settings-section`
// in `DeckQAMStyles` so CSS Loader themes can override them, matching the
// way `CollapsibleSection` is themed.
export function SettingsSection({ title, description, trailing, children, vertical = true }: SettingsSectionProps) {
  const header = (title || description || trailing) ? (
    <div className="ds-settings-section__header">
      <div className="ds-settings-section__heading">
        {title ? <div className="ds-settings-section__title">{title}</div> : null}
        {description ? <div className="ds-settings-section__desc">{description}</div> : null}
      </div>
      {trailing ? <div className="ds-settings-section__trailing">{trailing}</div> : null}
    </div>
  ) : null;
  if (vertical) {
    return (
      <Focusable flow-children="vertical" className="ds-settings-section">
        {header}
        <div className="ds-settings-section__body">{children}</div>
      </Focusable>
    );
  }
  return (
    <div className="ds-settings-section">
      {header}
      <div className="ds-settings-section__body">{children}</div>
    </div>
  );
}
