import { describe, expect, it } from "vitest";
import type { BookEffectState } from "@/types/gameState";
import { worldToScreen } from "@/render/iso/projection";
import { palette } from "@/utils/canvasPalette";
import { BookEffectSet, litPoints, WITCHLIGHT_LIT_CELLS, type BookEffectLight } from "./bookEffects";
import type { LayerKind, LookMark } from "./bookLook";
import { runeFlash, RUNE } from "@/render/effects/rune";
import { witchlightDrift, WITCHLIGHT } from "@/render/effects/witchlight";
import { DRAUGHT } from "@/render/effects/draught";

// FS-X2CMM §I R47–R48 (I-X2CMM-12): the run's witchlights, runes and draughts drawn from the state for every
// viewer, going when it does; a witchlight lights the fog's cells; a draught is reached by the interact key.

/** A mark that records what it was painted with and where it stands. */
class Mark implements LookMark {
  calls: [string, ...number[]][] = [];
  x = 0;
  y = 0;
  depth = 0;
  visible = true;
  destroyed = false;
  constructor(
    readonly id: string,
    readonly kind: LayerKind,
  ) {}
  clear() {
    this.calls = [];
  }
  fillStyle(color: number, alpha = 1) {
    this.calls.push(["fillStyle", color, alpha]);
  }
  lineStyle(width: number, color: number, alpha = 1) {
    this.calls.push(["lineStyle", width, color, alpha]);
  }
  fillCircle(x: number, y: number, r: number) {
    this.calls.push(["fillCircle", x, y, r]);
  }
  fillEllipse(x: number, y: number, w: number, h: number) {
    this.calls.push(["fillEllipse", x, y, w, h]);
  }
  strokeEllipse(x: number, y: number, w: number, h: number) {
    this.calls.push(["strokeEllipse", x, y, w, h]);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.calls.push(["fillRect", x, y, w, h]);
  }
  lineBetween(x1: number, y1: number, x2: number, y2: number) {
    this.calls.push(["lineBetween", x1, y1, x2, y2]);
  }
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  setDepth(d: number) {
    this.depth = d;
  }
  setVisible(v: boolean) {
    this.visible = v;
  }
  destroy() {
    this.destroyed = true;
  }
  colours(): number[] {
    return this.calls.filter((c) => c[0] === "fillStyle").map((c) => c[1]);
  }
  strokes(): number[] {
    return this.calls.filter((c) => c[0] === "lineStyle").map((c) => c[2]);
  }
}

function stage(cell = 80) {
  const marks: Mark[] = [];
  const lights: (BookEffectLight & { radius: number; color: number; removed: boolean })[] = [];
  const set = new BookEffectSet<Mark>({
    layer: (id, kind) => {
      const m = new Mark(id, kind);
      marks.push(m);
      return m;
    },
    light: (spec) => {
      const l = { ...spec, removed: false, remove: () => (l.removed = true) };
      lights.push(l);
      return l;
    },
    cell: () => cell,
  });
  const of = (id: string) => marks.filter((m) => m.id === id);
  return { set, marks, lights, of };
}

const witchlight = (over: Partial<BookEffectState> = {}): BookEffectState => ({
  id: "w1",
  kind: "witchlight",
  x: 400,
  y: 240,
  remaining: 20,
  ...over,
});
const rune = (over: Partial<BookEffectState> = {}): BookEffectState => ({
  id: "r1",
  kind: "rune",
  x: 200,
  y: 300,
  remaining: 30,
  ...over,
});
const draught = (over: Partial<BookEffectState> = {}): BookEffectState => ({
  id: "d1",
  kind: "draught",
  x: 100,
  y: 100,
  remaining: 0,
  ...over,
});

