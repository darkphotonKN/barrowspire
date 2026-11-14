import { afterEach, describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { viewport } from "@/render/viewport";
import { CANVAS_FONT, palette, toCss } from "@/utils/canvasPalette";
import { ProgressHud } from "./ProgressHud";
import type { Progress } from "./progress";
import { xpBarFrame } from "./xpBarLayout";

// FS-77DVN §A.4, §A.5, §B, §D.16 (I-77DVN-1): the XP bar piece as a scene draws it, on a recording
// stand-in for the Phaser scene.

interface Op {
  m: string;
  args: unknown[];
}
interface FakeGraphics {
  ops: Op[];
  depth?: number;
  scrollFactor?: number;
}
interface FakeText {
  words: string;
  x: number;
  y: number;
  style: Record<string, unknown>;
  origin?: [number, number];
  depth?: number;
  scrollFactor?: number;
  destroyed: boolean;
}
interface FakeTween {
  targets: FakeText;
  alpha: number;
  y: number;
  delay: number;
  duration: number;
  onComplete: () => void;
}

function fakeScene() {
  const graphics: FakeGraphics[] = [];
  const texts: FakeText[] = [];
  const tweens: FakeTween[] = [];
  const makeGraphics = () => {
    const g: FakeGraphics = { ops: [] };
    const self: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === "setDepth") return (d: number) => ((g.depth = d), self);
          if (prop === "setScrollFactor")
            return (s: number) => ((g.scrollFactor = s), self);
          if (prop === "clear") return () => ((g.ops = []), self);
          return (...args: unknown[]) => {
            g.ops.push({ m: String(prop), args });
            return self;
          };
        },
      },
    );
    graphics.push(g);
    return self;
  };
  const makeText = (
    x: number,
    y: number,
    words: string,
    style: Record<string, unknown>,
  ) => {
    const t: FakeText = { words, x, y, style: { ...style }, destroyed: false };
    const self = {
      get style() {
        return t.style;
      },
      get x() {
        return t.x;
      },
      get y() {
        return t.y;
      },
      setText: (w: string) => ((t.words = w), self),
      setPosition: (px: number, py: number) => ((t.x = px), (t.y = py), self),
      setOrigin: (ox: number, oy: number = ox) => ((t.origin = [ox, oy]), self),
      setDepth: (d: number) => ((t.depth = d), self),
      setScrollFactor: (s: number) => ((t.scrollFactor = s), self),
      setResolution: (r: number) => ((t.style.resolution = r), self),
      destroy: () => {
        t.destroyed = true;
      },
    };
    texts.push(t);
    (self as unknown as { record: FakeText }).record = t;
    return self;
  };
  const scene = {
    add: { graphics: makeGraphics, text: makeText },
    tweens: {
      add: (
        cfg: Omit<FakeTween, "targets"> & { targets: { record: FakeText } },
      ) => {
        tweens.push({ ...cfg, targets: cfg.targets.record });
      },
    },
  } as unknown as Phaser.Scene;
  return { scene, graphics, texts, tweens };
}

const mid: Progress = {
  level: 7,
  experience: 150,
  level_floor: 100,
  next_level_at: 230,
};
const cap: Progress = { level: 20, experience: 40000, level_floor: 38530 };

/** Every drawing op of every graphics the widget made. */
const allOps = (graphics: FakeGraphics[]) => graphics.flatMap((g) => g.ops);
const numerals = (texts: FakeText[]) =>
  texts.filter((t) => t.style.fontSize === "12px");

afterEach(() => viewport.set({ width: 1080, height: 720, renderScale: 1 }));

