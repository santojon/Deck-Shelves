import { openFilePicker } from "@decky/api";
import { pickerPath } from "../components/qam/modals/modalUtils";

// Wrap Decky's openFilePicker for the Decoration tab. The full Decky
// signature is:
//   openFilePicker(select, startPath, includeFiles?, includeFolders?,
//                  filter?, extensions?, showHiddenFiles?, allowAllFiles?, max?)
// The previous wrapper passed `includeFolders=false`, so folder rows
// never appeared in the list — the user had no way to navigate
// outside the start directory. Picking a folder also fell into the
// `select=0` branch and treated the path as if it were the chosen
// file. The fix is `includeFolders=true` so folders show as
// navigation entries, while `select=0 (File)` still gates what the
// picker returns to file paths. Also seed an image-extension list so
// the picker shows the relevant files only.
const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
export async function pickImageFile(startPath = "/home/deck/Pictures"): Promise<string> {
  for (const fn of [
    async () => openFilePicker(0 as any, startPath, true, true, undefined, IMAGE_EXTS, false, true),
    async () => openFilePicker(0 as any, startPath, true, true),
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
