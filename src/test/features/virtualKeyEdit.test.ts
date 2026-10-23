import { describe, it, expect } from "vitest";
import { applyVirtualKey } from "../../features/search/virtualKeyEdit";

describe("applyVirtualKey", () => {
  it("inserts a character at the caret", () => {
    expect(applyVirtualKey("portl", 4, 4, "a")).toEqual({ value: "portal", caret: 5 });
    expect(applyVirtualKey("", 0, 0, "q")).toEqual({ value: "q", caret: 1 });
  });

  it("replaces a selection", () => {
    expect(applyVirtualKey("portal", 0, 6, "x")).toEqual({ value: "x", caret: 1 });
  });

  it("deletes backward and forward", () => {
    expect(applyVirtualKey("portal", 6, 6, "Backspace")).toEqual({ value: "porta", caret: 5 });
    expect(applyVirtualKey("portal", 0, 0, "Backspace")).toEqual({ value: "portal", caret: 0 });
    expect(applyVirtualKey("portal", 1, 3, "Backspace")).toEqual({ value: "ptal", caret: 1 });
    expect(applyVirtualKey("portal", 0, 0, "Delete")).toEqual({ value: "ortal", caret: 0 });
  });

  it("moves the caret and ignores named keys", () => {
    expect(applyVirtualKey("abc", 1, 1, "ArrowLeft")).toEqual({ value: "abc", caret: 0 });
    expect(applyVirtualKey("abc", 3, 3, "ArrowRight")).toEqual({ value: "abc", caret: 3 });
    expect(applyVirtualKey("abc", 3, 3, "Shift")).toBeNull();
    expect(applyVirtualKey("abc", 3, 3, "ArrowUp")).toBeNull();
    expect(applyVirtualKey("abc", 3, 3, "")).toBeNull();
  });

  it("inserts uppercase letters, spaces and multi-unit characters", () => {
    expect(applyVirtualKey("a", 1, 1, "B")).toEqual({ value: "aB", caret: 2 });
    expect(applyVirtualKey("a", 1, 1, " ")).toEqual({ value: "a ", caret: 2 });
    expect(applyVirtualKey("a", 1, 1, "😀")).toEqual({ value: "a😀", caret: 3 });
  });
});
