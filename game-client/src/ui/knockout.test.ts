import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { mix, palette } from "@/utils/canvasPalette";
import { TINT_IDENTITY } from "@/utils/theme";
import { BRONZE, CUT_W, Knockout, bend, oval, type KnockoutPicture } from "./knockout";

// FS-7TQN4 R1, R2, R12–R15: the corner row's one knockout renderer, on a recording stand-in for the
// Phaser scene. I-7TQN4-1.

interface Rec {
  ops: { m: string; args: number[] }[];
  scale?: number;
  x?: number;
  y?: number;
  destroyed: boolean;
}
interface Tex {
  x: number;
  y: number;
  width: number;
  height: number;
  depth?: number;
  scrollFactor?: number;
  scale?: number;
  tint?: number;
  alpha?: number;
  log: { m: string; g?: Rec }[];
  destroyed: boolean;
}

function stage(mode: "none" | "ok" | "throws" = "ok") {
  const made: Rec[] = [];
  const madeAdded: (boolean | undefined)[] = [];
  const textures: Tex[] = [];
  const attempts = { renderTexture: 0 };
  const recordOf = new Map<unknown, Rec>();
  const graphics = () => {
    const rec: Rec = { ops: [], destroyed: false };
    made.push(rec);
    const self: Record<string, unknown> = {};
    recordOf.set(self, rec);
    for (const m of [
      "fillStyle",
      "lineStyle",
      "beginPath",
      "moveTo",
      "lineTo",
      "closePath",
      "fillPath",
      "strokePath",
      "strokeCircle",
      "fillCircle",
      "lineBetween",
    ])
      self[m] = (...args: number[]) => (rec.ops.push({ m, args }), self);
    self.setScale = (s: number) => ((rec.scale = s), self);
    self.setPosition = (x: number, y: number) => ((rec.x = x), (rec.y = y), self);
    self.destroy = () => void (rec.destroyed = true);
    return self;
  };
  const renderTexture = (x: number, y: number, width: number, height: number) => {
    attempts.renderTexture++;
    if (mode === "throws") throw new Error("stand-in: no framebuffer");
    const t: Tex = { x, y, width, height, log: [], destroyed: false };
    textures.push(t);
    const self: Record<string, unknown> = {
      width,
      height,
      setScrollFactor: (v: number) => ((t.scrollFactor = v), self),
      setDepth: (v: number) => ((t.depth = v), self),
      setScale: (v: number) => ((t.scale = v), self),
      setPosition: (nx: number, ny: number) => ((t.x = nx), (t.y = ny), self),
      setTint: (v: number) => ((t.tint = v), self),
      setAlpha: (v: number) => ((t.alpha = v), self),
      draw: (g: unknown) => (t.log.push({ m: "draw", g: recordOf.get(g) }), self),
      erase: (g: unknown) => (t.log.push({ m: "erase", g: recordOf.get(g) }), self),
      render: () => (t.log.push({ m: "render" }), self),
      destroy: () => void (t.destroyed = true),
    };
    return self;
  };
  const scene = (
    mode === "none"
      ? { add: {} }
      : { add: { renderTexture }, make: { graphics: (_c: object, add?: boolean) => (madeAdded.push(add), graphics()) } }
  ) as unknown as Phaser.Scene;
  return { scene, made, madeAdded, textures, attempts };
}

/** A small picture: a square, one open cut, one closed cut, one ring and one hole. */
const PICTURE: KnockoutPicture = {
  silhouette: [
    [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
    ],
  ],
  cuts: [
    {
      path: [
        [-6, -6],
        [0, 2],
        [6, -6],
      ],
    },
    {
      path: [
        [-4, 4],
        [4, 4],
        [4, 7],
        [-4, 7],
      ],
      closed: true,
    },
    { ring: { x: 0, y: 0, r: 3 } },
  ],
  holes: [{ x: 7, y: 7, r: 1.2 }],
};
const SLOT = { x: 100, y: 200, width: 54, height: 46 };
const INK = { idle: { tint: palette.hudFaint, alpha: 0.6 }, hover: { tint: palette.hudText, alpha: 1 } };

/** A graphics' points and radii as the texture shows them, in logical px on the screen. */
function shown(t: Tex, g: Rec) {
  const s = (g.scale ?? 1) * t.scale!;
  return {
    pt: (x: number, y: number) => ({
      x: t.x + (x * (g.scale ?? 1) + (g.x ?? 0) - t.width / 2) * t.scale!,
      y: t.y + (y * (g.scale ?? 1) + (g.y ?? 0) - t.height / 2) * t.scale!,
    }),
    len: (v: number) => v * s,
  };
}

