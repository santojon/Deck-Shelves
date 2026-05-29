import { openFilePicker } from "@decky/api";
import { pickerPath } from "../components/qam/modals/modalUtils";

// Wrap Decky's openFilePicker with the same shape the import / export
// modals use, but ask for a FILE (mode 0) instead of a folder (mode 1).
// Used by the Decoration tab so the user can browse the Steam Deck FS
// for the synthetic-card image. Falls back to an empty string when the
// underlying picker is missing or the user cancels.
export async function pickImageFile(startPath = "/home/deck/Pictures"): Promise<string> {
  for (const fn of [
    async () => openFilePicker(0 as any, startPath, true, false, undefined, undefined, false, false),
    async () => openFilePicker(0 as any, startPath),
  ]) {
    try {
      const v = pickerPath(await fn());
      if (v) return v;
    } catch {
      // Try next signature.
    }
  }
  return "";
}
