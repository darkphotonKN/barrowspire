import { afterEach, describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { mix, palette, shade } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { circle, type AbilityIconPen } from "./abilityIcons";
import { BRONZE, GREYED_ALPHA } from "./knockout";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import {
  PAGE_ROUNDEL_SIZE,
  PageRoundel,
  ROUNDEL_DIM,
  ROUNDEL_SWEEP,
  drawPageLines,
  drawRoundelSweep,
  pageLineInk,
  roundelGeometry,
  roundelInk,
  roundelSweep,
  type PageIcon,
} from "./pageRoundel";

// FS-X2CMM §I R45, ADR-0094 (I-X2CMM-9), inked by §Change: Illuminated pages C1 and ADR-0095 (I-X2CMM-24):
// a class book page is a bone picture on a ground of its pigment in a bronze rim, its state changing only
// the inks its layers wear.

describe("roundelInk (FS-X2CMM §Change: Illuminated pages C1, ADR-0095: a page's state to its inks)", () => {
  const LAYERS = ["ground", "light", "body", "bone", "rim"] as const;
  const { lapis, ochre, bone: BONE, lockedGround, rimLit } = palette.bookPigment;
  const lum = (c: number) => ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);

  it("should lay a ready page's pigment as the ground, lit at its centre top and falling to shade(pigment, 0.35) at its rim", () => {
    const ink = roundelInk("lapis", "ready");
    expect(ink.ground).toMatchObject({ flat: true, idle: { tint: shade(lapis, 0.35), alpha: 1 } });
    expect(ink.light).toMatchObject({ flat: true, idle: { tint: lapis, alpha: 1 } });
  });

  it("should draw a ready picture in bone at alpha 1, its detail in shade(pigment, 0.55), the same under the pointer", () => {
    const ink = roundelInk("ochre", "ready");
    expect(ink.body).toEqual({ flat: true, idle: { tint: BONE, alpha: 1 }, hover: { tint: BONE, alpha: 1 } });
    expect(ink.bone).toEqual({ flat: true, idle: { tint: shade(ochre, 0.55), alpha: 1 }, hover: { tint: shade(ochre, 0.55), alpha: 1 } });
  });

  it("should rim a ready page in the HUD's bronze lit from above, lifting to brassBright under the pointer, and lift the ground's centre toward bone", () => {
    const ink = roundelInk("ochre", "ready");
    expect(ink.rim.flat).toBeFalsy();
    expect(ink.rim.idle).toEqual(BRONZE.idle);
    expect(ink.rim.hover).toEqual({ tint: rimLit, alpha: 1 });
    expect(rimLit).toBe(BARROW_HEX.brassBright);
    expect(ink.light.hover).toEqual({ tint: mix(ochre, BONE, 0.15), alpha: 1 });
    expect(ink.ground.hover).toEqual(ink.ground.idle);
  });

  it("should keep a recovering page as ready at rest, and never lift it", () => {
    const [ready, recovering] = [roundelInk("madder", "ready"), roundelInk("madder", "recovering")];
    for (const layer of LAYERS) {
      expect(recovering[layer].idle, layer).toEqual(ready[layer].idle);
      expect(recovering[layer].hover, layer).toEqual(recovering[layer].idle);
    }
  });

  it("should sink every layer of a dim page toward the locked ground, and never lift it", () => {
    const [ready, dim] = [roundelInk("verdigris", "ready"), roundelInk("verdigris", "dim")];
    for (const layer of LAYERS) {
      expect(lum(dim[layer].idle.tint), layer).toBeLessThan(lum(ready[layer].idle.tint));
      expect(dim[layer].idle.tint, layer).toBe(mix(ready[layer].idle.tint, lockedGround, ROUNDEL_DIM));
      expect(dim[layer].hover, layer).toEqual(dim[layer].idle);
    }
    // the picture still stands off its sunk ground
    expect(lum(dim.body.idle.tint)).toBeGreaterThan(lum(dim.light.idle.tint) + 120);
  });

  it("should lay a locked page on the flat warm near-ink ground, its body hudFaint at the greyed alpha, its detail the ground's, its rim unlit, never coloured or lifted", () => {
    const ink = roundelInk("lapis", "locked");
    expect(ink.ground).toMatchObject({ flat: true, idle: { tint: lockedGround, alpha: 1 } });
    expect(ink.light.idle.alpha).toBe(0);
    expect(ink.body).toMatchObject({ flat: true, idle: { tint: palette.hudFaint, alpha: GREYED_ALPHA } });
    expect(ink.bone).toMatchObject({ flat: true, idle: { tint: lockedGround, alpha: 1 } });
    expect(ink.rim.flat).toBe(true);
    expect(ink.rim.idle.tint).not.toBe(BRONZE.idle.tint);
    const pigments = [palette.bookPigment.verdigris, palette.bookPigment.ochre, palette.bookPigment.madder, lapis];
    for (const layer of LAYERS) {
      expect(ink[layer].hover, layer).toEqual(ink[layer].idle);
      if (ink[layer].idle.alpha > 0) expect(pigments, layer).not.toContain(ink[layer].idle.tint);
    }
  });
});

