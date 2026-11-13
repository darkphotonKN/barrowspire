import { afterEach, describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { mix, palette, shade } from "@/utils/canvasPalette";
import { TINT_IDENTITY } from "@/utils/theme";
import { BRONZE, CUT_W, Knockout, bend, oval, type KnockoutPicture } from "./knockout";

// FS-7TQN4 R1, R2, R12–R15: the corner row's one knockout renderer, on a recording stand-in for the
// Phaser scene. I-7TQN4-1. FS-S8Z2Y R1–R6: its drop shadow and its top-lit gradient. I-S8Z2Y-1.

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
  /** The top-left corner's tint, and all four corners' as `setTint` left them (one sets all four). */
  tint?: number;
  tints?: number[];
  alpha?: number;
  log: { m: string; g?: Rec }[];
  destroyed: boolean;
}
/** An image made with `add.image`: the shadow, on a texture's own texture (FS-S8Z2Y R1). */
interface Img {
  x: number;
  y: number;
  /** The render texture whose texture it shows. */
  of?: Tex;
  depth?: number;
  scrollFactor?: number;
  scale?: number;
  tints?: number[];
  tintMode?: number;
  alpha?: number;
  destroyed: boolean;
}

function stage(mode: "none" | "ok" | "throws" = "ok") {
  const made: Rec[] = [];
  const madeAdded: (boolean | undefined)[] = [];
  const textures: Tex[] = [];
  const images: Img[] = [];
  const attempts = { renderTexture: 0 };
  const recordOf = new Map<unknown, Rec>();
  /** The scene's display list, in drawing order, and each object's record. */
  const list: unknown[] = [];
  const objectOf = new Map<unknown, unknown>();
  const onList = <T>(self: T, rec: unknown) => (list.push(self), objectOf.set(self, rec), self);
  const offList = (self: unknown) => list.includes(self) && list.splice(list.indexOf(self), 1);
  /** Which texture a render texture's `texture` is. */
  const textureOf = new Map<unknown, Tex>();
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
    const texture = {};
    textureOf.set(texture, t);
    const self: Record<string, unknown> = {
      width,
      height,
      texture,
      setScrollFactor: (v: number) => ((t.scrollFactor = v), self),
      setDepth: (v: number) => ((t.depth = v), self),
      setScale: (v: number) => ((t.scale = v), self),
      setPosition: (nx: number, ny: number) => ((t.x = nx), (t.y = ny), self),
      setTint: (...c: number[]) => ((t.tint = c[0]), (t.tints = c.length === 1 ? [c[0], c[0], c[0], c[0]] : c), self),
      setAlpha: (v: number) => ((t.alpha = v), self),
      draw: (g: unknown) => (t.log.push({ m: "draw", g: recordOf.get(g) }), self),
      erase: (g: unknown) => (t.log.push({ m: "erase", g: recordOf.get(g) }), self),
      render: () => (t.log.push({ m: "render" }), self),
      destroy: () => void ((t.destroyed = true), offList(self)),
    };
    return onList(self, t);
  };
  const image = (x: number, y: number, texture: unknown) => {
    const i: Img = { x, y, of: textureOf.get(texture), destroyed: false };
    images.push(i);
    const self: Record<string, unknown> = {
      setScrollFactor: (v: number) => ((i.scrollFactor = v), self),
      setDepth: (v: number) => ((i.depth = v), self),
      setScale: (v: number) => ((i.scale = v), self),
      setPosition: (nx: number, ny: number) => ((i.x = nx), (i.y = ny), self),
      setTint: (...c: number[]) => ((i.tints = c.length === 1 ? [c[0], c[0], c[0], c[0]] : c), self),
      setTintMode: (v: number) => ((i.tintMode = v), self),
      setAlpha: (v: number) => ((i.alpha = v), self),
      destroy: () => void ((i.destroyed = true), offList(self)),
    };
    return onList(self, i);
  };
  // Phaser's List.moveBelow (src/utils/array/MoveBelow.js): child1 to just under child2, if above it
  const children = {
    list,
    moveBelow: (child1: unknown, child2: unknown) => {
      const [at, base] = [list.indexOf(child1), list.indexOf(child2)];
      if (at < 0 || base < 0) throw new Error("Supplied items must be elements of the same array");
      if (at > base) list.splice(base, 0, ...list.splice(at, 1));
    },
  };
  const scene = (
    mode === "none"
      ? { add: {} }
      : {
          add: { renderTexture, image },
          make: { graphics: (_c: object, add?: boolean) => (madeAdded.push(add), graphics()) },
          children,
        }
  ) as unknown as Phaser.Scene;
  /** The display list's records, in drawing order. */
  const order = () => list.map((o) => objectOf.get(o));
  return { scene, made, madeAdded, textures, images, attempts, list, onList, order };
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
/** PICTURE's silhouette on SLOT, in screen px: its top and its foot. */
const TOP = 213;
const FOOT = 233;

