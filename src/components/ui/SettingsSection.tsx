import React from "react";
import { Focusable } from "../../runtime/host/decky";
import { flowChildrenProps } from "../../core/steamOSVersion";

export interface SettingsSectionProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  children: React.ReactNode;
  vertical?: boolean;
}

export function SettingsSection({ title, description, icon, trailing, children, vertical = true }: SettingsSectionProps) {
  const header = (title || description || trailing) ? (
    <div className="ds-settings-section__header">
      <div className="ds-settings-section__heading">
        {title ? <div className="ds-settings-section__title" style={icon ? { display: "flex", alignItems: "center", gap: 6 } : undefined}>{icon}{title}</div> : null}
        {description ? <div className="ds-settings-section__desc">{description}</div> : null}
      </div>
      {trailing ? <div className="ds-settings-section__trailing">{trailing}</div> : null}
    </div>
  ) : null;
  if (vertical) {
    return (
      <Focusable {...flowChildrenProps("vertical")} className="ds-settings-section">
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