describe("the book's world effects drawn from the state (FS-X2CMM R47)", () => {
  it("should draw a witchlight as a warm globe hung over its point, with a halo and a light pool that follows its drift", () => {
    const { set, of, lights } = stage();
    set.sync([witchlight()], 0);
    set.frame(1000);
    const [globe, halo] = of("w1");
    expect([globe.kind, halo.kind]).toEqual(["body", "halo"]);
    const at = worldToScreen(400, 240);
    expect([globe.x, globe.y]).toEqual([at.x, at.y]);
    expect(globe.colours()).toContain(palette.bookEffect.witchlight);
    // hung over the floor, never amber (nothing to act on)
    const circle = globe.calls.find((c) => c[0] === "fillCircle")!;
    expect(circle[2]).toBeLessThan(-WITCHLIGHT.lift + WITCHLIGHT.bob.px + WITCHLIGHT.drift.y + 0.01);
    expect(globe.colours()).not.toContain(palette.interactable);
    expect(lights).toHaveLength(1);
    expect(lights[0].color).toBe(palette.bookEffect.witchlightLight);
    // the pool hangs where the globe does this frame
    expect(lights[0].x - at.x).toBeCloseTo(circle[1]);
    expect(lights[0].y - at.y).toBeCloseTo(circle[2]);
    expect(lights[0].intensity).toBeCloseTo(WITCHLIGHT.pool.intensity);
  });

  it("should bob and drift the globe over time, and hold it still under reduced motion", () => {
    const clock = (ageMs: number, reduced = false) => ({ ageMs, remaining: 20, seed: 0.3, sinceFlashMs: Infinity, reduced });
    const moved = new Set([0, 400, 900, 1700].map((t) => JSON.stringify(witchlightDrift(clock(t)))));
    expect(moved.size).toBeGreaterThan(1);
    const still = new Set([0, 400, 900, 1700].map((t) => JSON.stringify(witchlightDrift(clock(t, true)))));
    expect(still.size).toBe(1);
  });

  it("should fade the witchlight's light out over its last seconds", () => {
    const { set, lights } = stage();
    set.sync([witchlight({ remaining: 0.75 })], 0);
    set.frame(1000);
    expect(lights[0].intensity).toBeLessThan(WITCHLIGHT.pool.intensity * 0.5);
  });

  it("should draw a rune as a madder ring on the floor 1.5 cells across", () => {
    const { set, of, lights } = stage();
    set.sync([rune()], 0);
    set.frame(500);
    const [ground, halo] = of("r1");
    expect([ground.kind, halo.kind]).toEqual(["ground", "halo"]);
    expect(ground.strokes()).toContain(palette.bookEffect.rune);
    const ring = ground.calls.find((c) => c[0] === "strokeEllipse")!;
    // 0.75 cells of 80 px, projected: 2 × 60 × 0.8 × √2 across
    expect(ring[3]).toBeCloseTo(2 * RUNE.radiusCells * 80 * 0.8 * Math.SQRT2);
    expect(lights).toHaveLength(0);
  });

  it("should flash the rune when its catches climb, and not for catches it was first seen with", () => {
    const { set, of } = stage();
    set.sync([rune({ caught: 1 })], 0);
    set.frame(1000);
    const flashAlpha = () => of("r1")[1].calls.find((c) => c[0] === "lineStyle")![3];
    const resting = flashAlpha();
    set.sync([rune({ caught: 2 })], 2000);
    set.frame(2000);
    expect(flashAlpha()).toBeGreaterThan(resting + 0.5);
    set.frame(2000 + RUNE.flash.ms);
    expect(flashAlpha()).toBeCloseTo(resting);
    expect(runeFlash({ ageMs: 0, remaining: 1, seed: 0, sinceFlashMs: 0, reduced: false })).toBe(1);
  });

  it("should draw a draught as a small flask of the health potion's oxblood in the interactable's amber pool", () => {
    const { set, of, lights } = stage();
    set.sync([draught()], 0);
    set.frame(500);
    const [flask] = of("d1");
    expect(flask.kind).toBe("body");
    expect(flask.colours()).toEqual(expect.arrayContaining([palette.bookEffect.draughtLiquid, palette.bookEffect.draughtStopper]));
    expect(lights[0].color).toBe(palette.interactable);
    expect(lights[0].y).toBe(worldToScreen(100, 100).y - DRAUGHT.poolLift);
  });

  it("should take an effect away, its layers and its light, the state it leaves", () => {
    const { set, of, lights } = stage();
    set.sync([witchlight(), rune(), draught()], 0);
    set.sync([rune()], 100);
    expect(of("w1").every((m) => m.destroyed)).toBe(true);
    expect(of("d1").every((m) => m.destroyed)).toBe(true);
    expect(of("r1").some((m) => m.destroyed)).toBe(false);
    expect(lights.map((l) => l.removed)).toEqual([true, true]);
    set.sync(undefined, 200);
    expect(of("r1").every((m) => m.destroyed)).toBe(true);
    expect(set.placed()).toEqual([]);
  });

  it("should draw a kind it does not know as nothing", () => {
    const { set, marks, lights } = stage();
    set.sync([{ id: "h1", kind: "hound", x: 0, y: 0, remaining: 40 }], 0);
    expect([marks.length, lights.length, set.placed().length]).toEqual([0, 0, 0]);
  });

  it("should keep one look per effect across states, made once", () => {
    const { set, marks, lights } = stage();
    set.sync([witchlight()], 0);
    set.sync([witchlight({ remaining: 19.9 })], 100);
    set.sync([witchlight({ remaining: 19.8 })], 200);
    expect([marks.length, lights.length]).toEqual([2, 1]);
  });

  it("should hide an effect, its light too, where the hide rule says it is unseen, and show it again", () => {
    const { set, of, lights } = stage();
    set.sync([witchlight(), rune()], 0);
    set.hideWhere((at) => at.x === 400);
    expect(of("w1").map((m) => m.visible)).toEqual([false, false]);
    expect(lights[0].hidden).toBe(true);
    expect(of("r1").map((m) => m.visible)).toEqual([true, true]);
    set.hideWhere(() => false);
    expect(of("w1").map((m) => m.visible)).toEqual([true, true]);
    expect(lights[0].hidden).toBe(false);
  });

  it("should clear every effect and its light when the floor goes, and forget without touching on a reset", () => {
    const a = stage();
    a.set.sync([witchlight(), draught()], 0);
    a.set.clear();
    expect(a.marks.every((m) => m.destroyed)).toBe(true);
    expect(a.lights.every((l) => l.removed)).toBe(true);
    const b = stage();
    b.set.sync([witchlight()], 0);
    b.set.forget();
    expect(b.marks.some((m) => m.destroyed)).toBe(false);
    expect(b.set.placed()).toEqual([]);
  });
});

describe("a draught is reached by the interact key (FS-X2CMM R27, R47)", () => {
  it("should name the nearest draught within the interact reach, by its id, and none past it", () => {
    const { set } = stage();
    set.sync([draught(), draught({ id: "d2", x: 130 }), witchlight({ x: 110, y: 100 })], 0);
    expect(set.nearbyDraught({ x: 125, y: 100 })).toBe("d2");
    expect(set.nearbyDraught({ x: 100, y: 159 })).toBe("d1");
    expect(set.nearbyDraught({ x: 100, y: 161 })).toBeNull();
  });
});

describe("the witchlights' lit points for the fog (FS-X2CMM R48)", () => {
  it("should make one lit point of 3 cells per witchlight, and none for a rune or draught", () => {
    expect(WITCHLIGHT_LIT_CELLS).toBe(3);
    expect(litPoints([witchlight(), rune(), draught(), witchlight({ id: "w2", x: 10, y: 20 })])).toEqual([
      { at: { x: 400, y: 240 }, cells: 3 },
      { at: { x: 10, y: 20 }, cells: 3 },
    ]);
    expect(litPoints(undefined)).toEqual([]);
  });
});
