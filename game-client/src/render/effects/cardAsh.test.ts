import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { CARD_ASH, CardAsh, type AshInk, type CardAshScene } from "./cardAsh";
import type { InkText } from "./cardDust";

// FS-PQ2TW §Change: Ash, a trial alternate leave, R53–R64: the arrival card can leave as ash, a
// burn front crossing its letters pixel by pixel while flakes of burnt paper flutter up off the
// burned strokes and a few ember sparks rise off the front (reworked at the owner's look of
// 2026-11-12: "灰燼像泡泡一樣怪怪的").

const rgb = (hex: number) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
const INK = rgb(BARROW_HEX.vellum);
const EMBER = rgb(BARROW_HEX.ember);
const SLATE = rgb(BARROW_HEX.slate);
const BRASS = rgb(BARROW_HEX.brass);
const SLATE_LIGHT = rgb(BARROW_HEX.slateLight);

/** A text's canvas as a Phaser Text holds it, its ink in vellum from `rows` ('#' is ink). */
function stubText(rows: string[], { x = 380, y = 270, resolution = 1 } = {}): InkText {
  const width = rows[0].length;
  const height = rows.length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, py) =>
    [...row].forEach((c, px) => {
      if (c !== "#") return;
      data.set([...INK, 255], (py * width + px) * 4);
    }),
  );
  return {
    canvas: { width, height },
    context: { getImageData: () => ({ data, width, height }) as ImageData },
    style: { resolution },
    x,
    y,
    displayOriginX: 0,
    displayOriginY: 0,
    scaleX: 1,
    scaleY: 1,
  };
}

/** A seeded run of `Math.random`'s shape, so a test sees many draws but the same ones each run. */
function seeded(seed = 7): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface Made {
  kind: "image" | "particles";
  args: unknown[];
  destroyed: boolean;
  /** Every call made on it, by method, in order. */
  calls: Record<string, unknown[][]>;
}

interface Canvas {
  key: string;
  width: number;
  height: number;
  /** Each image put on it, copied as it was put. */
  puts: Uint8ClampedArray[];
  frames: { name: string; x: number; y: number; w: number; h: number }[];
  refreshed: number;
  removed: boolean;
}

/** The slice of a scene the ash uses, recording what it made, put, tweened and timed. */
function ashStage({ reduced = false, canvases: canMake = true } = {}) {
  const made: Made[] = [];
  const canvases: Canvas[] = [];
  const tweens: { config: Record<string, unknown>; stopped: boolean; at(v: number): void; complete(): void }[] = [];
  const timers: { delay: number; removed: boolean; fire(): void }[] = [];
  const anims = new Map<string, { key: string; frames: { key: string; frame: string }[]; frameRate: number; repeat: number }>();
  const obj = (kind: Made["kind"]) => (...args: unknown[]) => {
    const record: Made = { kind, args, destroyed: false, calls: {} };
    made.push(record);
    const proxy: object = new Proxy(
      {},
      {
        get: (_, m) =>
          m === "destroy"
            ? () => void (record.destroyed = true)
            : (...a: unknown[]) => {
                (record.calls[String(m)] ??= []).push(a);
                return proxy;
              },
      },
    );
    return proxy;
  };
  const live = (key: string) => canvases.find((c) => c.key === key && !c.removed);
  const scene = {
    add: { image: obj("image"), particles: obj("particles") },
    tweens: {
      addCounter: (config: Record<string, unknown>) => {
        let value = config.from as number;
        const handle = { stop: () => void (t.stopped = true), getValue: () => value };
        const t = {
          config,
          stopped: false,
          at: (v: number) => {
            value = v;
            (config.onUpdate as (tw: unknown) => void)(handle);
          },
          complete: () => {
            t.at(config.to as number);
            (config.onComplete as ((tw: unknown) => void) | undefined)?.(handle);
          },
        };
        tweens.push(t);
        return handle;
      },
    },
    anims: {
      exists: (key: string) => anims.has(key),
      create: (config: { key: string; frames: { key: string; frame: string }[]; frameRate: number; repeat: number }) => {
        if (anims.has(config.key)) return false;
        anims.set(config.key, config);
        return config;
      },
    },
    time: {
      delayedCall: (delay: number, fire: () => void) => {
        const t = { delay, fire, removed: false };
        timers.push(t);
        return { remove: () => void (t.removed = true) };
      },
    },
    textures: {
      exists: (key: string) => live(key) !== undefined,
      remove: (key: string) => {
        const c = live(key);
        if (c) c.removed = true;
      },
      createCanvas: (key: string, width: number, height: number) => {
        if (!canMake || live(key)) return null;
        const c: Canvas = { key, width, height, puts: [], frames: [], refreshed: 0, removed: false };
        canvases.push(c);
        return {
          key,
          width,
          height,
          context: {
            createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
            putImageData: (img: ImageData) => void c.puts.push(Uint8ClampedArray.from(img.data)),
          },
          add: (name: string, _source: number, x: number, y: number, w: number, h: number) =>
            void c.frames.push({ name, x, y, w, h }),
          refresh: () => void c.refreshed++,
        };
      },
    },
  };
  const logger = { warn: vi.fn() };
  const ash = new CardAsh(scene as unknown as CardAshScene, { reducedMotion: () => reduced, logger, random: seeded() });
  const gone = vi.fn();
  const emitters = () => made.filter((m) => m.kind === "particles");
  const images = () => made.filter((m) => m.kind === "image");
  const config = () => emitters()[0].args[3] as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
  const sparkConfig = () => emitters()[1].args[3] as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
  const burn = () => canvases.find((c) => c.key === images()[0].args[2])!;
  const front = () => tweens[0];
  return { scene, made, canvases, tweens, timers, anims, logger, ash, gone, emitters, images, config, sparkConfig, burn, front };
}

