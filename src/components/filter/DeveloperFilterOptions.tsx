import { useEffect, useState } from "react";
import { DialogButton, Focusable } from "../../runtime/host/decky";
import i18n from "../../i18n";
import { getUniqueDevelopers, preloadDeveloperData, getAllAppOverviews } from "../../steam";

export default function DeveloperFilterOptions({ selected, onChange }: { selected: string[]; onChange: (devs: string[]) => void }) {
  const t = i18n.t.bind(i18n);
  const [allDevs, setAllDevs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (scanned) return;
    setLoading(true);
    setScanned(true);
    getAllAppOverviews()
      .then((apps) => {
        const ids = apps.map((a) => a.appid);
        return preloadDeveloperData(ids).then(() => ids);
      })
      .then((ids) => {
        setAllDevs(getUniqueDevelopers(ids));
      })
      .catch(() => setAllDevs([]))
      .finally(() => setLoading(false));
  }, [scanned]);

  const selectedSet = new Set(selected);

  if (loading) {
    return <div style={{ padding: "6px 0", color: "var(--ds-text-dim, #8b9ab5)", fontSize: 12 }}>{t("filter_developer_loading")}</div>;
  }
  if (allDevs.length === 0) {
    return <div style={{ padding: "6px 0", color: "var(--ds-text-dim, #8b9ab5)", fontSize: 12 }}>{t("filter_developer_empty")}</div>;
  }

  return (
    <Focusable style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "4px 0", width: "100%", maxHeight: 260, overflowY: "auto" }}>
      {allDevs.map((dev) => {
        const checked = selectedSet.has(dev);
        const toggle = () => {
          const next = new Set(selectedSet);
          if (checked) next.delete(dev); else next.add(dev);
          onChange(Array.from(next));
        };
        return (
          <DialogButton
            key={dev}
            onClick={toggle}
            onOKButton={toggle}
            style={{ width: "100%", minHeight: 44, padding: "8px 6px", fontSize: 13, whiteSpace: "normal", wordBreak: "break-word", lineHeight: "18px" }}
          >
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ width: 14, textAlign: "center", flexShrink: 0, color: checked ? "#4caf50" : "rgba(255,255,255,0.3)" }}>
                {checked ? "✓" : "·"}
              </span>
              <span>{dev}</span>
            </span>
          </DialogButton>
        );
      })}
    </Focusable>
  );
}