describe("roundelGeometry (ADR-0095: the rim a little thicker)", () => {
  it("should make the rim about 0.08 of the size, never under 2 px", () => {
    expect(roundelGeometry(PAGE_ROUNDEL_SIZE.book).rim).toBeCloseTo(44 * 0.08, 6);
    expect(roundelGeometry(PAGE_ROUNDEL_SIZE.castBar).rim).toBeCloseTo(Math.max(2, 28 * 0.08), 6);
  });
});

/** A page small enough to read: a disc body with a bar cut across it, a bone dot on it. */
const ICON: PageIcon = {
  pigment: "lapis",
  glyph: {
    body: { silhouette: [circle(0, 0, 10, 16)], cuts: [{ path: [[-8, 0], [8, 0]] }] },
    bone: { silhouette: [circle(-4, -4, 2, 8)], cuts: [] },
    lines: [{ ring: { x: 0, y: 0, r: 10 } }],
  },
};
const BOX = { x: 100, y: 200, width: 44, height: 44 };

/** A stand-in scene that makes textures and images, each recording its tints, alpha and place. */
function stage(makes = true, canvases = false) {
  /** The canvas textures the scene holds, by key, each with the radial stops painted on it. */
  const painted = new Map<string, { width: number; stops: [number, string][] }>();
  const moves: string[] = [];
  const textures: { width: number; tints?: number[]; alpha?: number; x?: number; destroyed: boolean }[] = [];
  const images: { tints?: number[]; alpha?: number; x?: number; texture?: string; destroyed: boolean }[] = [];
  const graphics = (): unknown => {
    const self: unknown = new Proxy({}, { get: () => () => self });
    return self;
  };
  const renderTexture = (_x: number, _y: number, width: number) => {
    const t: (typeof textures)[number] = { width, destroyed: false };
    textures.push(t);
    const self: Record<string, unknown> = { width, height: width, texture: {} };
    Object.assign(self, {
      setScrollFactor: () => self,
      setDepth: () => self,
      setScale: () => self,
      setPosition: (x: number) => ((t.x = x), self),
      setTint: (...c: number[]) => ((t.tints = c.length === 1 ? [c[0], c[0], c[0], c[0]] : c), self),
      setAlpha: (a: number) => ((t.alpha = a), self),
      draw: () => self,
      erase: () => self,
      render: () => self,
      destroy: () => void (t.destroyed = true),
    });
    return self;
  };
  const image = (_x: number, _y: number, key?: unknown) => {
    const i: (typeof images)[number] = { destroyed: false, texture: typeof key === "string" ? key : undefined };
    images.push(i);
    const self: Record<string, unknown> = { kind: "image", i };
    for (const m of ["setScrollFactor", "setDepth", "setScale", "setTintMode", "setDisplaySize"]) self[m] = () => self;
    self.setPosition = (x: number) => ((i.x = x), self);
    self.setAlpha = (a: number) => ((i.alpha = a), self);
    self.setTexture = (k: string) => ((i.texture = k), self);
    self.setTint = (...c: number[]) => ((i.tints = c), self);
    self.destroy = () => void (i.destroyed = true);
    return self;
  };
  const createCanvas = (key: string, width: number) => {
    const entry = { width, stops: [] as [number, string][] };
    painted.set(key, entry);
    const gradient = { addColorStop: (at: number, css: string) => void entry.stops.push([at, css]) };
    const ctx = new Proxy({} as Record<string, unknown>, { get: (_t, m: string) => (m === "createRadialGradient" ? () => gradient : () => undefined), set: () => true });
    return { getContext: () => ctx, refresh: () => undefined };
  };
  const children = {
    moveBelow: () => {},
    moveAbove: (a: { kind?: string }, b: { width?: number }) => void moves.push(`${a.kind ?? "?"} over ${b.width ?? "?"}`),
  };
  const scene = (
    makes
      ? {
          add: { renderTexture, image },
          make: { graphics },
          children,
          ...(canvases ? { textures: { exists: (k: string) => painted.has(k), createCanvas } } : {}),
        }
      : { add: {} }
  ) as unknown as Phaser.Scene;
  return { scene, textures, images, painted, moves };
}

