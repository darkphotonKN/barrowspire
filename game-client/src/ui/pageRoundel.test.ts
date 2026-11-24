import { afterEach, describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { palette } from "@/utils/canvasPalette";
import { circle, type AbilityIconPen } from "./abilityIcons";
import { BRONZE, GREYED_ALPHA } from "./knockout";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import {
  PAGE_ROUNDEL_SIZE,
  PageRoundel,
  ROUNDEL_SWEEP,
  drawPageLines,
  drawRoundelSweep,
  pageLineInk,
  roundelGeometry,
  roundelInk,
  roundelSweep,
  type PageIcon,
} from "./pageRoundel";

// FS-X2CMM §I R45, ADR-0094 (I-X2CMM-9): a class book page is a muted pigment glyph in a bronze-rimmed
// roundel, its state changing only the inks its layers wear.

describe("roundelInk (FS-X2CMM R45, ADR-0094: a page's state to its inks)", () => {
  it("should ink a locked roundel's glyph flat in hudFaint at 0.6, never brightening under the pointer", () => {
    const { body } = roundelInk("lapis", "locked");
    expect(body.flat).toBe(true);
    expect(body.idle).toEqual({ tint: palette.hudFaint, alpha: GREYED_ALPHA });
    expect(body.hover).toEqual(body.idle);
  });
});

describe("roundelInk (the other states)", () => {
  const LAYERS = ["ground", "body", "bone", "rim"] as const;

  it("should ink a ready glyph flat in its pigment and bone, its rim bronze lit from above, every alpha to 1 and the rim lifted under the pointer", () => {
    const ink = roundelInk("ochre", "ready");
    expect(ink.body).toMatchObject({ flat: true, idle: { tint: palette.bookPigment.ochre }, hover: { tint: palette.bookPigment.ochre, alpha: 1 } });
    expect(ink.body.idle.alpha).toBeLessThan(1);
    expect(ink.bone).toMatchObject({ flat: true, idle: { tint: palette.bookPigment.bone }, hover: { alpha: 1 } });
    expect(ink.rim.flat).toBeFalsy();
    expect(ink.rim.idle).toEqual(BRONZE.idle);
    expect(ink.rim.hover).toEqual(BRONZE.hover);
    expect(ink.ground.idle).toEqual({ tint: palette.ink, alpha: 1 });
  });

  it("should keep a recovering glyph's pigment, as ready at rest, and never lift it", () => {
    const [ready, recovering] = [roundelInk("madder", "ready"), roundelInk("madder", "recovering")];
    for (const layer of LAYERS) {
      expect(recovering[layer].idle, layer).toEqual(ready[layer].idle);
      expect(recovering[layer].hover, layer).toEqual(recovering[layer].idle);
    }
  });

  it("should sink a dim glyph toward the ground, darker than its pigment, and never lift it", () => {
    const ink = roundelInk("verdigris", "dim");
    const lum = (c: number) => ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);
    expect(lum(ink.body.idle.tint)).toBeLessThan(lum(palette.bookPigment.verdigris));
    expect(lum(ink.bone.idle.tint)).toBeLessThan(lum(palette.bookPigment.bone));
    for (const layer of LAYERS) expect(ink[layer].hover, layer).toEqual(ink[layer].idle);
  });

  it("should ink a locked roundel's bone in the ground's ink, so its detail reads as cuts, and leave its rim unlit", () => {
    const ink = roundelInk("ochre", "locked");
    expect(ink.bone).toMatchObject({ flat: true, idle: { tint: palette.ink, alpha: 1 } });
    expect(ink.rim.flat).toBe(true);
    expect(ink.rim.idle.tint).not.toBe(BRONZE.idle.tint);
    expect(ink.rim.hover).toEqual(ink.rim.idle);
    for (const layer of LAYERS) expect(Object.values(palette.bookPigment), layer).not.toContain(ink[layer].idle.tint);
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
function stage(makes = true) {
  const textures: { width: number; tints?: number[]; alpha?: number; x?: number; destroyed: boolean }[] = [];
  const images: { tints?: number[]; destroyed: boolean }[] = [];
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
  const image = () => {
    const i: (typeof images)[number] = { destroyed: false };
    images.push(i);
    const self: Record<string, unknown> = {};
    for (const m of ["setScrollFactor", "setDepth", "setScale", "setPosition", "setTintMode", "setAlpha"]) self[m] = () => self;
    self.setTint = (...c: number[]) => ((i.tints = c), self);
    self.destroy = () => void (i.destroyed = true);
    return self;
  };
  const scene = (makes ? { add: { renderTexture, image }, make: { graphics }, children: { moveBelow: () => {} } } : { add: {} }) as unknown as Phaser.Scene;
  return { scene, textures, images };
}

describe("PageRoundel (FS-X2CMM R45, ADR-0094: four layers of the shared knockout renderer)", () => {
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
    expect(ground.tints).toEqual(Array(4).fill(palette.ink));
    expect(body.tints).toEqual(Array(4).fill(palette.bookPigment.lapis));
    expect(bone.tints).toEqual(Array(4).fill(palette.bookPigment.bone));
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
    expect(env.textures[2].tints).toEqual(Array(4).fill(palette.ink));
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
