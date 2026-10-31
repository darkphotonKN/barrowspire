import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { shade, tint } from "@/utils/canvasPalette";
import { BARROW_HEX as hex } from "@/utils/theme";
import { carvedPanel } from "./carvedPanel";

// The in-world panel house style (design guideline "Panels in the world"), shared by the NPC
// dialogue and the chat window: a soft drop shadow, a lit top edge, a double brass rule, studs.

function recorder() {
  const calls: unknown[][] = [];
  const g = new Proxy(
    {},
    {
      get: (_t, prop: string) =>
        (...args: unknown[]) => {
          calls.push([prop, ...args]);
          return g;
        },
    },
  ) as Phaser.GameObjects.Graphics;
  return { g, calls };
}

describe("carvedPanel", () => {
  it("should draw the dialogue's panel exactly as it always has, at full opacity", () => {
    const { g, calls } = recorder();
    carvedPanel(g, 10, 20, 100, 50);

    expect(calls.slice(0, 10)).toEqual([
      ["fillStyle", hex.pitch, 0.55],
      ["fillRoundedRect", 8, 23, 104, 54, 7],
      ["fillStyle", shade(hex.charcoal, 0.2), 0.97],
      ["fillRoundedRect", 10, 20, 100, 50, 6],
      ["fillStyle", hex.umber, 0.9],
      ["fillRoundedRect", 11, 21, 98, 46, 5],
      ["lineStyle", 1, tint(hex.umber, 0.12), 0.7],
      ["lineBetween", 16, 21.5, 104, 21.5],
      ["lineStyle", 1, hex.brass, 0.75],
      ["strokeRoundedRect", 10.5, 20.5, 99, 49, 6],
    ]);
    expect(calls.filter((c) => c[0] === "fillCircle")).toHaveLength(8);
  });

  it("should scale the grounds' and shadow's opacity, never the brass, when asked to let the world through", () => {
    const { g, calls } = recorder();
    carvedPanel(g, 0, 0, 100, 50, { opacity: 0.5 });

    expect(calls[0]).toEqual(["fillStyle", hex.pitch, 0.275]);
    expect(calls[2]).toEqual(["fillStyle", shade(hex.charcoal, 0.2), 0.485]);
    expect(calls[4]).toEqual(["fillStyle", hex.umber, 0.45]);
    expect(calls[8]).toEqual(["lineStyle", 1, hex.brass, 0.75]);
  });
});
