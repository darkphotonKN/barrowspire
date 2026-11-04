import { describe, expect, it } from "vitest";
import { releaseGame } from "./releaseGame";

// Leaving the game page must hand the keyboard back at once. Phaser captures every key a scene
// registers (W A S D E I B 1 2 3 Enter Esc) with a keydown listener on window that calls
// preventDefault, and game.destroy() only tears the input down on the next frame, after the scenes;
// a scene that throws while torn down stops it there. The listener then outlived the game and ate
// those keys on every other page (the register form) until a full reload (asked 2026-11-04).

function fakes(withKeyboard = true) {
  const calls: string[] = [];
  const keyboard = {
    clearCaptures: () => calls.push("clearCaptures"),
    stopListeners: () => calls.push("stopListeners"),
  };
  const game = {
    input: withKeyboard ? { keyboard } : { keyboard: null },
    destroy: (removeCanvas: boolean) => calls.push(`destroy(${removeCanvas})`),
  };
  const socket = { off: (action: string) => calls.push(`off(${action})`) };
  return { calls, game, socket };
}

describe("releaseGame", () => {
  it("releases the keyboard before the deferred destroy", () => {
    const { calls, game, socket } = fakes();

    releaseGame(game, socket);

    expect(calls.indexOf("clearCaptures")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("stopListeners")).toBeGreaterThanOrEqual(0);
    expect(calls.indexOf("clearCaptures")).toBeLessThan(
      calls.indexOf("destroy(true)"),
    );
    expect(calls.indexOf("stopListeners")).toBeLessThan(
      calls.indexOf("destroy(true)"),
    );
  });

  it("stops listening for world_entered, so a later message never reaches the dead game", () => {
    const { calls, game, socket } = fakes();

    releaseGame(game, socket);

    expect(calls).toContain("off(world_entered)");
  });

  it("still destroys a game that has no keyboard", () => {
    const { calls, game, socket } = fakes(false);

    releaseGame(game, socket);

    expect(calls).toEqual(["off(world_entered)", "destroy(true)"]);
  });
});
