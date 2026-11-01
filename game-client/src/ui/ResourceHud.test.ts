import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { ResourceHud } from "./ResourceHud";
import type { HudBar } from "./resources";

// FS-WJGFJ §Requirements C18: the chat window stacks on the ResourceHud's top edge, so the HUD
// says where that edge is, up or down.

function fakeScene() {
  const chain = (): Record<string, unknown> =>
    new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "destroy" ? () => undefined : () => chain(),
      },
    );
  return { add: { graphics: chain, text: chain } } as unknown as Phaser.Scene;
}

const health: HudBar = { channel: "health", label: "Health:", fill: 1 };
const mana: HudBar = { channel: "mana", label: "Mana:", fill: 0.5 };

describe("ResourceHud.topEdge (FS-WJGFJ C18)", () => {
  it("should be the bottom edge while the panel is down", () => {
    const hud = new ResourceHud(fakeScene(), 10, 700);
    expect(hud.topEdge()).toBe(700);
  });

  it("should rise with each bar and fall back to the bottom when the bars go", () => {
    const hud = new ResourceHud(fakeScene(), 10, 700);

    hud.show([health]);
    const one = hud.topEdge();
    hud.show([health, mana]);
    const two = hud.topEdge();
    hud.show([]);

    expect(one).toBeLessThan(700);
    expect(two).toBeLessThan(one);
    expect(hud.topEdge()).toBe(700);
  });
});