describe("ProgressHud: the bar, no panel (FS-77DVN §B.6)", () => {
  it("should draw a 5 px bar through drawXpBar's values at the layout's place, and nothing like a panel", () => {
    const { scene, graphics } = fakeScene();
    new ProgressHud(scene).show(mid);
    const { bar } = xpBarFrame(viewport);
    const ops = allOps(graphics);

    const rects = ops.filter((o) => o.m === "fillRect");
    expect(rects[0].args).toEqual([bar.x, bar.y, bar.width, 5]);
    expect(rects[1].args).toEqual([
      bar.x,
      bar.y,
      Math.round(bar.width * (50 / 130)),
      5,
    ]);
    expect(rects).toHaveLength(2);
    expect(ops.filter((o) => o.m === "strokeRect").map((o) => o.args)).toEqual([
      [bar.x, bar.y, bar.width, 5],
    ]);
    expect(
      ops.filter((o) => o.m === "fillStyle").map((o) => o.args),
    ).toContainEqual([palette.xpTrack, 0.9]);
    expect(ops.filter((o) => o.m === "lineStyle").map((o) => o.args)).toEqual([
      [1, palette.frame, 0.6],
    ]);
    expect(
      ops.some((o) => o.m === "fillStyle" && o.args[0] === palette.hudPanel),
    ).toBe(false);
  });
});

describe("ProgressHud: the studs (FS-77DVN §B.7)", () => {
  it("should draw a brass stud with a bright-brass highlight 6 px beyond each end, on the bar's centre line", () => {
    const { scene, graphics } = fakeScene();
    new ProgressHud(scene).show(mid);
    const { studs } = xpBarFrame(viewport);
    const ops = allOps(graphics);
    const circles = ops.filter((o) => o.m === "fillCircle").map((o) => o.args);
    expect(circles).toEqual([
      [studs.left.x, studs.left.y, 2],
      [studs.left.x - 0.5, studs.left.y - 0.5, 0.9],
      [studs.right.x, studs.right.y, 2],
      [studs.right.x - 0.5, studs.right.y - 0.5, 0.9],
    ]);
    // each circle in its own fill, set just before it: brass, then bright brass
    const fillBefore = ops
      .map((o, i) => (o.m === "fillCircle" ? ops[i - 1] : undefined))
      .filter((o) => o !== undefined)
      .map((o) => [o.m, ...o.args]);
    expect(fillBefore).toEqual([
      ["fillStyle", palette.frame, 1],
      ["fillStyle", palette.frameBright, 0.9],
      ["fillStyle", palette.frame, 1],
      ["fillStyle", palette.frameBright, 0.9],
    ]);
  });
});

describe("ProgressHud: the numerals (FS-77DVN §B.8–§B.10)", () => {
  it("should set this level right-aligned at the left and the next left-aligned at the right, in 12 px stroked vellum", () => {
    const { scene, texts } = fakeScene();
    new ProgressHud(scene).show(mid);
    const f = xpBarFrame(viewport);
    const [left, right] = numerals(texts);

    for (const t of [left, right]) {
      expect(t.style).toMatchObject({
        fontFamily: CANVAS_FONT.body,
        fontSize: "12px",
        color: toCss(palette.hudText),
        stroke: toCss(palette.markerStroke),
        strokeThickness: 2,
      });
    }
    expect(left).toMatchObject({
      words: "7",
      x: f.numerals.left.x,
      y: f.numerals.left.y,
      origin: [1, 0.5],
    });
    expect(right).toMatchObject({
      words: "8",
      x: f.numerals.right.x,
      y: f.numerals.right.y,
      origin: [0, 0.5],
    });
  });

  it("should keep the bar's length from level 9 to level 10", () => {
    const { scene, graphics } = fakeScene();
    const hud = new ProgressHud(scene);
    const trackWidth = () =>
      allOps(graphics)
        .filter((o) => o.m === "strokeRect")
        .at(-1)?.args[2];
    hud.show({ level: 9, experience: 10, level_floor: 0, next_level_at: 100 });
    const nine = trackWidth();
    hud.show({
      level: 10,
      experience: 110,
      level_floor: 100,
      next_level_at: 230,
    });
    expect(trackWidth()).toBe(nine);
  });

  it("should fill the bar and read the level and Cap at the cap (B.9)", () => {
    const { scene, graphics, texts } = fakeScene();
    new ProgressHud(scene).show(cap);
    const { bar } = xpBarFrame(viewport);
    const rects = allOps(graphics).filter((o) => o.m === "fillRect");
    expect(rects[1].args).toEqual([bar.x, bar.y, bar.width, 5]);
    expect(numerals(texts).map((t) => t.words)).toEqual(["20", "Cap"]);
  });

  it("should draw no N / M count on the HUD (B.10)", () => {
    const { scene, texts } = fakeScene();
    new ProgressHud(scene).show(mid);
    expect(texts.some((t) => t.words.includes("/"))).toBe(false);
    expect(numerals(texts)).toHaveLength(texts.length);
  });
});

