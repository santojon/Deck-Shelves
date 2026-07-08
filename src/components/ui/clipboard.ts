/* Copy text to the clipboard. The async Clipboard API is the primary path — we
   await it so a rejection (no focus / permission) falls through to the hidden
   textarea + execCommand fallback rather than silently dropping the copy. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if ((navigator as any)?.clipboard?.writeText) {
      await (navigator as any).clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}