const rgb = (c: number) => [(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff];
/** The colour the image's corner tints give at the screen height y: Phaser runs them across the quad. */
function tintAt(t: Tex, y: number): number[] {
  const h = t.height * t.scale!;
  const u = (y - (t.y - h / 2)) / h;
  const [top, foot] = [rgb(t.tints![0]), rgb(t.tints![2])];
  return top.map((c, i) => c + u * (foot[i] - c));
}
/**
 * FS-S8Z2Y R4: the corner tints, the top two equal and the foot two equal, give `base` lifted 25%
 * toward the bright amber at the silhouette's top and shaded 20% at its foot, within 1 per channel.
 */
function expectLit(t: Tex, base: number, top = TOP, foot = FOOT) {
  const [tl, tr, bl, br] = t.tints!;
  expect(tr).toBe(tl);
  expect(br).toBe(bl);
  const within = (got: number[], want: number) => got.forEach((c, i) => expect(Math.abs(c - rgb(want)[i])).toBeLessThanOrEqual(1));
  within(tintAt(t, top), mix(base, palette.interactableBright, 0.25));
  within(tintAt(t, foot), shade(base, 0.2));
}

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

  it.each([1, 1.5, 2])(
    "should cut in texel coordinates at render scale %s: on an unscaled graphics, every point and radius times k, at lineStyle(1.6·k), over the 2 px the renderer joins above",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const k = 2 * renderScale;
      const env = stage();
      const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
      knockout.show(SLOT, false);
      const [t] = env.textures;
      const cut = t.log[1].g!;
      expect(cut.scale ?? 1).toBe(1);
      expect(cut).toMatchObject({ x: t.width / 2, y: t.height / 2 });
      const widths = cut.ops.filter(({ m }) => m === "lineStyle").map(({ args }) => args[0]);
      expect(widths).toEqual([CUT_W * k]);
      expect(widths[0]).toBeGreaterThan(2);
      expect(cut.ops.find(({ m }) => m === "moveTo")!.args).toEqual([-6 * k, -6 * k]);
      expect(cut.ops.find(({ m }) => m === "strokeCircle")!.args).toEqual([0, 0, 3 * k]);
      expect(cut.ops.find(({ m }) => m === "fillCircle")!.args).toEqual([7 * k, 7 * k, 1.2 * k]);
      knockout.destroy();
    },
  );

  it("should tint idle and hovered, with no new texture and nothing drawn on hover and leave (FS-S8Z2Y R4, R5: lit from above)", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    knockout.show(SLOT, false);
    const [t] = env.textures;
    expectLit(t, palette.hudFaint);
    expect(t.alpha).toBe(0.6);
    knockout.show(SLOT, true);
    expectLit(t, palette.hudText);
    expect(t.alpha).toBe(1);
    knockout.show(SLOT, false);
    expectLit(t, palette.hudFaint);
    expect(t.alpha).toBe(0.6);
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
    expect(now).toMatchObject({ x: 127, y: 223, width: 216, height: 184, alpha: 1 });
    expectLit(now, palette.hudText);
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

describe("Knockout (FS-S8Z2Y R1–R3: the drop shadow)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it.each([1, 1.5, 2])(
    "should show its own texture again under it at render scale %s: palette.ink in FILL at 0.5, 1 px right and 1 down, at 1/k, depth 1000, scroll factor 0, just under the image",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const k = 2 * renderScale;
      const env = stage();
      const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
      knockout.show(SLOT, false);
      expect(env.images).toHaveLength(1);
      const [t] = env.textures;
      const [shadow] = env.images;
      expect(shadow.of).toBe(t);
      expect(shadow).toMatchObject({ x: 128, y: 224, depth: 1000, scrollFactor: 0, tintMode: 1, alpha: 0.5 });
      expect(shadow.tints).toEqual([palette.ink, palette.ink, palette.ink, palette.ink]);
      expect(shadow.scale).toBeCloseTo(1 / k, 12);
      const order = env.order();
      expect(order.indexOf(shadow)).toBe(order.indexOf(t) - 1);
      // nothing more is drawn: one texture, its fill, its erase, one render
      expect(env.textures).toHaveLength(1);
      expect(t.log.map(({ m }) => m)).toEqual(["draw", "erase", "render"]);
      knockout.destroy();
    },
  );

  it("should stand the shadow just under the image after its owner has placed the image, on building and on a rebuild", () => {
    const env = stage();
    const badge = env.onList({}, "badge");
    const knockout = new Knockout({
      scene: env.scene,
      depth: 1000,
      picture: PICTURE,
      ink: INK,
      built: (image) => (env.scene.children.moveBelow as (a: unknown, b: unknown) => void)(image, badge),
    });
    knockout.show(SLOT, false);
    const standing = () => {
      const t = env.textures.find((x) => !x.destroyed)!;
      const shadow = env.images.find((x) => !x.destroyed)!;
      expect(env.order().slice(-3)).toEqual([shadow, t, "badge"]);
    };
    standing();
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    standing();
    knockout.destroy();
  });

  it("should move the shadow with its slot, and leave its place, tint and alpha as they were on hover and leave", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    knockout.show(SLOT, false);
    const [shadow] = env.images;
    const was = { ...shadow, tints: [...shadow.tints!] };
    knockout.show(SLOT, true);
    knockout.show(SLOT, false);
    expect(shadow).toEqual(was);
    knockout.show({ ...SLOT, x: 300 }, true);
    expect(shadow).toMatchObject({ x: 328, y: 224, alpha: 0.5, tintMode: 1 });
    expect(env.images).toHaveLength(1);
    knockout.destroy();
  });

  it("should make a new shadow on the new texture at a new render scale, destroying the old, and take it down on destroy", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    knockout.show(SLOT, true);
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.images).toHaveLength(2);
    const [old, now] = env.images;
    expect(old.destroyed).toBe(true);
    expect(now.of).toBe(env.textures[1]);
    expect(now).toMatchObject({ x: 128, y: 224, alpha: 0.5, destroyed: false });
    expect(now.scale).toBeCloseTo(1 / 4, 12);
    knockout.destroy();
    expect(now.destroyed).toBe(true);
    viewport.set({ width: 1080, height: 720, renderScale: 1 });
    expect(env.images).toHaveLength(2);
    expect(env.list).toEqual([]);
  });

  it.each(["none", "throws"] as const)("should make no shadow where it cannot draw (%s)", (mode) => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const env = stage(mode);
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    expect(knockout.show(SLOT, false)).toBe(false);
    expect(env.images).toEqual([]);
    knockout.destroy();
    vi.restoreAllMocks();
  });

  it("should say it cannot draw on a scene that makes textures but no images, making nothing", () => {
    const env = stage();
    delete (env.scene.add as { image?: unknown }).image;
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: INK });
    expect(knockout.show(SLOT, false)).toBe(false);
    expect(env.attempts.renderTexture).toBe(0);
    knockout.destroy();
  });
});

