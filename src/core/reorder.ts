/**
 * Unified pointer-hold drag-to-reorder controller.
 *
 * Design goals:
 * - Single implementation shared by: manual sort mini-card row, QAM shelf list,
 *   Home shelf-title drag. Each surface wires its own container + selector + id
 *   resolver; the rest of the drag logic (hold timer, move cancel, hit-test,
 *   commit) lives here.
 * - Local state only — never publishes to any global store.
 * - No gamepad input: the grab-by-A + L/R shift UX lives in ManualSortRow and
 *   stays there because it requires FocusNavController interop that is only
 *   meaningful inside the shelf editor.
 */
import { useEffect, useState } from "react";

export type ReorderAxis = "horizontal" | "vertical";
export type ReorderPointerType = "mouse" | "touch" | "pen";

export type ContainerDragReorderOptions<T extends string | number> = {
  containerRef: React.RefObject<HTMLElement | null>;
  /** CSS selector for items inside the container (each must resolve to a unique id). */
  itemSelector: string;
  /** Extract the item id from a matched DOM element. Return null to skip. */
  getItemId: (el: HTMLElement) => T | null;
  /** Current ordered list of ids (source of truth — not maintained internally). */
  getOrder: () => T[];
  /** Called with the new order whenever the user drags across a neighbour. */
  onReorder: (newOrder: T[]) => void;
  /** Layout axis used for hit-testing. Default: "horizontal". */
  axis?: ReorderAxis;
  /** Hold duration before entering grab mode. Default: 300 ms. */
  holdMs?: number;
  /** Move distance (along axis) that cancels the hold before the timer fires. Default: 8 px. */
  moveThresholdPx?: number;
  /** If set, only these pointer types start a hold. Default: all. */
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
      const current = axis === "horizontal" ? e.clientX : e.clientY;
      let targetIdx = -1;
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect();
        const lo = axis === "horizontal" ? r.left : r.top;
        const hi = axis === "horizontal" ? r.right : r.bottom;
        if (current >= lo && current <= hi) { targetIdx = i; break; }
      }
      if (targetIdx === -1) return;
      const order = getOrder().slice();
      const from = order.indexOf(id);
      if (from === -1 || from === targetIdx) return;
      const [picked] = order.splice(from, 1);
      order.splice(targetIdx, 0, picked);
      onReorder(order);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef, itemSelector, axis, holdMs, moveThresholdPx]);

  return { grabbedId };
}
