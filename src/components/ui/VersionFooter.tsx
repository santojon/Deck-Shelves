import { useTranslation } from "react-i18next";
import pkg from "../../../package.json";

/* Standardized, unobtrusive footer that surfaces the running plugin version.
   Rendered at the bottom of the QAM panel and every full page (About /
   Settings) so the version is always discoverable — e.g. when filling in a
   bug report. Purely informational: no focusable/interactive elements, so it
   is safe to drop into the gamepad-navigated QAM without altering focus flow. */
export function VersionFooter() {
  const { t } = useTranslation();
  return (
    <div
      className="ds-version-footer"
      data-ds-version={pkg.version}
      style={{
        textAlign: "center",
        padding: "6px 12px calc(env(safe-area-inset-bottom, 0px) + 8px)",
        fontSize: 11,
        lineHeight: "15px",
        color: "var(--ds-text-faint, #6b7076)",
      }}
    >
      Deck Shelves · {t("about_version")} {pkg.version}
    </div>
  );
}
