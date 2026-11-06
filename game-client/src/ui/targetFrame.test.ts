import { describe, expect, it } from "vitest";
import { MARKER_BAR } from "@/render/markers";
import type { MonsterState } from "@/types/gameState";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import {
  TARGET_FADE_IN_MS,
  TARGET_BOSS_FRAME,
  TARGET_FADE_OUT_MS,
  TARGET_FRAME,
  TARGET_FRAME_DEPTH,
  TargetFrame,
  fadeStep,
  targetFrameRect,
  type TargetFrameStage,
} from "./targetFrame";

// FS-48CTQ §C.4, §C.8, §E.14–17 (I-48CTQ-1): the target frame at the top centre.
// §D.12, §E.14 (I-48CTQ-2): the boss's wider frame.

const monster = (fields: Partial<MonsterState> = {}): MonsterState => ({
  entity_id: "m1",
  archetype: "ghoul",
  name: "Ghoul",
  level: 14,
  elite: false,
  boss: false,
  position: { x: 0, y: 0 },
  facing: { x: 1, y: 0 },
  action: "idle",
  current_health: 30,
  max_health: 120,
  ...fields,
});

/** A stand-in for the scene's factory: records each text and graphics, as they were left. */
function fakeStage() {
  const texts: ReturnType<typeof fakeText>[] = [];
  const graphics: ReturnType<typeof fakeGraphics>[] = [];
  const stage: TargetFrameStage = {
    text: (content, style) => {
      const t = fakeText(content, style);
      texts.push(t);
      return t;
    },
    graphics: () => {
      const g = fakeGraphics();
      graphics.push(g);
      return g;
    },
  };
  return { stage, texts, graphics };
}

function fakeText(
  content: string,
  style: { color: string; fontFamily: string },
) {
  const t = {
    content,
    style,
    x: 0,
    y: 0,
    alpha: 1,
    visible: true,
    depth: 0,
    scrollFactor: 1,
    destroyed: false,
    /** Roughly what a 15 px glyph sets at. */
    get width() {
      return t.content.length * 8;
    },
    setText(s: string) {
      t.content = s;
      return t;
    },
    setPosition(x: number, y: number) {
      t.x = x;
      t.y = y;
      return t;
    },
    setOrigin() {
      return t;
    },
    setAlpha(a: number) {
      t.alpha = a;
      return t;
    },
    setVisible(v: boolean) {
      t.visible = v;
      return t;
    },
    setDepth(d: number) {
      t.depth = d;
      return t;
    },
    setScrollFactor(f: number) {
      t.scrollFactor = f;
      return t;
    },
    destroy() {
      t.destroyed = true;
    },
  };
  return t;
}

function fakeGraphics() {
  let colour = 0;
  const g = {
    fills: [] as {
      colour: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }[],
    strokes: [] as {
      colour: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }[],
    lineColour: 0,
    alpha: 1,
    visible: true,
    depth: 0,
    scrollFactor: 1,
    destroyed: false,
    clear() {
      g.fills = [];
      g.strokes = [];
      return g;
    },
    fillStyle(c: number) {
      colour = c;
      return g;
    },
    fillRect(x: number, y: number, w: number, h: number) {
      g.fills.push({ colour, x, y, w, h });
      return g;
    },
    lineStyle(_w: number, c: number) {
      g.lineColour = c;
      return g;
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      g.strokes.push({ colour: g.lineColour, x, y, w, h });
      return g;
    },
    setAlpha(a: number) {
      g.alpha = a;
      return g;
    },
    setVisible(v: boolean) {
      g.visible = v;
      return g;
    },
    setDepth(d: number) {
      g.depth = d;
      return g;
    },
    setScrollFactor(f: number) {
      g.scrollFactor = f;
      return g;
    },
    destroy() {
      g.destroyed = true;
    },
  };
  return g;
}

/** A frame shown at full alpha on `target`, centred on `centreX`. */
function shownFrame(target: MonsterState, centreX = 540) {
  const parts = fakeStage();
  const frame = new TargetFrame(parts.stage, () => centreX);
  frame.update(TARGET_FADE_IN_MS, target, false);
  const live = () => parts.texts.filter((t) => t.visible && t.content !== "");
  return { ...parts, frame, live };
}