describe("Knockout (FS-S8Z2Y R4–R6: lit from above)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it.each([1, 1.5, 2])(
    "should lay the bronze as four corner tints at render scale %s: lifted toward the bright amber at the silhouette's top, shaded at its foot, at alpha 0.85; lifted as a whole at 1 under the pointer",
    (renderScale) => {
      viewport.set({ width: 1080, height: 720, renderScale });
      const env = stage();
      const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: BRONZE });
      knockout.show(SLOT, false);
      const [t] = env.textures;
      expectLit(t, BRONZE.idle.tint);
      expect(t.alpha).toBe(0.85);
      knockout.show(SLOT, true);
      expectLit(t, BRONZE.hover.tint);
      expect(t.alpha).toBe(1);
      expect(env.textures).toHaveLength(1);
      expect(env.images).toHaveLength(1);
      expect(env.made).toHaveLength(2);
      knockout.destroy();
    },
  );

  it("should lay it on the silhouette wherever it stands in the slot, not on the slot", () => {
    const low: KnockoutPicture = { ...PICTURE, silhouette: [PICTURE.silhouette[0].map(([x, y]) => [x, y / 2 + 8] as const)] };
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: low, ink: BRONZE });
    knockout.show(SLOT, false);
    expectLit(env.textures[0], BRONZE.idle.tint, 223 + 3, 223 + 13);
    knockout.destroy();
  });

  it("should keep a flat ink one tint on all four corners, hovered or not", () => {
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: PICTURE, ink: { ...INK, flat: true } });
    knockout.show(SLOT, false);
    const [t] = env.textures;
    expect(t.tints).toEqual([palette.hudFaint, palette.hudFaint, palette.hudFaint, palette.hudFaint]);
    expect(t.alpha).toBe(0.6);
    knockout.show(SLOT, true);
    expect(t.tints).toEqual([palette.hudText, palette.hudText, palette.hudText, palette.hudText]);
    expect(env.images).toHaveLength(1);
    knockout.destroy();
  });

  it("should hold each corner's channels to 0–255 where the line carried out to the texture's edge runs past them", () => {
    const thin: KnockoutPicture = { silhouette: [[[-4, -1], [4, -1], [4, 1], [-4, 1]]], cuts: [] };
    const env = stage();
    const knockout = new Knockout({ scene: env.scene, depth: 1000, picture: thin, ink: BRONZE });
    knockout.show(SLOT, true);
    const [top, , foot] = env.textures[0].tints!;
    for (const c of [top, foot]) {
      expect(Number.isInteger(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(0xffffff);
    }
    expect(rgb(top)[0]).toBe(255);
    expect(rgb(foot)[2]).toBe(0);
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
