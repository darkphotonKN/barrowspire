import { describe, expect, it } from "vitest";
import { focusTrapStep } from "./useDialogFocus";

const tab = { key: "Tab", shiftKey: false };
const shiftTab = { key: "Tab", shiftKey: true };

describe("focusTrapStep", () => {
  it("should close on Esc wherever focus is", () => {
    expect(focusTrapStep({ key: "Escape", shiftKey: false }, 1, 3)).toEqual({ kind: "close" });
    expect(focusTrapStep({ key: "Escape", shiftKey: false }, "outside", 3)).toEqual({
      kind: "close",
    });
  });

  it.each([
    ["Tab on the last control wraps to the first", tab, 2, { kind: "focus", index: 0 }],
    ["Shift+Tab on the first control wraps to the last", shiftTab, 0, { kind: "focus", index: 2 }],
    ["Tab from outside the dialog comes back to the first", tab, "outside", { kind: "focus", index: 0 }],
    ["Shift+Tab from outside comes back to the last", shiftTab, "outside", { kind: "focus", index: 2 }],
    ["Tab in the middle is left to the browser", tab, 1, null],
    ["Shift+Tab in the middle is left to the browser", shiftTab, 1, null],
    ["Tab from a non-control inside is left to the browser", tab, "inside", null],
  ] as const)("%s", (_label, key, active, want) => {
    expect(focusTrapStep(key, active, 3)).toEqual(want);
  });

  it("should keep a lone control focused", () => {
    expect(focusTrapStep(tab, 0, 1)).toEqual({ kind: "focus", index: 0 });
    expect(focusTrapStep(shiftTab, 0, 1)).toEqual({ kind: "focus", index: 0 });
  });

  it("should ignore Tab when nothing inside can take focus, and other keys", () => {
    expect(focusTrapStep(tab, "outside", 0)).toBeNull();
    expect(focusTrapStep({ key: "Enter", shiftKey: false }, 0, 3)).toBeNull();
  });
});