describe("targetFrameRect (FS-48CTQ §E.14: top centre, at most 280 × 52)", () => {
  it.each([540, 640])("should hang from y 10, centred on %i", (centreX) => {
    const r = targetFrameRect(centreX);
    expect(r.y).toBe(10);
    expect(r.x + r.width / 2).toBe(centreX);
  });

  it("should fit within 280 × 52", () => {
    expect(TARGET_FRAME.width).toBeLessThanOrEqual(280);
    expect(TARGET_FRAME.height).toBeLessThanOrEqual(52);
  });
});

describe("fadeStep (FS-48CTQ §C.8: in over 120 ms, out over 200 ms)", () => {
  it("should be 120 ms in and 200 ms out", () => {
    expect(TARGET_FADE_IN_MS).toBe(120);
    expect(TARGET_FADE_OUT_MS).toBe(200);
  });

  it.each([
    [0, 60, true, 0.5],
    [0.5, 60, true, 1],
    [1, 100, true, 1],
    [1, 100, false, 0.5],
    [0.5, 100, false, 0],
    [0, 100, false, 0],
  ])(
    "from alpha %s over %s ms, showing %s, should reach %s",
    (from, ms, showing, want) => {
      expect(fadeStep(from, ms, showing)).toBeCloseTo(want);
    },
  );
});

describe("TargetFrame (FS-48CTQ §C.4, §E.17)", () => {
  it("should start hidden, in the HUD band and fixed to the screen", () => {
    const { stage, texts, graphics } = fakeStage();
    new TargetFrame(stage, () => 540);
    const parts = [...texts, ...graphics];
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every((p) => !p.visible)).toBe(true);
    expect(
      parts.every((p) => p.depth >= TARGET_FRAME_DEPTH && p.scrollFactor === 0),
    ).toBe(true);
    expect(TARGET_FRAME_DEPTH).toBeGreaterThanOrEqual(1000);
  });

  it("should name a common monster by its plate, in the hostile channel and the body serif", () => {
    const { live } = shownFrame(monster());
    expect(live().map((t) => t.content)).toEqual(["Ghoul · Lv 14"]);
    expect(live()[0].style.color).toBe(toCss(palette.markerHostile));
    expect(live()[0].style.fontFamily).toBe(CANVAS_FONT.body);
  });

  it("should letter an elite's prefix apart in the hostile accent, the pair centred", () => {
    const { live } = shownFrame(
      monster({ name: "Hollow Ghoul", elite: true }),
      540,
    );
    const prefix = live().find((t) => t.content === "Hollow")!;
    const rest = live().find((t) => t.content === "Ghoul · Lv 14")!;
    expect(prefix.style.color).toBe(toCss(palette.markerElite));
    expect(rest.style.color).toBe(toCss(palette.markerHostile));
    // prefix right-anchored, the rest centre-anchored, as on the plate
    const left = prefix.x - prefix.width;
    const right = rest.x + rest.width / 2;
    expect((left + right) / 2).toBeCloseTo(540, 0);
    expect(prefix.y).toBe(rest.y);
  });

  it("should back it with the HUD panel and a brass rim, and fill the bar in the marker bar's colours", () => {
    const { graphics } = shownFrame(
      monster({ current_health: 30, max_health: 120 }),
    );
    const fills = graphics.flatMap((g) => g.fills);
    const strokes = graphics.flatMap((g) => g.strokes);
    const r = targetFrameRect(540);
    expect(fills[0]).toMatchObject({
      colour: palette.hudPanel,
      x: r.x,
      y: r.y,
      w: r.width,
      h: r.height,
    });
    expect(
      strokes.some((s) => s.colour === palette.frame && s.w === r.width),
    ).toBe(true);
    const backing = fills.find((f) => f.colour === MARKER_BAR.backing)!;
    const hp = fills.find((f) => f.colour === MARKER_BAR.hp)!;
    expect(hp.w).toBeCloseTo(backing.w / 4, 0);
    // the bar sits inside the frame
    expect(backing.x).toBeGreaterThan(r.x);
    expect(backing.y + backing.h).toBeLessThan(r.y + r.height);
  });

  it.each([
    ["above its maximum", 150, 120, 1],
    ["with no maximum", 5, 0, 1],
    ["below zero", -4, 120, 0],
  ])("should clamp the bar to 0–1 with health %s", (_, hp, max, ratio) => {
    const { graphics } = shownFrame(
      monster({ current_health: hp, max_health: max }),
    );
    const fills = graphics.flatMap((g) => g.fills);
    const backing = fills.find((f) => f.colour === MARKER_BAR.backing)!;
    const fill = fills.filter((f) => f.colour === MARKER_BAR.hp);
    expect(fill.reduce((w, f) => w + f.w, 0)).toBeCloseTo(backing.w * ratio, 0);
  });

  it("should follow the monster's health every update", () => {
    const parts = fakeStage();
    const frame = new TargetFrame(parts.stage, () => 540);
    frame.update(16, monster({ current_health: 120 }), false);
    frame.update(16, monster({ current_health: 60 }), false);
    const fills = parts.graphics.flatMap((g) => g.fills);
    const backing = fills.find((f) => f.colour === MARKER_BAR.backing)!;
    const hp = fills.find((f) => f.colour === MARKER_BAR.hp)!;
    expect(hp.w).toBeCloseTo(backing.w / 2, 0);
  });
});

