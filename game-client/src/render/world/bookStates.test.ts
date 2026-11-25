import { describe, expect, it } from "vitest";
import { worldToScreen } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { palette } from "@/utils/canvasPalette";
import { AFLOAT } from "@/render/effects/afloat";
import { BookStateMarks, STATE_LOOKS } from "./bookStates";
import type { BodyLayerKind, LookMark } from "./bookLook";

// FS-X2CMM §I R47 (I-X2CMM-12): afloat, hardened, long night, tracker's eye and the draught's heal drawn on
// every body that carries them, for every viewer, from the state, and gone when it goes.

class Mark implements LookMark {
  calls: [string, ...number[]][] = [];
  x = 0;
  y = 0;
  depth = 0;
  visible = true;
  destroyed = false;
  constructor(
    readonly body: string,
    readonly state: string,
    readonly kind: BodyLayerKind,
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
  /** Every colour it was painted in, fills and strokes alike. */
  inks(): number[] {
    return this.calls.flatMap((c) => (c[0] === "fillStyle" ? [c[1]] : c[0] === "lineStyle" ? [c[2]] : []));
  }
}

function stage(reducedMotion = false) {
  const marks: Mark[] = [];
  const states = new BookStateMarks<Mark>({
    layer: (body, state, kind) => {
      const m = new Mark(body, state, kind);
      marks.push(m);
      return m;
    },
    reducedMotion,
  });
  return { states, marks, of: (body: string, state: string) => marks.filter((m) => m.body === body && m.state === state) };
}

const feet = { x: 300, y: 200 };

describe("the book's delver states drawn on every body (FS-X2CMM R47)", () => {
  it.each([
    ["afloat", "ground", palette.bookEffect.afloatShadow],
    ["hardened", "front", palette.bookEffect.hardened],
    ["long_night", "ground", palette.bookEffect.longNight],
    ["trackers_eye", "ground", palette.bookEffect.trackersEye],
    ["draught", "front", palette.bookEffect.draughtHeal],
  ] as const)("should draw %s on its body's %s, in its own ink", (name, kind, ink) => {
    const { states, of } = stage();
    states.sync([["self", [{ name, remaining: 5 }]]], 0);
    states.follow("self", feet, 80, 600);
    const [mark] = of("self", name);
    expect(mark.kind).toBe(kind);
    expect(mark.inks()).toContain(ink);
    const at = worldToScreen(feet.x, feet.y);
    expect([mark.x, mark.y]).toEqual([at.x, at.y]);
  });

  it("should give each of the five names a look, and draw a name it does not know as nothing", () => {
    expect(Object.keys(STATE_LOOKS).sort()).toEqual(["afloat", "draught", "hardened", "long_night", "trackers_eye"]);
    const { states, marks } = stage();
    states.sync([["self", [{ name: "warded", remaining: 3 }]]], 0);
    expect(marks).toHaveLength(0);
  });

  it("should never colour the heal green (guideline: healing takes health's own colour)", () => {
    const { states, of } = stage();
    states.sync([["p2", [{ name: "draught", remaining: 6 }]]], 0);
    states.follow("p2", feet, 80, 700);
    expect(of("p2", "draught")[0].inks()).not.toEqual(expect.arrayContaining([palette.bookPigment.verdigris]));
  });

  it("should sort a front layer in front of the body it rides on", () => {
    const { states, of } = stage();
    states.sync([["self", [{ name: "hardened", remaining: 10 }]]], 0);
    states.follow("self", feet, 80, 100);
    expect(of("self", "hardened")[0].depth).toBeGreaterThan(worldDepth(feet.x, feet.y, 1));
  });

  it("should lift an afloat body a little, easing up, and nothing else", () => {
    const { states } = stage(true);
    states.sync(
      [
        ["self", [{ name: "afloat", remaining: 8 }]],
        ["p2", [{ name: "hardened", remaining: 8 }]],
      ],
      0,
    );
    expect(states.lift("self", 0)).toBe(0);
    expect(states.lift("self", AFLOAT.riseMs / 2)).toBeGreaterThan(0);
    expect(states.lift("self", AFLOAT.riseMs)).toBeCloseTo(AFLOAT.lift);
    expect(states.lift("p2", 1000)).toBe(0);
    expect(states.lift("nobody", 1000)).toBe(0);
  });

  it("should take a state's marks away the state it goes, and a body's when the body leaves the state", () => {
    const { states, of } = stage();
    states.sync(
      [
        ["self", [{ name: "afloat", remaining: 8 }, { name: "trackers_eye", remaining: 15 }]],
        ["p2", [{ name: "long_night", remaining: 6 }]],
      ],
      0,
    );
    states.sync(
      [
        ["self", [{ name: "trackers_eye", remaining: 14 }]],
        ["p2", undefined],
      ],
      1000,
    );
    expect(of("self", "afloat")[0].destroyed).toBe(true);
    expect(of("self", "trackers_eye")[0].destroyed).toBe(false);
    expect(of("p2", "long_night")[0].destroyed).toBe(true);
    expect(states.lift("self", 2000)).toBe(0);
    states.sync([], 2000);
    expect(of("self", "trackers_eye")[0].destroyed).toBe(true);
  });

  it("should make a state's marks once however many states carry it", () => {
    const { states, marks } = stage();
    for (let t = 0; t < 5; t++) states.sync([["self", [{ name: "hardened", remaining: 10 - t }]]], t * 100);
    expect(marks).toHaveLength(1);
  });

  it("should hide a body's marks with its body, and show them when it is drawn again", () => {
    const { states, of } = stage();
    states.sync([["p2", [{ name: "long_night", remaining: 6 }]]], 0);
    states.follow("p2", null, 80, 100);
    expect(of("p2", "long_night")[0].visible).toBe(false);
    states.follow("p2", feet, 80, 200);
    expect(of("p2", "long_night")[0].visible).toBe(true);
  });

  it("should clear every mark when the world goes", () => {
    const { states, marks } = stage();
    states.sync([["self", [{ name: "afloat", remaining: 8 }]], ["p2", [{ name: "hardened", remaining: 8 }]]], 0);
    states.clear();
    expect(marks.every((m) => m.destroyed)).toBe(true);
  });
});
