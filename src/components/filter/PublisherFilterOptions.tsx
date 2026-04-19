import { useEffect, useState } from "react";
import { ToggleField } from "@decky/ui";
import i18n from "../../i18n";
import { getUniquePublishers, preloadPublisherData, getAllAppOverviews } from "../../steam";

export default function PublisherFilterOptions({ selected, onChange }: { selected: string[]; onChange: (pubs: string[]) => void }) {
  const t = i18n.t.bind(i18n);
  const [allPubs, setAllPubs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    if (scanned) return;
    setLoading(true);
    setScanned(true);
    getAllAppOverviews()
      .then((apps) => {
        const ids = apps.map((a) => a.appid);
        return preloadPublisherData(ids).then(() => ids);
      })
      .then((ids) => {
        setAllPubs(getUniquePublishers(ids));
      })
      .catch(() => setAllPubs([]))
      .finally(() => setLoading(false));
  }, [scanned]);

  const selectedSet = new Set(selected);

  return (
    <>
      {loading && (
        <div>
          <div style={{ padding: "6px 0", color: "#8b9ab5", fontSize: 12 }}>{t("filter_publisher_loading")}</div>
        </div>
      )}
      {!loading && allPubs.length === 0 && (
        <div>
          <div style={{ padding: "6px 0", color: "#8b9ab5", fontSize: 12 }}>{t("filter_publisher_empty")}</div>
        </div>
      )}
      {allPubs.map((pub) => (
        <div key={pub}>
          <ToggleField
            label={pub}
            checked={selectedSet.has(pub)}
            onChange={(val: boolean) => {
              const next = new Set(selectedSet);
              if (val) next.add(pub); else next.delete(pub);
              onChange(Array.from(next));
            }}
            bottomSeparator="none"
          />
        </div>
      ))}
    </>
  );
}