describe("TargetFrame fades and covers (FS-48CTQ §C.8, §E.15–16)", () => {
  const alphas = (parts: ReturnType<typeof fakeStage>) =>
    [...parts.texts, ...parts.graphics]
      .filter((p) => p.visible)
      .map((p) => p.alpha);

  it("should fade in over 120 ms", () => {
    const parts = fakeStage();
    const frame = new TargetFrame(parts.stage, () => 540);
    frame.update(60, monster(), false);
    expect(new Set(alphas(parts))).toEqual(new Set([0.5]));
    frame.update(60, monster(), false);
    expect(new Set(alphas(parts))).toEqual(new Set([1]));
  });

  it("should fade out over 200 ms, still naming the monster it showed, then hide", () => {
    const { frame, texts, graphics, live } = shownFrame(monster());
    frame.update(100, null, false);
    expect(live().map((t) => [t.content, t.alpha])).toEqual([
      ["Ghoul · Lv 14", 0.5],
    ]);
    frame.update(100, null, false);
    expect([...texts, ...graphics].every((p) => !p.visible)).toBe(true);
  });

  it("should switch from one monster to another at once, with no fade", () => {
    const { frame, live } = shownFrame(monster());
    frame.update(
      16,
      monster({ entity_id: "m2", name: "Troll", archetype: "troll", level: 9 }),
      false,
    );
    expect(live().map((t) => [t.content, t.alpha])).toEqual([
      ["Troll · Lv 9", 1],
    ]);
  });

  it("should drop a common monster's line when it goes from an elite to it", () => {
    const { frame, live } = shownFrame(
      monster({ name: "Hollow Ghoul", elite: true }),
    );
    frame.update(16, monster({ entity_id: "m2" }), false);
    expect(live().map((t) => t.content)).toEqual(["Ghoul · Lv 14"]);
  });

  it("should hide at once while covered (the spectate HUD, the floor-change veil), and fade back after", () => {
    const { frame, texts, graphics } = shownFrame(monster());
    frame.update(16, monster(), true);
    expect([...texts, ...graphics].every((p) => !p.visible)).toBe(true);
    frame.update(60, monster(), false);
    expect(texts.find((t) => t.visible)?.alpha).toBeCloseTo(0.5);
  });

  it("should re-anchor on the centre it is given at relayout (a resize)", () => {
    let centre = 540;
    const parts = fakeStage();
    const frame = new TargetFrame(parts.stage, () => centre);
    frame.update(TARGET_FADE_IN_MS, monster(), false);
    centre = 640;
    frame.relayout();
    const r = targetFrameRect(640);
    const panel = parts.graphics.flatMap((g) => g.fills)[0];
    expect(panel.x).toBe(r.x);
    expect(parts.texts.find((t) => t.visible)!.x).toBeCloseTo(640, 0);
  });

  it("should destroy every part", () => {
    const parts = fakeStage();
    new TargetFrame(parts.stage, () => 540).destroy();
    expect([...parts.texts, ...parts.graphics].every((p) => p.destroyed)).toBe(
      true,
    );
  });
});

/** The bar's backing and the panel as drawn, the latest draw only. */
const drawnBar = (parts: ReturnType<typeof fakeStage>) => {
  const fills = parts.graphics.flatMap((g) => g.fills);
  return {
    panel: fills[0],
    backing: fills.find((f) => f.colour === MARKER_BAR.backing)!,
    hp: fills.find((f) => f.colour === MARKER_BAR.hp),
  };
};

const demon = (fields: Partial<MonsterState> = {}) =>
  monster({
    entity_id: "boss",
    archetype: "demon",
    name: "Demon",
    level: 12,
    boss: true,
    current_health: 600,
    max_health: 1200,
    ...fields,
  });

