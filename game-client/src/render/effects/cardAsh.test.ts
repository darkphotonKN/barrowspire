import { describe, expect, it, vi } from "vitest";
import type Phaser from "phaser";
import { palette } from "@/utils/canvasPalette";
import { BARROW_HEX } from "@/utils/theme";
import { CARD_ASH, CardAsh, type AshInk, type CardAshScene } from "./cardAsh";
import type { InkText } from "./cardDust";

// FS-PQ2TW §Change: Ash, a trial alternate leave, R53–R62: the arrival card can leave as ash, a
// burn front crossing its letters pixel by pixel while flakes rise off the burned strokes.

const rgb = (hex: number) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
const INK = rgb(BARROW_HEX.vellum);
const EMBER = rgb(BARROW_HEX.ember);
const SLATE = rgb(BARROW_HEX.slate);
const BRASS = rgb(BARROW_HEX.brass);

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
  const burn = () => canvases.find((c) => c.key === images()[0].args[2])!;
  const front = () => tweens[0];
  return { scene, made, canvases, tweens, timers, logger, ash, gone, emitters, images, config, burn, front };
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
      frontMs: 1000,
      durationMs: 2000,
      ragged: 0.35,
      grainPx: 6,
      band: { ember: 0.06, char: 0.08 },
      flake: {
        lifeMs: 1000,
        maxParticles: 300,
        density: 0.1,
        sizePx: { from: 3, to: 6 },
        speed: { from: 12, to: 32 },
        spreadDeg: 30,
        spinDegPerS: { from: 90, to: 270 },
        alpha: { from: 1, to: 0 },
        rimAlpha: 0.6,
      },
      tint: { edge: "ember", char: "slate", flake: "slate", rim: "ember" },
      rule: { tint: "brass", alpha: 0.6 },
      ease: { front: "Linear", flake: "Sine.easeIn" },
    });
  });

  it("should keep every FS-KYPQ9 §B rule but §B.6's count and fall, §B.2's ceiling and §B.10 (R59)", () => {
    // §B.2: one fixed duration, the front's and a flake's life inside it
    expect(Number.isInteger(CARD_ASH.durationMs)).toBe(true);
    expect(CARD_ASH.durationMs).toBeLessThanOrEqual(2000);
    expect(CARD_ASH.frontMs + CARD_ASH.flake.lifeMs).toBeLessThanOrEqual(CARD_ASH.durationMs);
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
    // the exception, bounded: a few hundred flakes, slow, rising, never sprayed
    expect(CARD_ASH.flake.maxParticles).toBeLessThanOrEqual(300);
    expect(CARD_ASH.flake.speed.to).toBeLessThanOrEqual(32);
    expect(CARD_ASH.flake.spreadDeg).toBeLessThanOrEqual(30);
    // larger than the dust's motes (about 1.2 view px)
    expect(CARD_ASH.flake.sizePx.from).toBeGreaterThan(1.2);
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

    it("should run its front for 1000 ms, linear, redrawing and uploading the image each step", () => {
      const { ash, gone, front, burn } = ashStage();
      ash.play(cardInk(), 961, gone);

      expect(front().config).toMatchObject({ from: 0, to: 1, duration: 1000, ease: "Linear" });
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

  describe("the flakes (R56)", () => {
    function flakes() {
      const stage = ashStage();
      const ink = cardInk();
      stage.ash.play(ink, 961, stage.gone);
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

    it("should come from one emitter of runtime flakes, rising, tumbling and fading over 1000 ms, at a steady speed", () => {
      const { emitters, config, canvases } = flakes();

      expect(emitters()).toHaveLength(1);
      const [emitter] = emitters();
      const sheet = canvases.find((c) => c.key === emitter.args[2])!;
      expect(sheet.frames.length).toBeGreaterThanOrEqual(4);
      expect(emitter.calls.setDepth).toEqual([[961]]);
      expect(emitter.calls.setScrollFactor).toEqual([[0]]);
      expect(config()).toMatchObject({
        frame: sheet.frames.map((f) => f.name),
        lifespan: 1000,
        speed: { min: 12, max: 32 },
        maxParticles: 300,
        emitting: false,
        scale: 1,
        alpha: { start: 1, end: 0, ease: "Sine.easeIn" },
      });
      expect(config().accelerationX).toBeUndefined();
      expect(config().accelerationY).toBeUndefined();
      expect(config().emitZone).toBeUndefined();
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

    it("should rise within 30° of straight up, tumbling 90–270° a second either way", () => {
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

      const spins = Array.from({ length: 200 }, () => {
        const p = {};
        const from = rotate.onEmit(p, "rotate");
        // a whole life: 1 s
        return rotate.onUpdate(p, "rotate", 1, from) - from;
      });
      for (const s of spins) {
        expect(Math.abs(s)).toBeGreaterThanOrEqual(90 - 1e-9);
        expect(Math.abs(s)).toBeLessThanOrEqual(270 + 1e-9);
      }
      expect(spins.some((s) => s > 0)).toBe(true);
      expect(spins.some((s) => s < 0)).toBe(true);
    });

    it("should be irregular slate flakes 3–6 view px across with a dim ember rim", () => {
      const { emitters, canvases } = flakes();
      const sheet = canvases.find((c) => c.key === emitters()[0].args[2])!;
      const [data] = sheet.puts;

      for (const f of sheet.frames) {
        const cells: { c: number[]; a: number; x: number; y: number }[] = [];
        for (let y = f.y; y < f.y + f.h; y++)
          for (let x = f.x; x < f.x + f.w; x++) cells.push({ ...px(data, y * sheet.width + x), x, y });
        const drawn = cells.filter((c) => c.a > 0);
        const xs = drawn.map((c) => c.x);
        const ys = drawn.map((c) => c.y);
        const across = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) + 1;
        expect(across).toBeGreaterThanOrEqual(3);
        expect(across).toBeLessThanOrEqual(6 + 1);
        // a slate body, opaque, and an ember rim, dim (partly see-through)
        expect(drawn.some((c) => c.a === 255 && dist(c.c, SLATE) < 2)).toBe(true);
        const rim = drawn.filter((c) => dist(c.c, EMBER) < 2);
        expect(rim.length).toBeGreaterThan(0);
        for (const c of rim) expect(c.a).toBeLessThanOrEqual(Math.round(0.6 * 255));
        // only the two tokens
        for (const c of drawn) expect(Math.min(dist(c.c, SLATE), dist(c.c, EMBER))).toBeLessThan(2);
      }
      // irregular: not every flake the same shape
      const shapes = new Set(sheet.frames.map((f) => `${f.w}x${f.h}`));
      const counts = new Set(
        sheet.frames.map((f) => {
          let n = 0;
          for (let y = f.y; y < f.y + f.h; y++)
            for (let x = f.x; x < f.x + f.w; x++) if (data[(y * sheet.width + x) * 4 + 3] > 0) n++;
          return n;
        }),
      );
      expect(shapes.size + counts.size).toBeGreaterThan(2);
    });

    it("should make the flake sheet once, and keep it for the next card", () => {
      const stage = ashStage();
      stage.ash.play(cardInk(), 961, stage.gone);
      stage.ash.play(cardInk(), 961, stage.gone);

      const sheets = stage.canvases.filter((c) => c.frames.length > 0);
      expect(sheets).toHaveLength(1);
      expect(sheets[0].removed).toBe(false);
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

  it("should be gone at 2000 ms, everything of it destroyed, and say so (R57)", () => {
    const { ash, gone, timers, made, burn } = ashStage();
    ash.play(cardInk(), 961, gone);

    const [end] = timers;
    expect(end.delay).toBe(2000);
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
    expect(emitters().map((e) => e.destroyed)).toEqual([true, false]);
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
