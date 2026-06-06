import { openFilePicker } from "../runtime/host/decky";
import { pickerPath } from "../components/qam/modals/modalUtils";

// Wrap openFilePicker; includeFolders=true lets the user
// navigate, select=0 still returns only file paths.
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