describe("the boss frame (FS-48CTQ §D.12: a bar 1.5 × as wide and twice as tall)", () => {
  it("should fit within 420 × 60", () => {
    expect(TARGET_BOSS_FRAME.width).toBeLessThanOrEqual(420);
    expect(TARGET_BOSS_FRAME.height).toBeLessThanOrEqual(60);
  });

  it("should draw a boss's bar 1.5 × the normal bar's width and twice its height", () => {
    const normal = drawnBar(shownFrame(monster()));
    const boss = drawnBar(shownFrame(demon()));
    expect(boss.backing.w).toBeCloseTo(normal.backing.w * 1.5, 5);
    expect(boss.backing.h).toBeCloseTo(normal.backing.h * 2, 5);
  });

  it("should back a boss with the wider panel, top at y 10, centred, the bar inside it", () => {
    const { panel, backing, hp } = drawnBar(shownFrame(demon(), 540));
    const r = targetFrameRect(540, TARGET_BOSS_FRAME);
    expect(panel).toMatchObject({
      colour: palette.hudPanel,
      x: r.x,
      y: 10,
      w: r.width,
      h: r.height,
    });
    expect(backing.x).toBeGreaterThan(r.x);
    expect(backing.x + backing.w).toBeLessThan(r.x + r.width);
    expect(backing.y).toBeGreaterThan(r.y);
    expect(backing.y + backing.h).toBeLessThan(r.y + r.height);
    expect(hp!.w).toBeCloseTo(backing.w / 2, 0);
  });

  it("should name a boss by its plate, centred, in the hostile channel", () => {
    const { live } = shownFrame(demon(), 540);
    expect(live().map((t) => t.content)).toEqual(["Demon · Lv 12"]);
    expect(live()[0].style.color).toBe(toCss(palette.markerHostile));
    expect(live()[0].x).toBe(540);
  });

  it.each([
    ["from the boss to a common monster", demon(), monster(), TARGET_FRAME],
    [
      "from a common monster to the boss",
      monster(),
      demon(),
      TARGET_BOSS_FRAME,
    ],
  ])("should resize at once %s", (_, from, to, size) => {
    const parts = fakeStage();
    const frame = new TargetFrame(parts.stage, () => 540);
    frame.update(TARGET_FADE_IN_MS, from, false);
    frame.update(16, to, false);
    expect(drawnBar(parts).panel.w).toBe(size.width);
    expect(drawnBar(parts).panel.h).toBe(size.height);
  });

  it("should keep the boss's size when it re-anchors on a resize", () => {
    let centre = 540;
    const parts = fakeStage();
    const frame = new TargetFrame(parts.stage, () => centre);
    frame.update(TARGET_FADE_IN_MS, demon(), false);
    centre = 640;
    frame.relayout();
    expect(drawnBar(parts).panel).toMatchObject({
      x: targetFrameRect(640, TARGET_BOSS_FRAME).x,
      w: TARGET_BOSS_FRAME.width,
    });
  });
});

describe("the frame's layout at 1080 and 1280 (FS-48CTQ §E.14)", () => {
  /**
   * What the frame must clear, from FS-48CTQ "Facts" and §E.14: the notices from y ≈ 78, and the
   * fullscreen button, the top-right column and the minimap from x ≥ 854 at the 1080 minimum,
   * that is 226 px in from the right edge at any width (all right-anchored, TOP_RIGHT_HUD).
   */
  const NOTICE_TOP = 78;
  const RIGHT_COLUMN_INSET = 1080 - 854;

  it.each([
    ["normal", 1080, TARGET_FRAME],
    ["normal", 1280, TARGET_FRAME],
    ["boss", 1080, TARGET_BOSS_FRAME],
    ["boss", 1280, TARGET_BOSS_FRAME],
  ])(
    "a %s frame at %i wide should hang from y 10, centred, clear of the notices and the right column",
    (_, width, size) => {
      const r = targetFrameRect(width / 2, size);
      expect(r.y).toBe(10);
      expect(r.x + r.width / 2).toBe(width / 2);
      expect(r.y + r.height).toBeLessThan(NOTICE_TOP);
      expect(r.x).toBeGreaterThan(0);
      expect(r.x + r.width).toBeLessThan(width - RIGHT_COLUMN_INSET);
    },
  );
});
