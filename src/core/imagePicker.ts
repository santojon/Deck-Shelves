import { openFilePicker } from "../runtime/host/decky";
import { pickerPath } from "../components/qam/modals/modalUtils";
import { getUserPicturesDir } from "./userPaths";

// Wrap openFilePicker; includeFolders=true lets the user
// navigate, select=0 still returns only file paths.
const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
// Default to the backend-resolved ~/Pictures (cross-OS / any account) rather
// than a /home/deck hardcode; callers may still pass an explicit start path.
export async function pickImageFile(startPath = getUserPicturesDir()): Promise<string> {
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
