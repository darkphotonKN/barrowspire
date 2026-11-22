import { describe, expect, it, vi } from "vitest";
import type { UiState } from "@/ui/uiBridge";
import { bindTreeAbilityKey } from "./treeAbilityKey";

/** A keyboard recording what is bound on it, and the UI scene's reported state, changeable. */
function keyed() {
  const keys = new Map<string, (event?: KeyboardEvent) => void>();
  const keyboard = { on: (event: string, fn: (event?: KeyboardEvent) => void) => keys.set(event, fn) };
  const ui: { now: UiState } = { now: { menuOpen: false } };
  const cast = vi.fn();
  const letGo = { release: vi.fn(), cancel: vi.fn() };
  bindTreeAbilityKey(keyboard, () => ui.now, cast, letGo);
  return { keys, ui, cast, letGo };
}

describe("bindTreeAbilityKey's release (FS-04EEA R38)", () => {
  it("should hand the release a let-go of 3 while nothing holds the key back", () => {
    const { keys, letGo } = keyed();
    keys.get("keyup-THREE")?.();
    expect(letGo.release).toHaveBeenCalledTimes(1);
    expect(letGo.cancel).not.toHaveBeenCalled();
  });

  it.each([
    ["the menu is open", { menuOpen: true }],
    ["chat is typing", { menuOpen: false, typing: true }],
    ["a gear panel is open", { menuOpen: false, inventory: true }],
  ])("should cancel on a let-go of 3 while %s, never release", (_, now) => {
    const { keys, ui, letGo } = keyed();
    ui.now = now;
    keys.get("keyup-THREE")?.();
    expect(letGo.cancel).toHaveBeenCalledTimes(1);
    expect(letGo.release).not.toHaveBeenCalled();
  });

  it("should bind no let-go where none is asked for", () => {
    const keys = new Map<string, unknown>();
    bindTreeAbilityKey({ on: (event: string, fn: unknown) => keys.set(event, fn) }, () => ({ menuOpen: false }), vi.fn());
    expect([...keys.keys()]).toEqual(["keydown-THREE"]);
  });
});
