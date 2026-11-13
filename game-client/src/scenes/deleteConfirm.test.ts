import { describe, expect, it, vi } from "vitest";
import { confirmDeletion } from "./deleteConfirm";

// FS-WDM0X § Change: Menu, dialog and notice sounds, M11, M13, M14 (I-WDM0X-6): the main menu's
// delete confirm, the browser's own, sounds as it is asked and as it is answered.

describe("confirmDeletion (FS-WDM0X § Change M11, M13, M14)", () => {
  it("should play dialog_open as it asks, then dialog_confirm_heavy on OK, and say to delete", () => {
    const heard: string[] = [];
    const ask = vi.fn(() => (heard.push("asked"), true));

    const yes = confirmDeletion("Aldric", { ask, play: (effect) => void heard.push(effect) });

    expect(yes).toBe(true);
    expect(ask).toHaveBeenCalledWith('Delete character "Aldric"?');
    expect(heard).toEqual(["dialog_open", "asked", "dialog_confirm_heavy"]);
  });

  it("should play dialog_cancel on Cancel, and say not to delete", () => {
    const heard: string[] = [];

    const yes = confirmDeletion("Aldric", { ask: () => false, play: (effect) => void heard.push(effect) });

    expect(yes).toBe(false);
    expect(heard).toEqual(["dialog_open", "dialog_cancel"]);
  });
});
