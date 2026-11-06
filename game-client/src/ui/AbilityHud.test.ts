import { afterEach, describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { AbilityHud } from "./AbilityHud";

// FS-ZAJMH R12, R13: the ability card keeps to the bottom-right corner as the logical view widens.

function fakeScene() {
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  const texts: { x: number; y: number }[] = [];
  /** Each text's resolution: made at 1, as Phaser makes it before a render-scale change. */
  const resolutions: number[] = [];
  const chain = (self: Record<string, unknown>) => {
    for (const m of [
      "setScrollFactor",
      "setDepth",
      "setColor",
      "setText",
      "fillStyle",
      "lineStyle",
      "strokeRect",
      "fillRoundedRect",
      "strokeRoundedRect",
      "lineBetween",
      "destroy",
    ])
      self[m] = () => self;
    return self;
  };
  const add = {
    graphics: () => {
      const g = chain({});
      g.clear = () => {
        rects.length = 0;
        return g;
      };
      g.fillRect = (x: number, y: number, w: number, h: number) => {
        rects.push({ x, y, w, h });
        return g;
      };
      return g;
    },
    text: (x: number, y: number) => {
      const at = { x, y };
      texts.push(at);
      const t = chain({});
      const i = resolutions.push(1) - 1;
      t.style = {
        get resolution() {
          return resolutions[i];
        },
      };
      t.setResolution = (r: number) => {
        resolutions[i] = r;
        return t;
      };
      t.setPosition = (nx: number, ny: number) => {
        at.x = nx;
        at.y = ny;
        return t;
      };
      return t;
    },
  };
  return {
    scene: { add } as unknown as Phaser.Scene,
    rects,
    texts,
    resolutions,
  };
}

const card = { name: "Cleave", line: "Strikes all around", greyed: false };

describe("AbilityHud (FS-ZAJMH R12, R13: anchored bottom-right)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("keeps its offset from the bottom-right corner at 1080 and, re-laid out, at 1280", () => {
    const { scene, rects, texts } = fakeScene();
    const hud = new AbilityHud(scene, {
      anchor: "bottom-right",
      dx: -16,
      dy: -16,
    });
    hud.show(card);
    const at1080 = { ...rects[0] };
    expect(at1080.x + at1080.w).toBe(1064);
    expect(at1080.y + at1080.h).toBe(704);
    const nameAt1080 = { ...texts[0] };

    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    hud.relayout();
    expect(rects[0]).toEqual({ ...at1080, x: at1080.x + 200 });
    expect(texts[0]).toEqual({ ...nameAt1080, x: nameAt1080.x + 200 });
  });

  it("rasterises its moved text at the new render scale on a re-layout (FS-ZAJMH R5)", () => {
    const { scene, resolutions } = fakeScene();
    const hud = new AbilityHud(scene, {
      anchor: "bottom-right",
      dx: -16,
      dy: -16,
    });
    hud.show(card);
    viewport.set({ width: 1280, height: 720, renderScale: 2 });
    hud.relayout();
    expect(resolutions).toEqual([2, 2]);
  });

  it("draws nothing on a re-layout while it is down", () => {
    const { scene, rects } = fakeScene();
    const hud = new AbilityHud(scene, {
      anchor: "bottom-right",
      dx: -16,
      dy: -16,
    });
    hud.relayout();
    expect(rects).toEqual([]);
  });
});
