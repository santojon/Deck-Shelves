export type KeyEdit = { value: string; caret: number };

const NAMED_KEY = /^[A-Z][A-Za-z0-9]+$/;

function deleteBack(value: string, start: number, end: number): KeyEdit {
  if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
  if (start === 0) return { value, caret: 0 };
  return { value: value.slice(0, start - 1) + value.slice(end), caret: start - 1 };
}

function deleteForward(value: string, start: number, end: number): KeyEdit {
  if (start !== end) return { value: value.slice(0, start) + value.slice(end), caret: start };
  return { value: value.slice(0, start) + value.slice(start + 1), caret: start };
}

export function applyVirtualKey(value: string, start: number, end: number, key: string): KeyEdit | null {
  if (!key) return null;
  if (key === "Backspace") return deleteBack(value, start, end);
  if (key === "Delete") return deleteForward(value, start, end);
  if (key === "ArrowLeft") return { value, caret: Math.max(0, start - 1) };
  if (key === "ArrowRight") return { value, caret: Math.min(value.length, end + 1) };
  if (NAMED_KEY.test(key)) return null;
  return { value: value.slice(0, start) + key + value.slice(end), caret: start + key.length };
}