describe("PageRoundel (FS-X2CMM R45, ADR-0094, ADR-0095: four layers of the shared knockout renderer and the ground's light)", () => {
  afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

  it.each([
    [PAGE_ROUNDEL_SIZE.book, 1],
    [PAGE_ROUNDEL_SIZE.castBar, 1.5],
  ])("should lay ground, glyph, bone and rim at %s px and render scale %s, each at 2× the render scale, only the ground casting a shadow", (size, renderScale) => {
    viewport.set({ width: 1080, height: 720, renderScale });
    const env = stage();
    const box = { ...BOX, width: size, height: size };
    const roundel = new PageRoundel({ scene: env.scene, depth: 1000, icon: ICON, size });
    expect(roundel.show(box, "ready")).toBe(true);
    expect(env.textures.map((t) => t.width)).toEqual(Array(4).fill(Math.round(size * 2 * renderScale)));
    expect(env.images).toHaveLength(1);
    const [ground, body, bone, rim] = env.textures;
    expect(ground.tints).toEqual(Array(4).fill(shade(palette.bookPigment.lapis, 0.35)));
    expect(body.tints).toEqual(Array(4).fill(palette.bookPigment.bone));
    expect(bone.tints).toEqual(Array(4).fill(shade(palette.bookPigment.lapis, 0.55)));
    // the rim lit from above: its top two corners lighter than its foot two
    expect(rim.tints![0]).not.toBe(rim.tints![2]);
    roundel.destroy();
  });

  it("should change only its inks with its state and the pointer, building nothing again", () => {
    const env = stage();
    const roundel = new PageRoundel({ scene: env.scene, depth: 1000, icon: ICON, size: PAGE_ROUNDEL_SIZE.book });
    roundel.show(BOX, "ready");
    roundel.show(BOX, "ready", true);
    expect(env.textures[1].alpha).toBe(1);
    roundel.show(BOX, "locked", true);
    expect(env.textures).toHaveLength(4);
    expect(env.textures[1]).toMatchObject({ tints: Array(4).fill(palette.hudFaint), alpha: GREYED_ALPHA });
    expect(env.textures[2].tints).toEqual(Array(4).fill(palette.bookPigment.lockedGround));
    roundel.destroy();
    expect(env.textures.every((t) => t.destroyed)).toBe(true);
  });

  it("should build its layers anew on a render-scale change, in the state last shown", () => {
    const env = stage();
    const roundel = new PageRoundel({ scene: env.scene, depth: 1000, icon: ICON, size: PAGE_ROUNDEL_SIZE.book });
    roundel.show(BOX, "locked");
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.textures).toHaveLength(8);
    expect(env.textures.slice(0, 4).every((t) => t.destroyed)).toBe(true);
    expect(env.textures[5]).toMatchObject({ width: 176, tints: Array(4).fill(palette.hudFaint), alpha: GREYED_ALPHA });
    roundel.destroy();
  });

  it("should light the ground from its centre top with one shared radial per size and render scale, just over the ground, in the state's ink", () => {
    const env = stage(true, true);
    const [a, b] = [0, 1].map(() => new PageRoundel({ scene: env.scene, depth: 1000, icon: ICON, size: PAGE_ROUNDEL_SIZE.book }));
    a.show(BOX, "ready");
    b.show(BOX, "ready", true);
    expect([...env.painted.keys()]).toHaveLength(1);
    const [{ width, stops }] = [...env.painted.values()];
    expect(width).toBe(88);
    // opaque white at the centre falling to clear at the rim: the tint gives it its colour
    expect(stops[0][0]).toBe(0);
    expect(stops[stops.length - 1]).toEqual([1, "rgba(255, 255, 255, 0)"]);
    const lights = env.images.filter((i) => i.texture);
    expect(lights).toHaveLength(2);
    expect(lights[0]).toMatchObject({ tints: [palette.bookPigment.lapis], alpha: 1, x: 122 });
    expect(lights[1].tints).toEqual([mix(palette.bookPigment.lapis, palette.bookPigment.bone, 0.15)]);
    expect(env.moves).toEqual(["image over 88", "image over 88"]);
    a.show(BOX, "locked");
    expect(lights[0].alpha).toBe(0);
    const before = lights[0].texture;
    viewport.set({ width: 1080, height: 720, renderScale: 2 });
    expect(env.painted.size).toBe(2);
    expect(lights[0].texture).not.toBe(before);
    expect(lights.every((l) => l.texture === lights[0].texture)).toBe(true);
    expect(env.moves.slice(2)).toEqual(["image over 176", "image over 176"]);
    a.destroy();
    b.destroy();
    expect(lights.every((l) => l.destroyed)).toBe(true);
  });

  it("should stand on a flat ground where the scene makes no canvas for the light", () => {
    const env = stage();
    const roundel = new PageRoundel({ scene: env.scene, depth: 1000, icon: ICON, size: PAGE_ROUNDEL_SIZE.book });
    expect(roundel.show(BOX, "ready")).toBe(true);
    expect(env.images).toHaveLength(1);
    roundel.destroy();
  });

  it("should say it cannot stand on a scene that makes no textures, and stay down", () => {
    const env = stage(false);
    const roundel = new PageRoundel({ scene: env.scene, depth: 1000, icon: ICON, size: PAGE_ROUNDEL_SIZE.book });
    expect(roundel.show(BOX, "ready")).toBe(false);
    expect(roundel.show(BOX, "ready")).toBe(false);
  });
});

