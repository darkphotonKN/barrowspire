import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import {
  HUD_COLUMN_W,
  RESOURCE_HUD_AT,
  ResourceHud,
  resourceHudHeight,
} from "./ResourceHud";
import type { HudBar } from "./resources";

// The panel hangs from a fixed top edge and grows down, so whatever stands under it keeps its place.

// The run's place: FS-77DVN §E.17 supersedes FS-56CKV §D.20's y 56 (and FS-8AY7S R20's "x 10,
// y 84") in part: with the XP bar gone to the bottom, the run's bars rise to a field's place.
const X = 10;
const TOP = 16;

describe("ResourceHud's place (FS-77DVN §E.17, §E.21)", () => {
  it("should stand the run's bars at the very top left, at (10, 16), as a field's", () => {
    expect(RESOURCE_HUD_AT.run).toEqual({ x: X, y: TOP });
    expect(RESOURCE_HUD_AT.run).toEqual(RESOURCE_HUD_AT.field);
  });

  it("should keep a field's bars in its corner, at (10, 16)", () => {
    expect(RESOURCE_HUD_AT.field).toEqual({ x: 10, y: 16 });
  });

  it("should keep the bars one 180 px column with the party frames (§E.19)", () => {
    expect(HUD_COLUMN_W).toBe(180);
  });
});

function fakeScene() {
  const rects: number[][] = [];
  const texts: { y: () => number; destroyed: boolean }[] = [];
  const chain = (): Record<string, unknown> =>
    new Proxy(
      {},
      {
        get: (_t, prop) =>
          prop === "destroy"
            ? () => undefined
            : prop === "fillRect"
              ? (...args: number[]) => {
                  rects.push(args);
                  return chain();
                }
              : () => chain(),
      },
    );
  const text = (_x: number, startY: number) => {
    let at = startY;
    const self: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "setPosition")
            return (_px: number, py: number) => {
              at = py;
              return self;
            };
          if (prop === "destroy")
            return () => {
              record.destroyed = true;
            };
          return () => self;
        },
      },
    );
    const record = { y: () => at, destroyed: false };
    texts.push(record);
    return self;
  };
  const scene = { add: { graphics: chain, text } } as unknown as Phaser.Scene;
  return { scene, rects, texts };
}

const health: HudBar = { channel: "health", label: "Health:", fill: 1 };
const mana: HudBar = { channel: "mana", label: "Mana:", fill: 0.5 };

describe("ResourceHud (top anchored)", () => {
  it("should draw its panel from its top edge, as tall as its rows", () => {
    const { scene, rects } = fakeScene();
    new ResourceHud(scene, X, TOP).show([health, mana]);
    expect(rects[0]).toEqual([X, TOP, 180, resourceHudHeight(2)]);
  });

  it("should keep its top edge and grow down as the bars change", () => {
    const { scene, rects } = fakeScene();
    const hud = new ResourceHud(scene, X, TOP);

    hud.show([health]);
    expect(rects[0]).toEqual([X, TOP, 180, resourceHudHeight(1)]);

    rects.length = 0;
    hud.show([health, mana]);
    expect(rects[0]).toEqual([X, TOP, 180, resourceHudHeight(2)]);
  });

  it("should stack its labels top to bottom, below its top edge", () => {
    const { scene, texts } = fakeScene();
    new ResourceHud(scene, X, TOP).show([health, mana]);
    const [first, second] = texts;
    expect(first.y()).toBeGreaterThan(TOP);
    expect(second.y()).toBeGreaterThan(first.y());
    expect(second.y()).toBeLessThan(TOP + resourceHudHeight(2));
  });

  it("should come back at the same place after the bars go down", () => {
    const { scene, rects } = fakeScene();
    const hud = new ResourceHud(scene, X, TOP);
    hud.show([health, mana]);
    hud.show([]);
    rects.length = 0;
    hud.show([health, mana]);
    expect(rects[0]).toEqual([X, TOP, 180, resourceHudHeight(2)]);
  });
});
