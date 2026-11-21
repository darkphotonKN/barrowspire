import { afterEach, describe, expect, it, vi } from "vitest";
import { GLYPH_LINE_W } from "./MailboxEnvelope";
import { ABILITY_ICONS, ABILITY_ICON_SLOT, type AbilityIconPen } from "./abilityIcons";
import { BRONZE, GREYED, Knockout, type Pt } from "./knockout";
import { PASSIVE_ICONS, PASSIVE_ICON_KEYS, drawPassiveIconLines, nodeIcon, type PassiveIconKey } from "./passiveIcons";

// FS-8RZ51 §G R40 (I-8RZ51-10, I-8RZ51-11): the passive tree's four shared filler pictures and every
// class's six each, bronze knockouts for the one renderer (ADR-0080) with their line glyphs, in the
// ability bar's shape (`AbilityIcon`) and its 30 px box.

const EVERY = [
  "health",
  "reserve",
  "attribute",
  "regen",
  "heavy_hand",
  "thick_skin",
  "long_wind",
  "bull_rush",
  "guardian",
  "berserker",
  "kindling",
  "deep_well",
  "wide_volley",
  "searing",
  "spellwarden",
  "pyromancer",
  "quick_draw",
  "fleet_foot",
  "eagle_eye",
  "hunters_breath",
  "hunter",
  "shadow_ranger",
  "keen_edge",
  "practiced_guard",
  "bloodied_riposte",
  "steady_hand",
  "duelist",
  "sellsword",
] as const;

const HALF = ABILITY_ICON_SLOT / 2;
const inSlot = ([x, y]: Pt) => Math.abs(x) <= HALF && Math.abs(y) <= HALF;

/** A recording pen: lines only, as the fallback's graphics. */
function pen() {
  const calls: { m: string; args: number[] }[] = [];
  const rec =
    (m: string) =>
    (...args: number[]) => {
      calls.push({ m, args });
      return g;
    };
  const g = {
    lineStyle: rec("lineStyle"),
    beginPath: rec("beginPath"),
    moveTo: rec("moveTo"),
    lineTo: rec("lineTo"),
    closePath: rec("closePath"),
    strokePath: rec("strokePath"),
    strokeCircle: rec("strokeCircle"),
  };
  return { g: g as unknown as AbilityIconPen, calls };
}

/**
 * A scene that can make textures, as the game's does: every call chains, and the render texture and
 * its shadow record their tint and alpha.
 */
function texturingScene() {
  const images: { tints: number[]; alpha?: number }[] = [];
  const chain = (rec: { tints: number[]; alpha?: number }, extra: Record<string, unknown> = {}): unknown => {
    const self: unknown = new Proxy(extra, {
      get: (t, prop: string) => {
        if (prop in t) return t[prop];
        if (prop === "setTint") return (...tints: number[]) => ((rec.tints = tints), self);
        if (prop === "setAlpha") return (a: number) => ((rec.alpha = a), self);
        return () => self;
      },
    });
    return self;
  };
  const scene = {
    make: { graphics: () => chain({ tints: [] }) },
    add: {
      renderTexture: (_x: number, _y: number, width: number, height: number) => {
        const rec = { tints: [] as number[] };
        images.push(rec);
        return chain(rec, { width, height, texture: {} });
      },
      image: () => chain({ tints: [] }),
    },
    children: { moveBelow: () => {} },
  };
  return { scene: scene as never, images };
}