/** The card's three pieces as the ash takes them: they can be hidden. */
const letters = () => [0, 1, 2].map(() => ({ setVisible: vi.fn() }));

/** A card's ink: one text, 40 × 6 view px of solid ink at (380, 270), and a 20 px rule under it. */
function cardInk(text: InkText = stubText(Array(6).fill("#".repeat(40)))): AshInk {
  return { texts: [text], rule: { x1: 390, x2: 410, y: 300.5 }, letters: letters() };
}

/** Pixel `i` of `data`: its colour and alpha. */
const px = (data: Uint8ClampedArray, i: number) => ({ c: [...data.subarray(i * 4, i * 4 + 3)], a: data[i * 4 + 3] });
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
/** How far `c` lies from the segment `a`–`b`, in RGB. */
function offSegment(c: number[], a: number[], b: number[]): number {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / len2));
  return dist(c, [a[0] + ab[0] * t, a[1] + ab[1] * t, a[2] + ab[2] * t]);
}

describe("the ash's numbers (FS-PQ2TW R55–R59, R61)", () => {
  it("should be one typed record, at its starting values", () => {
    expect(CARD_ASH).toEqual({
      frontMs: 2000,
      durationMs: 3000,
      ragged: 0.35,
      grainPx: 6,
      band: { ember: 0.06, char: 0.08 },
      flake: {
        lifeMs: 1000,
        maxParticles: 300,
        density: 0.1,
        shapes: 24,
        lengthPx: { from: 1.5, to: 8 },
        smallBias: 1.6,
        aspect: { from: 1.1, to: 2.8 },
        mottle: 0.6,
        glow: { share: 1 / 3, ms: 500, steps: 8 },
        speed: { from: 12, to: 32 },
        drag: 0.5,
        spreadDeg: 30,
        spinDegPerS: { from: 20, to: 70 },
        flipMs: { from: 500, to: 1300 },
        sway: { amplitude: { from: 1.5, to: 4 }, periodMs: { from: 900, to: 1600 } },
        alpha: { from: 1, to: 0 },
      },
      spark: {
        maxParticles: 40,
        density: 0.012,
        lifeMs: { from: 300, to: 600 },
        sizePx: { from: 1, to: 2 },
        speed: { from: 40, to: 80 },
        drag: 1.5,
        spreadDeg: 25,
        flickerHz: { from: 6, to: 14 },
        blend: "ADD",
      },
      tint: { edge: "ember", char: "slate", flake: "slate", mottle: "slateLight", glow: "ember", spark: "ember" },
      rule: { tint: "brass", alpha: 0.6 },
      ease: { front: "Linear", flake: "Sine.easeIn", spark: "Quad.easeIn" },
    });
  });

  it("should keep every FS-KYPQ9 §B rule but §B.6's count and fall, §B.2's ceiling and §B.10 (R59)", () => {
    // §B.2: one fixed duration, the front's and a flake's life inside it
    expect(Number.isInteger(CARD_ASH.durationMs)).toBe(true);
    expect(CARD_ASH.durationMs).toBeLessThanOrEqual(3000);
    expect(CARD_ASH.frontMs + CARD_ASH.flake.lifeMs).toBeLessThanOrEqual(CARD_ASH.durationMs);
    expect(CARD_ASH.frontMs + CARD_ASH.spark.lifeMs.to).toBeLessThanOrEqual(CARD_ASH.durationMs);
    // §B.3: the easing allowlist
    for (const ease of Object.values(CARD_ASH.ease))
      expect(ease).toMatch(/^(Linear|(Sine|Quad|Cubic)\.ease(In|Out|InOut))$/);
    // §B.7: BARROW keys only, at most 3 of its own, no amber, no oxblood; the rule is the card's own
    const own = Object.values(CARD_ASH.tint);
    for (const c of [...own, CARD_ASH.rule.tint]) expect(c in BARROW_HEX).toBe(true);
    expect(new Set(own).size).toBeLessThanOrEqual(3);
    expect(own).not.toContain("amber");
    expect(own).not.toContain("oxblood");
    expect(BARROW_HEX[CARD_ASH.rule.tint]).toBe(palette.frame);
    // three of its own, the third the flakes' mottling: ember, slate, slateLight
    expect([...new Set(own)].sort()).toEqual(["ember", "slate", "slateLight"]);
    // the exception, bounded: a few hundred flakes and a few tens of sparks, rising, never sprayed
    expect(CARD_ASH.flake.maxParticles).toBeLessThanOrEqual(300);
    expect(CARD_ASH.flake.speed.to).toBeLessThanOrEqual(32);
    expect(CARD_ASH.flake.spreadDeg).toBeLessThanOrEqual(30);
    expect(CARD_ASH.spark.maxParticles).toBeLessThanOrEqual(40);
    expect(CARD_ASH.spark.speed.to).toBeLessThanOrEqual(80);
    expect(CARD_ASH.spark.spreadDeg).toBeLessThanOrEqual(25);
    expect(CARD_ASH.spark.lifeMs.to).toBeLessThanOrEqual(600);
    // the sparks rise faster than any flake
    expect(CARD_ASH.spark.speed.from).toBeGreaterThan(CARD_ASH.flake.speed.to);
    // the smallest flake still larger than the dust's motes (about 1.2 view px)
    expect(CARD_ASH.flake.lengthPx.from).toBeGreaterThan(1.2);
    // a flip only: the half-turn, edge-on to the other face, falls inside a flake's life
    expect(CARD_ASH.flake.flipMs.to / 2).toBeLessThan(CARD_ASH.flake.lifeMs);
  });
});

