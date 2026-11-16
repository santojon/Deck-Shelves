import { useTranslation } from "react-i18next";
import pkg from "../../../package.json";

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