describe("passiveIcons (FS-8RZ51 R40: the filler four, and six per class)", () => {
  it("should key the twenty-eight pictures by what they show", () => {
    expect([...PASSIVE_ICON_KEYS].sort()).toEqual([...EVERY].sort());
    expect(Object.keys(PASSIVE_ICONS).sort()).toEqual([...EVERY].sort());
  });

  it("should make no copy of a tree ability's picture: the tier-3 nodes draw the ability bar's", () => {
    for (const key of ["earthbreaker", "blink", "arrow_rain", "settle_the_debt"]) expect(Object.hasOwn(PASSIVE_ICONS, key)).toBe(false);
  });

  it("should hand a node its picture by key: the tree's own, or the tree ability's from the ability bar itself", () => {
    expect(nodeIcon("guardian")).toBe(PASSIVE_ICONS.guardian);
    expect(nodeIcon("earthbreaker")).toBe(ABILITY_ICONS.earthbreaker);
    expect(nodeIcon("blink")).toBe(ABILITY_ICONS.blink);
    expect(nodeIcon("arrow_rain")).toBe(ABILITY_ICONS.arrow_rain);
    expect(nodeIcon("settle_the_debt")).toBe(ABILITY_ICONS.settle_the_debt);
  });

  it.each(EVERY)("should give %s a silhouette and its points, cuts and holes inside the 30 px box", (key) => {
    const { picture } = PASSIVE_ICONS[key];
    expect(picture.silhouette.length).toBeGreaterThan(0);
    for (const shape of picture.silhouette) {
      expect(shape.length, `${key}: a closed shape has at least three points`).toBeGreaterThanOrEqual(3);
      for (const p of shape) expect(inSlot(p), `${key} silhouette point ${p}`).toBe(true);
    }
    for (const cut of picture.cuts) {
      if ("ring" in cut) {
        const { x, y, r } = cut.ring;
        expect(Math.abs(x) + r <= HALF && Math.abs(y) + r <= HALF, `${key} ring`).toBe(true);
      } else {
        expect(cut.path.length, `${key}: a cut runs through two points at least`).toBeGreaterThanOrEqual(2);
        for (const p of cut.path) expect(inSlot(p), `${key} cut point ${p}`).toBe(true);
      }
    }
    for (const { x, y, r } of picture.holes ?? []) {
      expect(Math.abs(x) + r <= HALF && Math.abs(y) + r <= HALF, `${key} hole`).toBe(true);
    }
  });

  it.each(EVERY)("should give %s every point a finite number", (key) => {
    const { picture, lines } = PASSIVE_ICONS[key];
    const all = [
      ...picture.silhouette.flat(),
      ...picture.cuts.flatMap((c) => ("ring" in c ? [] : c.path)),
      ...lines.flatMap((c) => ("ring" in c ? [] : c.path)),
    ];
    for (const [x, y] of all) expect(Number.isFinite(x) && Number.isFinite(y), key).toBe(true);
  });
});

describe("passiveIcons through the one renderer (ADR-0080)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(EVERY)("should draw %s as a knockout on a scene that makes textures, falling back to nothing", (key) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { scene, images } = texturingScene();
    const lost = vi.fn();
    const knockout = new Knockout({ scene, depth: 1105, picture: PASSIVE_ICONS[key].picture, ink: BRONZE, lost });
    expect(knockout.show({ x: 100, y: 100, width: 36, height: 36 }, false)).toBe(true);
    expect(images).toHaveLength(1);
    expect(lost).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    knockout.destroy();
  });

  it("should stand greyed flat in the faint grey at the greyed alpha", () => {
    const { scene, images } = texturingScene();
    new Knockout({ scene, depth: 1105, picture: PASSIVE_ICONS.guardian.picture, ink: GREYED }).show({ x: 0, y: 0, width: 36, height: 36 }, false);
    expect(images[0].tints).toEqual([GREYED.idle.tint]);
    expect(images[0].alpha).toBe(GREYED.idle.alpha);
  });
});

describe("passiveIcons (ADR-0080 fallback: a line glyph where no texture can be made)", () => {
  it.each(EVERY)("should give %s a non-empty line glyph inside the box", (key) => {
    const { lines } = PASSIVE_ICONS[key];
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      if ("ring" in line) expect(line.ring.r).toBeGreaterThan(0);
      else {
        expect(line.path.length).toBeGreaterThanOrEqual(2);
        for (const p of line.path) expect(inSlot(p), `${key} line point ${p}`).toBe(true);
      }
    }
  });

  it.each(EVERY)("should stroke %s's glyph in the row's line width about the box's centre, in its ink, filling nothing", (key) => {
    const { g, calls } = pen();
    drawPassiveIconLines(g, key as PassiveIconKey, 100, 50, 7, 0.6);
    expect(calls[0]).toEqual({ m: "lineStyle", args: [GLYPH_LINE_W, 7, 0.6] });
    const strokes = calls.filter((c) => c.m === "strokePath" || c.m === "strokeCircle");
    expect(strokes.length).toBe(PASSIVE_ICONS[key].lines.length);
    for (const c of calls.filter((c) => c.m === "moveTo" || c.m === "lineTo" || c.m === "strokeCircle")) {
      expect(Math.abs(c.args[0] - 100)).toBeLessThanOrEqual(HALF);
      expect(Math.abs(c.args[1] - 50)).toBeLessThanOrEqual(HALF);
    }
    expect(calls.some((c) => c.m.startsWith("fill"))).toBe(false);
  });
});