describe("CardAsh (FS-PQ2TW §Change: Ash)", () => {
  it("should take the card's letters away itself (R53, R55)", () => {
    expect(ashStage().ash.takesLetters).toBe(true);
  });

  it("should hide the letters and stand one burning image of them in their place, over the card (R55, R60)", () => {
    const { ash, gone, images, burn } = ashStage();
    const ink = cardInk();

    expect(ash.play(ink, 961, gone)).toBe(true);

    for (const letter of ink.letters) expect(letter.setVisible).toHaveBeenCalledWith(false);
    expect(images()).toHaveLength(1);
    const [image] = images();
    // the ink's bounds, the text's and the rule's, from its top left
    expect(image.args.slice(0, 2)).toEqual([380, 270]);
    expect(burn()).toMatchObject({ width: 40, height: 31 });
    expect(image.calls.setOrigin).toEqual([[0, 0]]);
    expect(image.calls.setScale).toEqual([[1]]);
    expect(image.calls.setScrollFactor).toEqual([[0]]);
    expect(image.calls.setDepth).toEqual([[961]]);
    expect(gone).not.toHaveBeenCalled();
  });

  it("should draw the image at the texts' resolution, shown back at view size", () => {
    const { ash, gone, images, burn } = ashStage();

    ash.play(cardInk(stubText(Array(12).fill("#".repeat(80)), { resolution: 2 })), 961, gone);

    expect(burn()).toMatchObject({ width: 80, height: 62 });
    expect(images()[0].calls.setScale).toEqual([[0.5]]);
  });

  it("should start as the card drew it: the texts' own pixels and the rule's brass", () => {
    const { ash, gone, burn } = ashStage();
    ash.play(cardInk(), 961, gone);

    const first = burn().puts[0];
    const all = Array.from({ length: first.length / 4 }, (_, i) => px(first, i));
    expect(all.filter((p) => p.a === 255 && dist(p.c, INK) === 0)).toHaveLength(240);
    expect(all.filter((p) => p.a === Math.round(0.6 * 255) && dist(p.c, BRASS) === 0)).toHaveLength(20);
    expect(all.filter((p) => p.a > 0)).toHaveLength(260);
  });

  describe("the burn (R55)", () => {
    /** The burn's image at front `v` (0..1), and its ink pixels by state. */
    function at(v: number[]) {
      const stage = ashStage();
      stage.ash.play(cardInk(), 961, stage.gone);
      const start = stage.burn().puts[0];
      const { width } = stage.burn();
      return v.map((value) => {
        stage.front().at(value);
        const data = stage.burn().puts.at(-1)!;
        const ink = Array.from({ length: start.length / 4 }, (_, i) => i).filter((i) => start[i * 4 + 3] > 0);
        const gone = ink.filter((i) => data[i * 4 + 3] === 0);
        const whole = ink.filter((i) => data.subarray(i * 4, i * 4 + 4).every((b, k) => b === start[i * 4 + k]));
        const burning = ink.filter((i) => data[i * 4 + 3] > 0 && !whole.includes(i));
        const meanX = (is: number[]) => is.reduce((s, i) => s + (i % width), 0) / is.length;
        return { data, start, ink, gone, whole, burning, meanX };
      });
    }

    it("should run its front for 2000 ms, linear, redrawing and uploading the image each step", () => {
      const { ash, gone, front, burn } = ashStage();
      ash.play(cardInk(), 961, gone);

      expect(front().config).toMatchObject({ from: 0, to: 1, duration: 2000, ease: "Linear" });
      const before = burn().refreshed;
      front().at(0.5);
      expect(burn().puts.length).toBeGreaterThan(1);
      expect(burn().refreshed).toBe(before + 1);
    });

    it("should advance from the left: the burned share only grows, the band moves right, and all is gone at the end", () => {
      const steps = at([0, 0.2, 0.4, 0.6, 0.8, 1]);

      expect(steps[0].gone).toHaveLength(0);
      expect(steps[0].burning).toHaveLength(0);
      for (let n = 1; n < steps.length; n++) expect(steps[n].gone.length).toBeGreaterThanOrEqual(steps[n - 1].gone.length);
      expect(steps[2].meanX(steps[2].burning)).toBeLessThan(steps[4].meanX(steps[4].burning));
      expect(steps[2].meanX(steps[2].gone)).toBeLessThan(steps[2].meanX(steps[2].whole));
      // every pixel gone once the front has crossed
      const end = steps.at(-1)!;
      expect(end.gone).toHaveLength(end.ink.length);
      for (let i = 3; i < end.data.length; i += 4) expect(end.data[i]).toBe(0);
    });

    it("should be ragged, not a straight edge: the front stands at different places in different rows", () => {
      const stage = ashStage();
      stage.ash.play(cardInk(stubText(Array(24).fill("#".repeat(60)))), 961, stage.gone);
      stage.front().at(0.5);
      const data = stage.burn().puts.at(-1)!;
      const { width } = stage.burn();

      // per row of the text, the first pixel the front has not reached
      const standsFrom = Array.from({ length: 24 }, (_, y) => {
        for (let x = 0; x < 60; x++) {
          const i = (y * width + x) * 4;
          if (data[i + 3] === 255 && dist([data[i], data[i + 1], data[i + 2]], INK) === 0) return x;
        }
        return 60;
      });
      expect(Math.max(...standsFrom) - Math.min(...standsFrom)).toBeGreaterThanOrEqual(3);
    });

    it("should tint its band ember at the leading edge, charring to slate behind; whatever it has not reached stays as drawn", () => {
      const [mid] = at([0.5]);

      expect(mid.burning.length).toBeGreaterThan(10);
      const colours = mid.burning.map((i) => px(mid.data, i).c);
      // every burning pixel lies on the way from its own ink (the text's, or the rule's) to ember, or
      // from ember to char
      for (const i of mid.burning) {
        const c = px(mid.data, i).c;
        const ink = px(mid.start, i).c;
        expect(Math.min(offSegment(c, ink, EMBER), offSegment(c, EMBER, SLATE))).toBeLessThan(3);
      }
      // both ends of the band are there: an ember edge and a slate char
      expect(colours.some((c) => dist(c, EMBER) < 30)).toBe(true);
      expect(colours.some((c) => dist(c, SLATE) < 30)).toBe(true);
      // nothing amber, nothing white
      for (const c of colours) expect(dist(c, rgb(BARROW_HEX.amber))).toBeGreaterThan(30);
    });
  });

  describe("the flakes: burnt paper (R56)", () => {
    function flakes(text?: InkText) {
      const stage = ashStage();
      stage.ash.play(cardInk(text), 961, stage.gone);
      const emitted: { v: number; x: number; y: number; data: Uint8ClampedArray }[] = [];
      let seen = 0;
      for (let v = 0; v <= 1.0001; v += 0.05) {
        stage.front().at(Math.min(v, 1));
        const calls = stage.emitters()[0].calls.emitParticle ?? [];
        for (const [count, x, y] of calls.slice(seen) as [number, number, number][]) {
          expect(count).toBe(1);
          emitted.push({ v, x, y, data: stage.burn().puts.at(-1)! });
        }
        seen = calls.length;
      }
      return { ...stage, emitted };
    }

    /** Each flake shape of the sheet, by its anim: its frames' pixels, at `resolution` canvas px per view px. */
    function shapes(resolution = 2) {
      const stage = flakes(stubText(Array(6 * resolution).fill("#".repeat(40 * resolution)), { resolution }));
      const sheet = stage.canvases.find((c) => c.key === stage.emitters()[0].args[2])!;
      const [data] = sheet.puts;
      const keys = (stage.config().anim as string[]) ?? [];
      const frameOf = (name: string) => sheet.frames.find((f) => f.name === name)!;
      const pixels = (name: string) => {
        const f = frameOf(name);
        const out: { c: number[]; a: number; x: number; y: number }[] = [];
        for (let y = f.y; y < f.y + f.h; y++)
          for (let x = f.x; x < f.x + f.w; x++) {
            const p = px(data, y * sheet.width + x);
            if (p.a > 0) out.push({ ...p, x: x - f.x, y: y - f.y });
          }
        return out;
      };
      return keys.map((key) => {
        const anim = stage.anims.get(key)!;
        const frames = anim.frames.map((f) => pixels(f.frame));
        const first = frames[0];
        const xs = first.map((p) => p.x);
        const ys = first.map((p) => p.y);
        const w = (Math.max(...xs) - Math.min(...xs) + 1) / resolution;
        const h = (Math.max(...ys) - Math.min(...ys) + 1) / resolution;
        return { key, anim, frames, length: Math.max(w, h), aspect: Math.max(w, h) / Math.min(w, h) };
      });
    }

    /** The pixels of `drawn` with an undrawn 4-neighbour: the flake's outline. */
    function outline<P extends { x: number; y: number }>(drawn: P[]): P[] {
      const at = new Set(drawn.map((p) => `${p.x},${p.y}`));
      return drawn.filter((p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !at.has(`${p.x + dx},${p.y + dy}`)));
    }

    /** How far `c` lies from the triangle `a`, `b`, `e` in RGB (0 inside it): a mix of the three tokens. */
    function offMix(c: number[], a: number[], b: number[], e: number[]): number {
      let best = Infinity;
      for (let u = 0; u <= 1.0001; u += 0.02)
        for (let v = 0; u + v <= 1.0001; v += 0.02) {
          const m = [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * u + (e[k] - a[k]) * v);
          best = Math.min(best, dist(c, m));
        }
      return best;
    }

    it("should come from one emitter of runtime flakes, each shape its own anim, rising, slowing and fading over 1000 ms", () => {
      const { emitters, config, canvases, anims } = flakes();

      const [emitter] = emitters();
      const sheet = canvases.find((c) => c.key === emitter.args[2])!;
      expect(emitter.calls.setDepth).toEqual([[961]]);
      expect(emitter.calls.setScrollFactor).toEqual([[0]]);
      expect(config()).toMatchObject({
        lifespan: 1000,
        speed: { min: 12, max: 32 },
        maxParticles: 300,
        emitting: false,
        scaleX: 1,
        alpha: { start: 1, end: 0, ease: "Sine.easeIn" },
      });
      expect(config().scale).toBeUndefined();
      expect(config().emitZone).toBeUndefined();
      // 24 shapes, each an anim over the sheet's frames
      const keys = config().anim as string[];
      expect(keys).toHaveLength(24);
      for (const key of keys) {
        const anim = anims.get(key)!;
        expect(anim.repeat).toBe(0);
        for (const f of anim.frames) {
          expect(f.key).toBe(sheet.key);
          expect(sheet.frames.some((fr) => fr.name === f.frame)).toBe(true);
        }
      }
      // slowing a little: a drag of 0.5 of its speed a second, never turning it back
      const ax = config().accelerationX as { onUpdate(p: object, k: string, t: number, v: number): number };
      const ay = config().accelerationY as { onUpdate(p: object, k: string, t: number, v: number): number };
      expect(ax.onUpdate({ velocityX: 10, velocityY: -20 }, "accelerationX", 0.5, 0)).toBeCloseTo(-5);
      expect(ay.onUpdate({ velocityX: 10, velocityY: -20 }, "accelerationY", 0.5, 0)).toBeCloseTo(10);
    });

    it("should let each go from a stroke pixel or the rule, only once that pixel has burned out", () => {
      const { emitted } = flakes();

      expect(emitted.length).toBeGreaterThan(0);
      for (const { x, y, data } of emitted) {
        const onText = x >= 380 && x < 420 && y >= 270 && y < 276;
        const onRule = x >= 390 && x <= 410 && y >= 300 && y < 301;
        expect(onText || onRule, `${x},${y}`).toBe(true);
        const i = Math.floor(y - 270) * 40 + Math.floor(x - 380);
        expect(data[i * 4 + 3], `${x},${y}`).toBe(0);
      }
      // through the whole crossing, not all at once
      expect(new Set(emitted.map((e) => e.v.toFixed(2))).size).toBeGreaterThan(5);
    });

    it.each([
      ["a little ink", ["####", "####"], 3],
      ["a card's worth", Array(6).fill("#".repeat(40)), 26],
      ["far more than the cap", Array(60).fill("#".repeat(400)), 300],
    ])("should make 0.1 flakes per view px² of ink from %s, at most 300", (_, rows, want) => {
      const stage = ashStage();
      stage.ash.play(cardInk(stubText(rows)), 961, stage.gone);
      stage.front().at(1);

      const calls = stage.emitters()[0].calls.emitParticle as [number, number, number][];
      expect(calls.reduce((n, [count]) => n + count, 0)).toBe(want);
    });

    it("should rise within 30° of straight up, turning slowly, 20–70° a second either way", () => {
      const { config } = flakes();
      const angle = config().angle as { onEmit(p: object, key: string): number };
      const rotate = config().rotate as {
        onEmit(p: object, key: string): number;
        onUpdate(p: object, key: string, t: number, value: number): number;
      };

      const headings = Array.from({ length: 300 }, () => angle.onEmit({}, "angle"));
      for (const deg of headings) expect(Math.abs(deg + 90)).toBeLessThanOrEqual(30);
      expect(Math.min(...headings)).toBeLessThan(-110);
      expect(Math.max(...headings)).toBeGreaterThan(-70);
      // the mean heading is straight up: the ash rises on average
      expect(headings.reduce((s, d) => s + d, 0) / headings.length).toBeCloseTo(-90, -1);

      const turns = Array.from({ length: 200 }, () => {
        const p = {};
        const from = rotate.onEmit(p, "rotate");
        // a whole life: 1 s
        return rotate.onUpdate(p, "rotate", 1, from) - from;
      });
      for (const s of turns) {
        expect(Math.abs(s)).toBeGreaterThanOrEqual(20 - 1e-9);
        expect(Math.abs(s)).toBeLessThanOrEqual(70 + 1e-9);
      }
      expect(turns.some((s) => s > 0)).toBe(true);
      expect(turns.some((s) => s < 0)).toBe(true);
    });

    it("should flutter, not spin: each flake's scale on one axis swings through edge-on and over, never past its size", () => {
      const { config } = flakes();
      const flip = config().scaleY as {
        onEmit(p: object, key: string): number;
        onUpdate(p: object, key: string, t: number, value: number): number;
      };

      for (let n = 0; n < 200; n++) {
        const p = {};
        let value = flip.onEmit(p, "scaleY");
        const life = [value];
        for (let t = 0.01; t <= 1.0001; t += 0.01) {
          value = flip.onUpdate(p, "scaleY", Math.min(t, 1), value);
          life.push(value);
        }
        for (const v of life) expect(Math.abs(v)).toBeLessThanOrEqual(1 + 1e-9);
        // edge-on at least once: the scale changes sign, passing through zero
        const flips = life.slice(1).filter((v, k) => Math.sign(v) !== Math.sign(life[k]) && v !== 0).length;
        expect(flips, `flake ${n}`).toBeGreaterThanOrEqual(1);
        // and near it, sampled every 10 ms of a quick pass through
        expect(Math.min(...life.map(Math.abs))).toBeLessThan(0.35);
      }
      // the other axis keeps the flake's size
      expect(config().scaleX).toBe(1);
    });

    it("should sway gently sideways as it rises, at most 4 px off its path", () => {
      const { config } = flakes();
      const angle = config().angle as { onEmit(p: object, key: string): number };
      const x = config().x as { onUpdate(p: object, key: string, t: number, value: number): number };

      let widest = 0;
      for (let n = 0; n < 50; n++) {
        const p: Record<string | symbol, unknown> = {};
        angle.onEmit(p, "angle");
        let at = 0;
        for (let t = 0.02; t <= 1.0001; t += 0.02) {
          at = x.onUpdate(p, "x", Math.min(t, 1), at);
          expect(Math.abs(at)).toBeLessThanOrEqual(4 + 1e-9);
          widest = Math.max(widest, Math.abs(at));
        }
      }
      expect(widest).toBeGreaterThan(1);
    });

    it("should span a range of sizes, many tiny and a few larger, and of aspects, mostly longer than wide", () => {
      const all = shapes(2);

      const lengths = all.map((s) => s.length).sort((a, b) => a - b);
      expect(lengths[0]).toBeLessThanOrEqual(2.5);
      expect(lengths.at(-1)!).toBeGreaterThanOrEqual(6.5);
      expect(lengths.at(-1)!).toBeLessThanOrEqual(8.5);
      // many tiny: the median nearer the small end than the large
      expect(lengths[Math.floor(lengths.length / 2)]).toBeLessThan((lengths[0] + lengths.at(-1)!) / 2);
      // aspects: large enough flakes to tell, some near square and most longer than wide
      const aspects = all.filter((s) => s.length >= 3).map((s) => s.aspect);
      expect(aspects.length).toBeGreaterThanOrEqual(8);
      expect(Math.min(...aspects)).toBeLessThan(1.5);
      expect(Math.max(...aspects)).toBeGreaterThan(2);
      expect(aspects.filter((a) => a >= 1.3).length).toBeGreaterThan(aspects.length / 2);
    });

    it("should be jagged, not round: its outline uneven and torn", () => {
      const all = shapes(2).filter((s) => s.length >= 4);

      for (const { frames } of all) {
        const [drawn] = frames;
        // torn: not a filled ellipse — some of the edge thinned or bitten (partly see-through)
        const edge = outline(drawn);
        expect(edge.some((p) => p.a < 255), "a torn edge").toBe(true);
      }
      // uneven: the shapes' pixel counts differ from what a filled ellipse of the same box holds
      const fill = all.map(({ frames: [drawn] }) => {
        const xs = drawn.map((p) => p.x);
        const ys = drawn.map((p) => p.y);
        const w = Math.max(...xs) - Math.min(...xs) + 1;
        const h = Math.max(...ys) - Math.min(...ys) + 1;
        return drawn.length / ((Math.PI / 4) * w * h);
      });
      expect(fill.some((f) => Math.abs(f - 1) > 0.12)).toBe(true);
    });

    it("should draw no closed outline ring: a plain flake's edge is its body, a glowing flake's ember on one side only", () => {
      const all = shapes(2);

      for (const { frames } of all) {
        const [drawn] = frames;
        const edge = outline(drawn);
        const emberish = (c: number[]) => dist(c, EMBER) < Math.min(dist(c, SLATE), dist(c, SLATE_LIGHT));
        if (!drawn.some((p) => emberish(p.c))) {
          // a plain flake: its edge the same paper as its body, slate toward slateLight
          for (const p of edge) expect(offSegment(p.c, SLATE, SLATE_LIGHT)).toBeLessThan(3);
          continue;
        }
        if (edge.length < 8) continue; // a speck: too few edge pixels to have a side
        const lit = edge.filter((p) => emberish(p.c));
        expect(lit.length).toBeLessThan(edge.length / 2);
        // on one side: every lit edge pixel within a half-turn of the lit pixels' mean bearing
        const cx = drawn.reduce((s, p) => s + p.x, 0) / drawn.length;
        const cy = drawn.reduce((s, p) => s + p.y, 0) / drawn.length;
        const mean = Math.atan2(
          lit.reduce((s, p) => s + (p.y - cy), 0),
          lit.reduce((s, p) => s + (p.x - cx), 0),
        );
        for (const p of lit) {
          const off = Math.abs(((Math.atan2(p.y - cy, p.x - cx) - mean + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
          expect(off).toBeLessThan(Math.PI / 2 + 0.3);
        }
      }
    });

    it("should be slate mottled toward slateLight, a third with an ember patch that dims to grey over its first 500 ms", () => {
      const all = shapes(2);

      for (const { frames } of all)
        for (const drawn of frames) for (const p of drawn) expect(offMix(p.c, SLATE, SLATE_LIGHT, EMBER)).toBeLessThan(3);
      // mottled: a flake of any size shows more than one shade
      for (const { frames } of all.filter((s) => s.length >= 4)) {
        const shades = new Set(frames[0].map((p) => p.c.join(",")));
        expect(shades.size).toBeGreaterThan(1);
      }
      const glowing = all.filter((s) => s.frames.length > 1);
      expect(glowing).toHaveLength(8);
      for (const { anim, frames } of glowing) {
        // 8 steps over 500 ms, then held on the last
        expect(frames).toHaveLength(8);
        expect((anim.frames.length / anim.frameRate) * 1000).toBeCloseTo(500);
        const heat = (drawn: { c: number[] }[]) => Math.max(...drawn.map((p) => 255 - dist(p.c, EMBER)));
        expect(frames[0].some((p) => dist(p.c, EMBER) < 40)).toBe(true);
        for (let k = 1; k < frames.length; k++) expect(heat(frames[k])).toBeLessThanOrEqual(heat(frames[k - 1]) + 1e-9);
        // dimmed to grey: nothing ember-ish left
        for (const p of frames.at(-1)!) expect(offSegment(p.c, SLATE, SLATE_LIGHT)).toBeLessThan(3);
      }
      for (const { anim } of all.filter((s) => s.frames.length === 1)) expect(anim.frames).toHaveLength(1);
    });

    it("should make the flake sheet and its anims once, and keep them for the next card", () => {
      const stage = ashStage();
      stage.ash.play(cardInk(), 961, stage.gone);
      const anims = stage.anims.size;
      stage.ash.play(cardInk(), 961, stage.gone);

      const sheets = stage.canvases.filter((c) => c.frames.length > 0);
      expect(sheets).toHaveLength(1);
      expect(sheets[0].removed).toBe(false);
      expect(stage.anims.size).toBe(anims);
    });
  });

  describe("the embers (R64)", () => {
    function sparks(text?: InkText) {
      const stage = ashStage();
      stage.ash.play(cardInk(text), 961, stage.gone);
      const emitted: { x: number; y: number; data: Uint8ClampedArray; start: Uint8ClampedArray }[] = [];
      let seen = 0;
      const start = stage.burn().puts[0];
      for (let v = 0; v <= 1.0001; v += 0.02) {
        stage.front().at(Math.min(v, 1));
        const calls = stage.emitters()[1].calls.emitParticle ?? [];
        for (const [count, x, y] of calls.slice(seen) as [number, number, number][]) {
          expect(count).toBe(1);
          emitted.push({ x, y, data: stage.burn().puts.at(-1)!, start });
        }
        seen = calls.length;
      }
      return { ...stage, emitted };
    }

    it("should come from a second emitter, additive, few, short-lived and faster than any flake", () => {
      const { emitters, sparkConfig, canvases } = sparks();

      expect(emitters()).toHaveLength(2);
      const spark = emitters()[1];
      expect(spark.calls.setDepth).toEqual([[961]]);
      expect(spark.calls.setScrollFactor).toEqual([[0]]);
      expect(sparkConfig()).toMatchObject({
        lifespan: { min: 300, max: 600 },
        speed: { min: 40, max: 80 },
        maxParticles: 40,
        blendMode: "ADD",
        emitting: false,
      });
      expect(sparkConfig().emitZone).toBeUndefined();
      // its frames: 1–2 view px of ember, on the flakes' one sheet
      const sheet = canvases.find((c) => c.key === spark.args[2])!;
      const names = sparkConfig().frame as string[];
      expect(names.length).toBeGreaterThanOrEqual(2);
      const [data] = sheet.puts;
      for (const name of names) {
        const f = sheet.frames.find((fr) => fr.name === name)!;
        expect(Math.max(f.w, f.h)).toBeLessThanOrEqual(2);
        for (let y = f.y; y < f.y + f.h; y++)
          for (let x = f.x; x < f.x + f.w; x++) {
            const p = px(data, y * sheet.width + x);
            if (p.a > 0) expect(dist(p.c, EMBER)).toBe(0);
          }
      }
    });

    it.each([
      // 240 view px² of text and 20 of rule
      ["a card's worth", Array(6).fill("#".repeat(40)), 4],
      ["far more than the cap", Array(60).fill("#".repeat(400)), 40],
    ])("should make 0.012 sparks per view px² of ink from %s, at most 40", (_, rows, want) => {
      const stage = ashStage();
      stage.ash.play(cardInk(stubText(rows)), 961, stage.gone);
      stage.front().at(1);

      const calls = stage.emitters()[1].calls.emitParticle as [number, number, number][];
      expect(calls.reduce((n, [count]) => n + count, 0)).toBe(want);
    });

    it("should let each go off the front, from ink the front has reached", () => {
      const { emitted } = sparks(stubText(Array(20).fill("#".repeat(60))));

      expect(emitted.length).toBeGreaterThan(0);
      for (const { x, y, data, start } of emitted) {
        const onText = x >= 380 && x < 440 && y >= 270 && y < 290;
        const onRule = x >= 390 && x <= 410 && y >= 300 && y < 301;
        expect(onText || onRule, `${x},${y}`).toBe(true);
        if (!onText) continue;
        const i = (Math.floor(y - 270) * 60 + Math.floor(x - 380)) * 4;
        // burning or gone: no longer as the card drew it
        expect([...data.subarray(i, i + 4)], `${x},${y}`).not.toEqual([...start.subarray(i, i + 4)]);
      }
    });

    it("should rise within 25° of up, slowing a little, and flicker as it dies out", () => {
      const { sparkConfig } = sparks();
      const angle = sparkConfig().angle as { onEmit(p: object, key: string): number };
      const alpha = sparkConfig().alpha as {
        onEmit(p: object, key: string): number;
        onUpdate(p: object, key: string, t: number, value: number): number;
      };
      const ay = sparkConfig().accelerationY as { onUpdate(p: object, k: string, t: number, v: number): number };

      for (let n = 0; n < 200; n++) expect(Math.abs(angle.onEmit({}, "angle") + 90)).toBeLessThanOrEqual(25);
      expect(ay.onUpdate({ velocityX: 0, velocityY: -60 }, "accelerationY", 0.5, 0)).toBeCloseTo(90);

      for (let n = 0; n < 50; n++) {
        const p = { lifeT: 0, life: 450 };
        let a = alpha.onEmit(p, "alpha");
        const seen = [a];
        for (let t = 0.02; t <= 1.0001; t += 0.02) {
          a = alpha.onUpdate(p, "alpha", Math.min(t, 1), a);
          seen.push(a);
        }
        // under its fall (Quad.easeIn): it holds its light, then goes
        seen.forEach((v, k) => {
          const t = Math.min(1, k * 0.02);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(1 - t * t + 1e-9);
        });
        expect(seen.at(-1)).toBeCloseTo(0);
        // a flicker: it brightens again more than once on its way out
        const rises = seen.slice(1).filter((v, k) => v > seen[k] + 0.02).length;
        expect(rises, `spark ${n}`).toBeGreaterThanOrEqual(1);
      }
    });
  });

  it("should put its burned-out image away when the front has crossed, the flakes still rising", () => {
    const { ash, gone, front, images, burn, emitters } = ashStage();
    ash.play(cardInk(), 961, gone);

    front().complete();

    expect(images()[0].destroyed).toBe(true);
    expect(burn().removed).toBe(true);
    expect(emitters()[0].destroyed).toBe(false);
    expect(gone).not.toHaveBeenCalled();
  });

  it("should be gone at 3000 ms, everything of it destroyed, and say so (R57)", () => {
    const { ash, gone, timers, made, burn } = ashStage();
    ash.play(cardInk(), 961, gone);

    const [end] = timers;
    expect(end.delay).toBe(3000);
    end.fire();

    expect(made.every((m) => m.destroyed)).toBe(true);
    expect(burn().removed).toBe(true);
    expect(gone).toHaveBeenCalledOnce();
  });

  it("should take the image, its texture, its flakes and its front away at once on a stop, and not say it is gone (R60)", () => {
    const { ash, gone, timers, made, burn, front } = ashStage();
    ash.play(cardInk(), 961, gone);

    ash.stop();

    expect(made.every((m) => m.destroyed)).toBe(true);
    expect(burn().removed).toBe(true);
    expect(front().stopped).toBe(true);
    expect(timers[0].removed).toBe(true);
    expect(gone).not.toHaveBeenCalled();
    ash.stop();
  });

  it("should take the old ash away when the next card leaves", () => {
    const { ash, gone, images, emitters, timers, canvases } = ashStage();
    ash.play(cardInk(), 961, gone);
    ash.play(cardInk(), 961, gone);

    expect(images().map((i) => i.destroyed)).toEqual([true, false]);
    // the flakes' emitter and the sparks', each
    expect(emitters().map((e) => e.destroyed)).toEqual([true, true, false, false]);
    expect(timers[0].removed).toBe(true);
    const burns = canvases.filter((c) => c.frames.length === 0);
    expect(burns.map((c) => c.removed)).toEqual([true, false]);
  });

  it("should let go of the ash without touching the scene once it has ended", () => {
    const { ash, gone, made, timers, front } = ashStage();
    ash.play(cardInk(), 961, gone);

    ash.forget();
    ash.stop();

    expect(made.some((m) => m.destroyed)).toBe(false);
    expect(timers[0].removed).toBe(false);
    expect(front().stopped).toBe(false);
  });

  it("should not burn and touch no letter under reduced motion, and log nothing (R60)", () => {
    const { ash, gone, made, canvases, timers, tweens, logger } = ashStage({ reduced: true });
    const ink = cardInk();

    expect(ash.play(ink, 961, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(canvases).toEqual([]);
    expect(timers).toEqual([]);
    expect(tweens).toEqual([]);
    for (const letter of ink.letters) expect(letter.setVisible).not.toHaveBeenCalled();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("should play nothing, logged once, where no canvas texture can be made (R60)", () => {
    const { ash, gone, made, logger } = ashStage({ canvases: false });
    const ink = cardInk();

    expect(ash.play(ink, 961, gone)).toBe(false);
    expect(ash.play(cardInk(), 961, gone)).toBe(false);

    expect(made).toEqual([]);
    for (const letter of ink.letters) expect(letter.setVisible).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("should play nothing, logged once, from a read that throws, and never fall back to the bounds (R60)", () => {
    const { ash, gone, made, canvases, logger } = ashStage();
    const tainted = stubText(["####"]);
    tainted.context = {
      getImageData: () => {
        throw new Error("The canvas has been tainted by cross-origin data.");
      },
    };

    expect(ash.play(cardInk(tainted), 961, gone)).toBe(false);
    expect(ash.play(cardInk(tainted), 961, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(canvases).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it("should play nothing, logged, from texts that drew no ink (R60)", () => {
    const { ash, gone, made, logger } = ashStage();

    expect(ash.play(cardInk(stubText(["....", "...."])), 961, gone)).toBe(false);

    expect(made).toEqual([]);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});
