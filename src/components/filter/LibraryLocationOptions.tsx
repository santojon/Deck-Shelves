import { useEffect, useState } from "react";
import { DialogButton, Focusable } from "../../runtime/host/decky";
import i18n from "../../i18n";
import { getLibraries, refreshLibraryLocations, type LibraryEntry } from "../../runtime/deviceState";

/* Mirrors DeveloperFilterOptions.tsx's multi-select-from-live-data pattern.
   One toggle per detected Steam library (SD card, USB drive, network share,
   the internal drive, …) rather than the old single internal/external/network
   category dropdown — a shelf can mix specific libraries together, e.g. "this
   SD card" + "that USB drive" but not the internal drive. */
const CATEGORY_ICON: Record<LibraryEntry["category"], string> = {
  internal: "\u{1F4BE}", external: "\u{1F4C0}", network: "\u{1F310}",
};

export default function LibraryLocationOptions({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const t = i18n.t.bind(i18n);
  const [libraries, setLibraries] = useState<LibraryEntry[]>(getLibraries());
  const [loading, setLoading] = useState(libraries.length === 0);

  useEffect(() => {
    let cancelled = false;
    void refreshLibraryLocations().finally(() => {
      if (cancelled) return;
      setLibraries(getLibraries());
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const selectedSet = new Set(selected);

  if (loading) {
    return <div style={{ padding: "6px 0", color: "var(--ds-text-dim, #8b9ab5)", fontSize: 12 }}>{t("filter_library_location_loading" as any)}</div>;
  }
  if (libraries.length === 0) {
    return <div style={{ padding: "6px 0", color: "var(--ds-text-dim, #8b9ab5)", fontSize: 12 }}>{t("filter_library_location_empty" as any)}</div>;
  }

  return (
    <Focusable style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0", width: "100%" }}>
      {libraries.map((lib) => {
        const checked = selectedSet.has(lib.id);
        const toggle = () => {
          const next = new Set(selectedSet);
          if (checked) next.delete(lib.id); else next.add(lib.id);
          onChange(Array.from(next));
        };
        return (
          <DialogButton
            key={lib.id}
            onClick={toggle}
            onOKButton={toggle}
            style={{ width: "100%", minHeight: 40, padding: "8px 10px", fontSize: 13, textAlign: "left" }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, width: "100%" }}>
              <span style={{ width: 14, textAlign: "center", flexShrink: 0, color: checked ? "#4caf50" : "rgba(255,255,255,0.3)" }}>
                {checked ? "✓" : "·"}
              </span>
              <span aria-hidden="true">{CATEGORY_ICON[lib.category]}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lib.label}</span>
              {!lib.mounted && <span style={{ fontSize: 11, opacity: 0.6 }}>{t("filter_library_location_unmounted" as any)}</span>}
            </span>
          </DialogButton>
        );
      })}
    </Focusable>
  );
}