describe("Knockout (FS-7TQN4 R1, R12: one texture per render scale)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it.each([1, 1.5, 2])(
    "should make one texture at render scale %s: depth, scroll factor 0, the slot's centre, the slot × 2·renderScale, at 1/k",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const env = stage();
      const k = 2 * renderScale;
      const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
      expect(knockout.show(SLOT, false)).toBe(true);
      expect(env.textures).toHaveLength(1);
      const [t] = env.textures;
      expect(t).toMatchObject({
        x: 127,
        y: 223,
        width: Math.round(54 * k),
        height: Math.round(46 * k),
        depth: 1000,
        scrollFactor: 0,
      });
      expect(t.scale).toBeCloseTo(1 / k, 12);
      knockout.destroy();
    },
  );

  it("should fill the silhouette white at 1, then erase the cuts and holes, then render once, and destroy what it drew with", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    knockout.show(SLOT, false);
    const [t] = env.textures;
    expect(t.log.map(({ m }) => m)).toEqual(["draw", "erase", "render"]);
    const [solid, cut] = [t.log[0].g!, t.log[1].g!];
    expect(env.made).toEqual([solid, cut]);
    expect(env.madeAdded).toEqual([false, false]);
    expect(env.made.every((g) => g.destroyed)).toBe(true);
    // the silhouette: fills alone, white at 1
    expect(new Set(solid.ops.map(({ m }) => m))).toEqual(new Set(["fillStyle", "beginPath", "moveTo", "lineTo", "closePath", "fillPath"]));
    for (const { args } of solid.ops.filter(({ m }) => m === "fillStyle")) expect(args).toEqual([TINT_IDENTITY, 1]);
    // the cuts: strokes and filled discs alone, white at 1, never a lineBetween
    expect(cut.ops.map(({ m }) => m)).not.toContain("lineBetween");
    expect(cut.ops.filter(({ m }) => m.startsWith("fill")).map(({ m }) => m)).toEqual(["fillStyle", "fillCircle"]);
    for (const { m, args } of cut.ops.filter(({ m }) => m === "fillStyle" || m === "lineStyle")) {
      expect(m === "fillStyle" ? args : args.slice(1)).toEqual([TINT_IDENTITY, 1]);
    }
    expect(cut.ops.filter(({ m }) => m === "strokePath")).toHaveLength(2);
    expect(cut.ops.filter(({ m }) => m === "closePath")).toHaveLength(1);
  });

  it("should erase each cut 1.6 logical px wide and lay the picture on the slot's centre, at any render scale", () => {
    for (const renderScale of [1, 1.5, 2]) {
      viewport.set({ width: 1080, height: 720, renderScale });
      const env = stage();
      const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
      knockout.show(SLOT, false);
      const [t] = env.textures;
      const [solid, cut] = [t.log[0].g!, t.log[1].g!];
      const c = shown(t, cut);
      for (const { args } of cut.ops.filter(({ m }) => m === "lineStyle")) expect(c.len(args[0])).toBeCloseTo(CUT_W, 9);
      const ring = cut.ops.find(({ m }) => m === "strokeCircle")!.args;
      expect(c.pt(ring[0], ring[1]).x).toBeCloseTo(127, 9);
      expect(c.len(ring[2])).toBeCloseTo(3, 9);
      const hole = cut.ops.find(({ m }) => m === "fillCircle")!.args;
      expect(c.pt(hole[0], hole[1]).y).toBeCloseTo(230, 9);
      expect(c.len(hole[2])).toBeCloseTo(1.2, 9);
      const first = solid.ops.find(({ m }) => m === "moveTo")!.args;
      expect(shown(t, solid).pt(first[0], first[1])).toEqual({ x: 117, y: 213 });
      knockout.destroy();
    }
  });

  it("should tint idle and hovered, with no new texture and nothing drawn on hover and leave", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    knockout.show(SLOT, false);
    const [t] = env.textures;
    expect(t).toMatchObject({ tint: palette.hudFaint, alpha: 0.6 });
    knockout.show(SLOT, true);
    expect(t).toMatchObject({ tint: palette.hudText, alpha: 1 });
    knockout.show(SLOT, false);
    expect(t).toMatchObject({ tint: palette.hudFaint, alpha: 0.6 });
    expect(env.textures).toHaveLength(1);
    expect(env.made).toHaveLength(2);
    expect(t.log).toHaveLength(3);
  });

  it("should move to a new slot without building", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    knockout.show(SLOT, false);
    knockout.show({ ...SLOT, x: 300 }, false);
    expect(env.textures).toHaveLength(1);
    expect(env.textures[0]).toMatchObject({ x: 327, y: 223 });
  });

  it("should say each time it makes a texture, with the image", () => {
    const env = stage();
    const built = vi.fn();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK, built });
    knockout.show(SLOT, false);
    expect(built).toHaveBeenCalledTimes(1);
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(built).toHaveBeenCalledTimes(2);
    knockout.destroy();
  });
});