describe("drawPageLines (ADR-0094 \"Fallback\": the glyph as a 2.25 px line in its main pigment)", () => {
  const pen = () => {
    const styles: number[][] = [];
    const g = new Proxy({} as Record<string, unknown>, {
      get: (_t, m: string) => (...args: number[]) => (m === "lineStyle" && styles.push(args), g),
    });
    return { g: g as unknown as AbilityIconPen, styles };
  };

  it.each([
    ["ready", palette.bookPigment.lapis, 0.92],
    ["recovering", palette.bookPigment.lapis, 0.92],
    ["locked", palette.hudFaint, GREYED_ALPHA],
  ] as const)("should stroke a %s page's lines %s wide in its ink", (state, tint, alpha) => {
    const { g, styles } = pen();
    drawPageLines(g, ICON, BOX, PAGE_ROUNDEL_SIZE.book, state);
    expect(styles).toEqual([[GLYPH_LINE_W, tint, alpha]]);
    expect(pageLineInk("lapis", state)).toEqual({ tint, alpha });
  });
});

describe("roundelSweep (ADR-0094 \"Not ready\": a dark sweep over a recovering page)", () => {
  const { inner } = roundelGeometry(PAGE_ROUNDEL_SIZE.book);
  const [cx, cy] = [122, 222];

  it("should sweep nothing at 0 and from the centre along the ground's edge inside the rim otherwise", () => {
    expect(roundelSweep(BOX, PAGE_ROUNDEL_SIZE.book, 0)).toEqual([]);
    const wedge = roundelSweep(BOX, PAGE_ROUNDEL_SIZE.book, 0.4);
    expect(wedge[0]).toEqual({ x: cx, y: cy });
    for (const p of wedge.slice(1)) expect(Math.hypot(p.x - cx, p.y - cy)).toBeCloseTo(inner, 6);
  });

  it("should end at 12 o'clock and start where 40 % of the turn is left, clockwise", () => {
    const wedge = roundelSweep(BOX, PAGE_ROUNDEL_SIZE.book, 0.4);
    const last = wedge[wedge.length - 1];
    expect(last.x).toBeCloseTo(cx, 6);
    expect(last.y).toBeCloseTo(cy - inner, 6);
    const hand = 0.6 * 2 * Math.PI;
    expect(wedge[1].x).toBeCloseTo(cx + Math.sin(hand) * inner, 6);
    expect(wedge[1].y).toBeCloseTo(cy - Math.cos(hand) * inner, 6);
  });

  it("should fill it in the ground's ink about as dark as the ability bar's", () => {
    const calls: unknown[][] = [];
    drawRoundelSweep({ fillStyle: (...a) => calls.push(["fillStyle", ...a]), fillPoints: (p) => calls.push(["fillPoints", p.length]) }, BOX, PAGE_ROUNDEL_SIZE.book, 0.4);
    expect(calls[0]).toEqual(["fillStyle", ROUNDEL_SWEEP.tint, ROUNDEL_SWEEP.alpha]);
    expect(ROUNDEL_SWEEP.tint).toBe(palette.ink);
    expect(calls[1][0]).toBe("fillPoints");
  });
});
