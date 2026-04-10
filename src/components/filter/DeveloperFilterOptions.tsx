import { useEffect, useState } from "react";
import { PanelSectionRow, ToggleField } from "@decky/ui";
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

  return (
    <>
      {loading && (
        <PanelSectionRow>
          <div style={{ padding: "6px 0", color: "#8b9ab5", fontSize: 12 }}>{t("filter_developer_loading")}</div>
        </PanelSectionRow>
      )}
      {!loading && allDevs.length === 0 && (
        <PanelSectionRow>
          <div style={{ padding: "6px 0", color: "#8b9ab5", fontSize: 12 }}>{t("filter_developer_empty")}</div>
        </PanelSectionRow>
      )}
      {allDevs.map((dev) => (
        <PanelSectionRow key={dev}>
          <ToggleField
            label={dev}
            checked={selectedSet.has(dev)}
            onChange={(val: boolean) => {
              const next = new Set(selectedSet);
              if (val) next.add(dev); else next.delete(dev);
              onChange(Array.from(next));
            }}
            bottomSeparator="none"
          />
        </PanelSectionRow>
      ))}
    </>
  );
}