describe("ProgressHud: redraws (FS-77DVN §B.12)", () => {
  it("should draw nothing new for a second state with the same progress", () => {
    const { scene, graphics } = fakeScene();
    const hud = new ProgressHud(scene);
    hud.show(mid);
    const drawn = allOps(graphics).length;
    graphics.forEach((g) => g.ops.push({ m: "marker", args: [] }));
    hud.show({ ...mid });
    expect(allOps(graphics).filter((o) => o.m !== "marker")).toHaveLength(
      drawn,
    );
    expect(allOps(graphics).filter((o) => o.m === "marker")).toHaveLength(
      graphics.length,
    );
  });
});

describe("ProgressHud: depth and resize (FS-77DVN §A.4, §A.5)", () => {
  it("should stand at the HUD's depth 1000, fixed to the screen", () => {
    const { scene, graphics, texts } = fakeScene();
    new ProgressHud(scene).show(mid);
    for (const o of [...graphics, ...texts]) {
      expect(o.depth).toBe(1000);
      expect(o.scrollFactor).toBe(0);
    }
  });

  it("should place itself again by the rule on a resize, its numerals re-crispened", () => {
    const { scene, graphics, texts } = fakeScene();
    const hud = new ProgressHud(scene);
    hud.show(mid);

    viewport.set({ width: 1280, height: 720, renderScale: 2 });
    hud.relayout();

    const f = xpBarFrame(viewport);
    const [left, right] = numerals(texts);
    expect([left.x, left.y]).toEqual([f.numerals.left.x, f.numerals.left.y]);
    expect([right.x, right.y]).toEqual([
      f.numerals.right.x,
      f.numerals.right.y,
    ]);
    expect(left.style.resolution).toBe(2);
    expect(right.style.resolution).toBe(2);
    expect(
      allOps(graphics)
        .filter((o) => o.m === "strokeRect")
        .map((o) => o.args),
    ).toEqual([[f.bar.x, f.bar.y, f.bar.width, 5]]);
  });

  it("should draw nothing on a resize before its first state", () => {
    const { scene, graphics } = fakeScene();
    const hud = new ProgressHud(scene);
    viewport.set({ width: 1280, height: 720, renderScale: 1 });
    hud.relayout();
    expect(allOps(graphics)).toHaveLength(0);
  });
});

describe("ProgressHud: the level-up cue (FS-77DVN §D.16)", () => {
  it("should raise no cue for a fresh widget's first state", () => {
    const { scene, tweens, texts } = fakeScene();
    new ProgressHud(scene).show(mid);
    expect(tweens).toHaveLength(0);
    expect(texts.some((t) => t.words.startsWith("Risen"))).toBe(false);
  });

  it("should rise from 6 px above the piece's centre, hold 900 ms, fade over 1400 ms rising 12 px, then go", () => {
    const { scene, tweens, texts } = fakeScene();
    const hud = new ProgressHud(scene);
    hud.show(mid);
    hud.show({
      level: 8,
      experience: 230,
      level_floor: 230,
      next_level_at: 400,
    });
    const { piece } = xpBarFrame(viewport);

    const cue = texts.find((t) => t.words === "Risen to level 8");
    expect(cue).toBeDefined();
    expect(cue?.style).toMatchObject({
      fontFamily: CANVAS_FONT.body,
      fontSize: "16px",
      color: toCss(palette.levelUp),
    });
    expect(cue).toMatchObject({
      x: piece.x + piece.width / 2,
      y: piece.y - 6,
      origin: [0.5, 1],
      depth: 1000,
      scrollFactor: 0,
    });
    expect(tweens).toHaveLength(1);
    expect(tweens[0]).toMatchObject({
      targets: cue,
      alpha: 0,
      y: piece.y - 6 - 12,
      delay: 900,
      duration: 1400,
    });
    tweens[0].onComplete();
    expect(cue?.destroyed).toBe(true);
    // the ends read the new level and the next
    expect(numerals(texts).map((t) => t.words)).toEqual(["8", "9"]);
  });
});
