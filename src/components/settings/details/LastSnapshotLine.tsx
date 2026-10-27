import { useEffect, useState } from "react";
import i18n from "../../../i18n";
import { listBackups } from "../../../store/settingsStore";

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [["day", 86400], ["hour", 3600], ["minute", 60]];

// "3 hours ago" in the UI language, from a snapshot's time (seconds).
export function snapshotAge(mtimeSec: number, nowMs = Date.now(), lang = i18n.language): string {
  const diff = Math.max(0, nowMs / 1000 - mtimeSec);
  const fmt = new Intl.RelativeTimeFormat(lang || "en", { numeric: "auto" });
  for (const [unit, size] of UNITS) if (diff >= size) return fmt.format(-Math.floor(diff / size), unit);
  return fmt.format(0, "minute");
}

/* "Last snapshot: 3 hours ago" (or that there is none yet). `version` refreshes it
   after the list changes. */
export function LastSnapshotLine({ t, version = 0 }: { t: (key: string) => string; version?: number }) {
  const [newest, setNewest] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void listBackups().then((b) => { if (alive) setNewest(b.length ? Math.max(...b.map((x) => x.mtime)) : null); });
    return () => { alive = false; };
  }, [version]);
  if (newest === undefined) return null;
  const text = newest === null ? t("snapshot_none_yet") : t("snapshot_last").replace("{{when}}", snapshotAge(newest));
  return <div style={{ fontSize: 12, opacity: 0.7, margin: "2px 0 8px" }}>{text}</div>;
}
