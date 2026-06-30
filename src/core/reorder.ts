import { useEffect, useState } from "react";

export type ReorderAxis = "horizontal" | "vertical";
export type ReorderPointerType = "mouse" | "touch" | "pen";

export function findReorderTargetIndex(
  itemRects: ReadonlyArray<{ left: number; right: number; top: number; bottom: number }>,
  pointer: { x: number; y: number },
  axis: ReorderAxis,
): number {
  const current = axis === "horizontal" ? pointer.x : pointer.y;
  for (let i = 0; i < itemRects.length; i++) {
    const r = itemRects[i];
    const lo = axis === "horizontal" ? r.left : r.top;
    const hi = axis === "horizontal" ? r.right : r.bottom;
    if (current >= lo && current <= hi) return i;
  }
  return -1;
}

export function moveInOrder<T>(order: ReadonlyArray<T>, fromId: T, toIdx: number): T[] | null {
  const from = order.indexOf(fromId);
  if (from === -1 || from === toIdx) return null;
  const next = order.slice();
  const [picked] = next.splice(from, 1);
  next.splice(toIdx, 0, picked);
  return next;
}

export type ContainerDragReorderOptions<T extends string | number> = {
  containerRef: React.RefObject<HTMLElement | null>;
  itemSelector: string;
  getItemId: (el: HTMLElement) => T | null;
  getOrder: () => T[];
  onReorder: (newOrder: T[]) => void;
  axis?: ReorderAxis;
  holdMs?: number;
  moveThresholdPx?: number;
  allowedPointerTypes?: ReorderPointerType[];
};

export function useContainerDragReorder<T extends string | number>(opts: ContainerDragReorderOptions<T>) {
  const {
    containerRef,
    itemSelector,
    getItemId,
    getOrder,
    onReorder,
    axis = "horizontal",
    holdMs = 300,
    moveThresholdPx = 8,
    allowedPointerTypes,
  } = opts;

  const [grabbedId, setGrabbedId] = useState<T | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const doc: Document = container.ownerDocument ?? document;

    let holdTimer: any = null;
    let held = false;
    let startPos: { x: number; y: number } | null = null;
    let capturedId: T | null = null;

    const reset = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      if (held) {
        held = false;
        setGrabbedId(null);
      }
      capturedId = null;
      startPos = null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (allowedPointerTypes && !allowedPointerTypes.includes(e.pointerType as ReorderPointerType)) return;
      const target = e.target as HTMLElement | null;
      const itemEl = target?.closest(itemSelector) as HTMLElement | null;
      if (!itemEl || !container.contains(itemEl)) return;
      const id = getItemId(itemEl);
      if (id == null) return;

      // Reset any prior session before starting a new one.
      if (holdTimer) clearTimeout(holdTimer);
      held = false;
      capturedId = id;
      startPos = { x: e.clientX, y: e.clientY };
      holdTimer = setTimeout(() => {
        held = true;
        setGrabbedId(capturedId);
      }, holdMs);
    };

    const onPointerMove = (e: PointerEvent) => {
      const origin = startPos;
      if (!origin) return;
      if (!held) {
        const delta = axis === "horizontal" ? Math.abs(e.clientX - origin.x) : Math.abs(e.clientY - origin.y);
        if (delta > moveThresholdPx) {
          if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
          startPos = null;
          capturedId = null;
        }
        return;
      }
      const id = capturedId;
      if (id == null) return;
      const items = Array.from(container.querySelectorAll<HTMLElement>(itemSelector));
      const rects = items.map((el) => el.getBoundingClientRect());
      const targetIdx = findReorderTargetIndex(rects, { x: e.clientX, y: e.clientY }, axis);
      if (targetIdx === -1) return;
      const next = moveInOrder(getOrder(), id, targetIdx);
      if (!next) return;
      onReorder(next);
    };

    const onPointerUpOrCancel = () => reset();

    container.addEventListener("pointerdown", onPointerDown);
    doc.addEventListener("pointermove", onPointerMove);
    doc.addEventListener("pointerup", onPointerUpOrCancel);
    doc.addEventListener("pointercancel", onPointerUpOrCancel);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown);
      doc.removeEventListener("pointermove", onPointerMove);
      doc.removeEventListener("pointerup", onPointerUpOrCancel);
      doc.removeEventListener("pointercancel", onPointerUpOrCancel);
      if (holdTimer) clearTimeout(holdTimer);
    };
    // Only re-install if the container identity or primary selector changes.
  }, [containerRef, itemSelector, axis, holdMs, moveThresholdPx]);

  return { grabbedId };
}