describe("Knockout (FS-7TQN4 R13, R14: a new render scale, and destroy)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it("should build anew at k = 4 when the render scale goes 1 → 2, destroy the old, and keep the slot and the pointer's tint", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    knockout.show(SLOT, true);
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.textures).toHaveLength(2);
    const [old, now] = env.textures;
    expect(old.destroyed).toBe(true);
    expect(now).toMatchObject({ x: 127, y: 223, width: 216, height: 184, tint: palette.hudText, alpha: 1 });
    expect(now.scale).toBeCloseTo(1 / 4, 12);
    expect(now.log.map(({ m }) => m)).toEqual(["draw", "erase", "render"]);
    knockout.destroy();
  });

  it("should build nothing on a view change that keeps the render scale", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    knockout.show(SLOT, false);
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    expect(env.textures).toHaveLength(1);
    expect(env.attempts.renderTexture).toBe(1);
    knockout.destroy();
  });

  it("should destroy its texture and stop watching: a later render-scale change makes nothing and throws nothing", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    knockout.show(SLOT, false);
    knockout.destroy();
    expect(env.textures[0].destroyed).toBe(true);
    expect(() => viewport.set({ width: 1080, height: 720, renderScale: 2 })).not.toThrow();
    expect(env.attempts.renderTexture).toBe(1);
  });

  it("should build nothing on a render-scale change before it was ever shown", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.attempts.renderTexture).toBe(0);
    knockout.destroy();
  });
});

describe("Knockout (FS-7TQN4 R15: cannot draw)", () => {
  afterEach(() => {
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    vi.restoreAllMocks();
  });

  it("should say it cannot draw on a scene with no make and no add.renderTexture, trying nothing", () => {
    const env = stage("none");
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    expect(knockout.show(SLOT, false)).toBe(false);
    expect(knockout.show(SLOT, true)).toBe(false);
    expect(env.attempts.renderTexture).toBe(0);
    knockout.destroy();
  });

  it("should say it cannot draw where making the texture throws, warn once, and never try again", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = stage("throws");
    const lost = vi.fn();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK, lost });
    expect(knockout.show(SLOT, false)).toBe(false);
    expect(knockout.show(SLOT, true)).toBe(false);
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.attempts.renderTexture).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(lost).not.toHaveBeenCalled();
    knockout.destroy();
  });

  it("should tell its owner when a rebuild at a new render scale throws, and take the old texture down", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = stage();
    const lost = vi.fn();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK, lost });
    knockout.show(SLOT, false);
    (env.scene.add as { renderTexture: unknown }).renderTexture = () => {
      throw new Error("stand-in: lost the framebuffer");
    };
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(lost).toHaveBeenCalledTimes(1);
    expect(env.textures[0].destroyed).toBe(true);
    expect(knockout.show(SLOT, false)).toBe(false);
    knockout.destroy();
  });
});

describe("knockout geometry helpers (FS-7TQN4 R1: one bend, one oval)", () => {
  it("should run a quadratic from a through the pull of c to b, a left out", () => {
    const ps = bend([0, 0], [5, 10], [10, 0], 4);
    expect(ps).toHaveLength(4);
    expect(ps[1]).toEqual([5, 5]);
    expect(ps[3]).toEqual([10, 0]);
  });

  it("should run an ellipse's arc with both ends kept", () => {
    const ps = oval(0, 0, 2, 1, 0, Math.PI, 2);
    expect(ps).toHaveLength(3);
    expect(ps[1][0]).toBeCloseTo(0, 12);
    expect(ps[1][1]).toBeCloseTo(1, 12);
  });

  it("should tint the row bronze, lifted toward the bright amber under the pointer", () => {
    expect(BRONZE).toEqual({
      idle: { tint: mix(palette.frame, palette.interactable, 0.5), alpha: 0.85 },
      hover: { tint: mix(palette.frame, palette.interactableBright, 0.5), alpha: 1 },
    });
  });
});
