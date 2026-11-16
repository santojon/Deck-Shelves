import { openFilePicker } from "../runtime/host/decky";
import { pickerPath } from "../components/qam/modals/modalUtils";
import { getUserPicturesDir } from "./userPaths";

// includeFolders lets the user browse folders; select=0 still returns only files.
const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif", "bmp"];
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
