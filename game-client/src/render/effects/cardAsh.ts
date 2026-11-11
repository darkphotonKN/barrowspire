/**
 * The arrival card's leaving as ash (FS-PQ2TW §Change: Ash, a trial alternate leave, R53–R63): when
 * the card's hold ends, a burn front crosses its letters from the left, an ember glow on its edge;
 * the strokes it passes char and go, and the charred bits flake off as irregular slate flakes with a
 * dim ember rim that rise slowly, tumbling, and fade.
 *
 * The burn is per pixel. The card's ink (its two texts' own canvases and its rule) is copied once
 * into one image; each of its pixels carries a fixed threshold, how far along it lies from the left
 * made ragged by noise, and each frame of the front decides from it which pixels are whole, which
 * burning and which gone, redrawn on the CPU into a canvas texture (R55, R63). Flakes start on the
 * strokes as the dust's motes do, through the dust's own `strokeCells` / `ruleCells` /
 * `seedPoints` (R54), each let go on the frame its pixel burns out (R56).
 *
 * A trial beside the dust and the smoke; the card's one switch picks between them (`CARD_LEAVE`,
 * `src/ui/arrivalCard.ts`). Where it plays nothing, the card fades (R60).
 */

import type Phaser from "phaser";
import type { ArtLogger } from "@/render/art/library";
import type { Point } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { ruleCells, seedPoints, strokeCells, type CardInk, type InkCell, type InkText } from "./cardDust";
import { prefersReducedMotion } from "./mist";
import type { Easing, Range, Token } from "./table";

/** The ash's numbers (R61), at their starting values; a retune is an edit here. */
export interface CardAshRecord {
  /** How long the burn front takes to cross the card (R55). */
  frontMs: number;
  /** The ash's one fixed duration: the front, then the last flake's life (R57; past §B.2's 1200 ms, R59). */
  durationMs: number;
  /** How ragged the front is, 0..1: the share of a pixel's threshold that is noise, not its place (R55). */
  ragged: number;
  /** The noise's grain, in view px: the size of the front's bays and tongues (R55). */
  grainPx: number;
  /** The band behind the front, in threshold units: its ember edge, then its char (R55). */
  band: { ember: number; char: number };
  flake: {
    /** Each flake's life (R56). */
    lifeMs: number;
    /** Flakes for the whole card, at most, past §B.6's 12 (R56, R59). */
    maxParticles: number;
    /** Flakes per view px² of ink, under the cap (R56). */
    density: number;
    /** A flake's size across, in view px, picked per shape (R56). */
    sizePx: Range;
    /** View px/s, picked per flake and held: a steady rise (R56). */
    speed: Range;
    /** How far off straight up a flake's heading may be drawn, in degrees, either way (R56). */
    spreadDeg: number;
    /** How fast a flake tumbles, degrees a second, picked per flake, either way (R56). */
    spinDegPerS: Range;
    alpha: Range;
    /** The rim's alpha: dim, the world showing through it (R56). */
    rimAlpha: number;
  };
  /** The burning edge, the char, the flake and its rim (R58). */
  tint: { edge: Token; char: Token; flake: Token; rim: Token };
  /** The card's rule as the card draws it (`palette.frame` at 0.6), burned with the letters. */
  rule: { tint: Token; alpha: number };
  /** The front's sweep and a flake's fading (§B.3 allowlist). */
  ease: { front: Easing; flake: Easing };
}

/** The ash (R53–R63). Like the dust, not an `EFFECTS` entry: a view-space HUD effect, R59's exception. */
export const CARD_ASH = {
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
} as const satisfies CardAshRecord;

/** A piece of the card the ash takes away: the heading, the rule, the line. */
export interface AshLetter {
  setVisible(visible: boolean): unknown;
}

/** What the ash reads and takes: the card's ink, as the dust reads it, and its three pieces. */
export interface AshInk extends CardInk {
  letters: readonly AshLetter[];
}

/** A canvas texture as the ash draws on it: Phaser's `CanvasTexture` is one. */
interface AshCanvas {
  context: Pick<CanvasRenderingContext2D, "createImageData" | "putImageData">;
  add(name: string, sourceIndex: number, x: number, y: number, width: number, height: number): unknown;
  refresh(): unknown;
}

/** The slice of a Phaser scene the ash draws, tweens and times with. */
export interface CardAshScene {
  add: Pick<Phaser.GameObjects.GameObjectFactory, "particles" | "image">;
  tweens: Pick<Phaser.Tweens.TweenManager, "addCounter">;
  time: Pick<Phaser.Time.Clock, "delayedCall">;
  textures: {
    exists(key: string): boolean;
    remove(key: string): unknown;
    createCanvas(key: string, width: number, height: number): AshCanvas | null;
  };
}

export interface CardAshOptions {
  /** Whether the player asked for less motion; read once, as the card starts to leave. */
  reducedMotion?: () => boolean;
  logger?: ArtLogger;
  random?: () => number;
}

/** The card's ink in one image, in canvas px at `resolution` per view px, its top left at (`left`, `top`) view px. */
interface InkSheet {
  left: number;
  top: number;
  resolution: number;
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const rgb = (token: Token) => {
  const hex = BARROW_HEX[token];
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff] as const;
};

/** Where a text lies, in view px, and how its canvas maps onto it. */
function placeOf(text: InkText) {
  const resolution = text.style.resolution || 1;
  const left = text.x - text.displayOriginX * text.scaleX;
  const top = text.y - text.displayOriginY * text.scaleY;
  const width = (text.canvas.width * text.scaleX) / resolution;
  const height = (text.canvas.height * text.scaleY) / resolution;
  return { left, top, width, height, resolution };
}

/**
 * The card's ink in one image: each text's own pixels, at the finest text's resolution, and the
 * rule's line under them as the card draws it. A failed read throws.
 */
function inkSheet(ink: CardInk): InkSheet {
  const places = ink.texts.map(placeOf);
  const resolution = Math.max(1, ...places.map((p) => p.resolution));
  const { rule } = ink;
  const left = Math.min(rule.x1, ...places.map((p) => p.left));
  const top = Math.min(rule.y - 0.5, ...places.map((p) => p.top));
  const right = Math.max(rule.x2, ...places.map((p) => p.left + p.width));
  const bottom = Math.max(rule.y + 0.5, ...places.map((p) => p.top + p.height));
  const width = Math.max(1, Math.ceil((right - left) * resolution - 1e-6));
  const height = Math.max(1, Math.ceil((bottom - top) * resolution - 1e-6));
  const data = new Uint8ClampedArray(width * height * 4);

  ink.texts.forEach((text, n) => {
    const place = places[n];
    const src = text.context.getImageData(0, 0, text.canvas.width, text.canvas.height).data;
    const x0 = Math.round((place.left - left) * resolution);
    const y0 = Math.round((place.top - top) * resolution);
    // canvas px of the text per canvas px of the sheet: 1 when the two share a resolution
    const kx = text.canvas.width / Math.round(place.width * resolution);
    const ky = text.canvas.height / Math.round(place.height * resolution);
    for (let y = Math.max(0, y0); y < Math.min(height, y0 + Math.round(place.height * resolution)); y++) {
      const sy = Math.min(text.canvas.height - 1, Math.floor((y - y0) * ky));
      for (let x = Math.max(0, x0); x < Math.min(width, x0 + Math.round(place.width * resolution)); x++) {
        const s = (sy * text.canvas.width + Math.min(text.canvas.width - 1, Math.floor((x - x0) * kx))) * 4;
        if (src[s + 3] === 0) continue;
        data.set(src.subarray(s, s + 4), (y * width + x) * 4);
      }
    }
  });

  const [r, g, b] = rgb(CARD_ASH.rule.tint);
  const a = Math.round(CARD_ASH.rule.alpha * 255);
  const ry = Math.floor((rule.y - 0.5 - top) * resolution);
  for (let y = Math.max(0, ry); y < Math.min(height, ry + Math.max(1, Math.round(resolution))); y++)
    for (let x = Math.round((rule.x1 - left) * resolution); x < Math.round((rule.x2 - left) * resolution); x++) {
      const i = (y * width + x) * 4;
      if (x >= 0 && x < width && data[i + 3] === 0) data.set([r, g, b, a], i);
    }
  return { left, top, resolution, width, height, data };
}

/**
 * Each pixel's threshold (R55): how far along it lies from the left, made ragged by a smooth value
 * noise of `grainPx` and a little grain of its own. In [0, 1): the front, going past 1, takes all.
 */
function burnField(sheet: InkSheet, random: () => number): Float32Array {
  const { width, height } = sheet;
  const cell = CARD_ASH.grainPx * sheet.resolution;
  const gw = Math.ceil(width / cell) + 2;
  const gh = Math.ceil(height / cell) + 2;
  const grid = Float32Array.from({ length: gw * gh }, () => random());
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const field = new Float32Array(width * height);
  const { ragged } = CARD_ASH;
  // each column's grid cell and its eased share across it, worked out once
  const cols = Int32Array.from({ length: width }, (_, x) => Math.floor(x / cell));
  const across = Float32Array.from({ length: width }, (_, x) => smooth(x / cell - cols[x]));
  for (let y = 0; y < height; y++) {
    const j = Math.floor(y / cell);
    const fy = smooth(y / cell - j);
    const row = j * gw;
    for (let x = 0; x < width; x++) {
      const i = row + cols[x];
      const fx = across[x];
      const top = grid[i] + (grid[i + 1] - grid[i]) * fx;
      const bottom = grid[i + gw] + (grid[i + gw + 1] - grid[i + gw]) * fx;
      const noise = 0.8 * (top + (bottom - top) * fy) + 0.2 * random();
      const t = (1 - ragged) * ((x + 0.5) / width) + ragged * noise;
      field[y * width + x] = Math.min(0.9999, Math.max(0, t));
    }
  }
  return field;
}

/**
 * The inked pixels of `src` (alpha above 0), in the order the front reaches them: by threshold.
 * Bucketed by threshold, then finished by insertion, which has next to nothing left to move: a
 * comparator sort of a card's tens of thousands of pixels costs milliseconds on the frame the card
 * leaves.
 */
function inkOrder(field: Float32Array, src: Uint8ClampedArray): Int32Array {
  const BUCKETS = 1 << 16;
  const starts = new Uint32Array(BUCKETS + 1);
  let inked = 0;
  for (let i = 0; i < field.length; i++)
    if (src[i * 4 + 3] > 0) {
      starts[Math.floor(field[i] * BUCKETS) + 1]++;
      inked++;
    }
  for (let b = 1; b <= BUCKETS; b++) starts[b] += starts[b - 1];
  const order = new Int32Array(inked);
  for (let i = 0; i < field.length; i++) if (src[i * 4 + 3] > 0) order[starts[Math.floor(field[i] * BUCKETS)]++] = i;
  for (let n = 1; n < order.length; n++) {
    const i = order[n];
    let m = n - 1;
    for (; m >= 0 && field[order[m]] > field[i]; m--) order[m + 1] = order[m];
    order[m + 1] = i;
  }
  return order;
}

/** One flake shape of the runtime sheet, in its canvas px. */
interface FlakeFrame {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How many flake shapes the sheet holds; each flake takes one at random. */
const FLAKE_SHAPES = 6;

/**
 * The flakes' sheet (R56, R59): `FLAKE_SHAPES` irregular shapes side by side, each a few-sided
 * blob of `slate` with a rim of `ember` at the rim's alpha, drawn at `resolution` canvas px per
 * view px. Crisp pixels, no blend: only the two tokens appear.
 */
function flakeSheet(resolution: number, random: () => number) {
  const f = CARD_ASH.flake;
  const body = rgb(CARD_ASH.tint.flake);
  const rim = rgb(CARD_ASH.tint.rim);
  const rimAlpha = Math.round(f.rimAlpha * 255);
  const rimPx = Math.max(1, 0.75 * resolution);
  const shapes = Array.from({ length: FLAKE_SHAPES }, () => {
    const r = ((f.sizePx.from + random() * (f.sizePx.to - f.sizePx.from)) / 2) * resolution;
    const corners = 5 + Math.floor(random() * 3);
    const radii = Array.from({ length: corners }, () => r * (0.7 + 0.3 * random()));
    const turn = random() * 2 * Math.PI;
    return { size: 2 * Math.ceil(r) + 1, radii, turn };
  });
  const width = shapes.reduce((sum, s) => sum + s.size, 0);
  const height = Math.max(...shapes.map((s) => s.size));
  const data = new Uint8ClampedArray(width * height * 4);
  const frames: FlakeFrame[] = [];
  let left = 0;
  shapes.forEach(({ size, radii, turn }, n) => {
    const c = (size - 1) / 2;
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - c, y - c);
        // the edge's radius this way round: straight between the corners' radii
        const u = (((Math.atan2(y - c, x - c) + turn) / (2 * Math.PI)) % 1 + 1) % 1 * radii.length;
        const k = Math.floor(u);
        const edge = radii[k] + (radii[(k + 1) % radii.length] - radii[k]) * (u - k);
        if (d > edge) continue;
        const inside = d < 0.5 || d <= edge - rimPx;
        data.set(inside ? [...body, 255] : [...rim, rimAlpha], (y * width + left + x) * 4);
      }
    frames.push({ name: String(n), x: left, y: 0, w: size, h: size });
    left += size;
  });
  return { width, height, data, frames };
}

/** A particle carrying its tumble, set as it is emitted. */
const TUMBLE = Symbol("cardAshTumble");
type Tumbling = { [TUMBLE]?: { angle: number; spin: number } };

type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
type Particle = Phaser.GameObjects.Particles.Particle;

/** Each card ash its own burn texture's key, so two scenes' never meet. */
let burns = 0;

/**
 * Plays one card's ash at a time, and owns it until it is gone: its burning image and texture, its
 * front, its one emitter of flakes, and its end. The same shape as `CardDust`, and it takes the
 * letters itself: it hides them as its image of them starts to burn.
 *
 *   const ash = new CardAsh(scene);
 *   if (!ash.play(ink, depth, gone)) fadeTheCard(); // reduced motion, a failed read, no texture
 *   ash.stop();   // a new card, a resize: gone at once
 *   ash.forget(); // the scene ended and took it
 */
export class CardAsh {
  /** The ash burns the card's letters itself: the card leaves them to it. */
  readonly takesLetters = true;
  private readonly burnKey = `cardAsh-burn-${burns++}`;
  private image?: { destroy(): void };
  private front?: { stop(): unknown };
  private emitter?: { destroy(): void };
  private end?: { remove(dispatchCallback?: boolean): void };
  private readonly warned = new Set<string>();
  private readonly reducedMotion: () => boolean;
  private readonly logger: ArtLogger;
  private readonly random: () => number;

  constructor(
    private readonly scene: CardAshScene,
    options: CardAshOptions = {},
  ) {
    this.reducedMotion = options.reducedMotion ?? (() => prefersReducedMotion());
    this.logger = options.logger ?? console;
    this.random = options.random ?? Math.random;
  }

  /**
   * Burns `ink`'s letters to ash at `depth`, in place of any ash still up, calling `gone` once the
   * last flake has faded. False when it plays nothing, its letters untouched, and the card should
   * fade instead: reduced motion, strokes that cannot be read, or no canvas texture.
   */
  play(ink: AshInk, depth: number, gone: () => void): boolean {
    this.stop();
    if (this.reducedMotion()) return false;
    const read = this.read(ink);
    if (!read) return false;
    const { cells, sheet } = read;
    const flakes = this.flakes(sheet.resolution);
    if (!flakes) return false;
    if (this.scene.textures.exists(this.burnKey)) this.scene.textures.remove(this.burnKey);
    const canvas = this.scene.textures.createCanvas(this.burnKey, sheet.width, sheet.height);
    if (!canvas) {
      this.warn("texture", "card ash: no canvas texture for the burn; the card fades");
      return false;
    }

    const image = canvas.context.createImageData(sheet.width, sheet.height);
    image.data.set(sheet.data);
    const draw = () => {
      canvas.context.putImageData(image, 0, 0);
      canvas.refresh();
    };
    draw();
    this.image = this.scene.add
      .image(sheet.left, sheet.top, this.burnKey)
      .setOrigin(0, 0)
      .setScale(1 / sheet.resolution)
      .setScrollFactor(0)
      .setDepth(depth);
    ink.letters.forEach((letter) => letter.setVisible(false));

    const emitter = this.scene.add.particles(0, 0, flakes.key, this.flakeConfig(flakes.names, sheet.resolution));
    emitter.setScrollFactor(0).setDepth(depth);
    this.emitter = emitter;

    const burn = this.burner(sheet, cells, image.data, (at) => emitter.emitParticle(1, at.x, at.y));
    this.front = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: CARD_ASH.frontMs,
      ease: CARD_ASH.ease.front,
      onUpdate: (tween: Phaser.Tweens.Tween) => {
        burn(tween.getValue() ?? 1);
        draw();
      },
      // burned out: nothing of the image is left to draw
      onComplete: () => this.putAway(),
    });
    this.end = this.scene.time.delayedCall(CARD_ASH.durationMs, () => {
      this.stop();
      gone();
    });
    return true;
  }

  /**
   * The burn over `sheet`, writing into `out`: given the front at `v` (0..1), every ink pixel it has
   * passed by the whole band is gone, each within the band is tinted from its ink to ember at the
   * front, then charred to slate; and each flake whose pixel has just gone is let go by `release`.
   * Only the band and what has just left it are visited: the pixels are kept in threshold order.
   */
  private burner(sheet: InkSheet, cells: InkCell[], out: Uint8ClampedArray, release: (at: Point) => void) {
    const { band } = CARD_ASH;
    const width = band.ember + band.char;
    const edgeShare = band.ember / width;
    const field = burnField(sheet, this.random);
    const src = sheet.data;
    const order = inkOrder(field, src);

    const f = CARD_ASH.flake;
    const area = cells.reduce((sum, c) => sum + c.w * c.h, 0);
    const pixelOf = (p: Point) => {
      const x = Math.min(sheet.width - 1, Math.max(0, Math.floor((p.x - sheet.left) * sheet.resolution)));
      const y = Math.min(sheet.height - 1, Math.max(0, Math.floor((p.y - sheet.top) * sheet.resolution)));
      return y * sheet.width + x;
    };
    const flakes = seedPoints(cells, Math.min(f.maxParticles, Math.ceil(area * f.density)), this.random)
      .map((at) => ({ at, t: field[pixelOf(at)] }))
      .sort((a, b) => a.t - b.t);

    const edge = rgb(CARD_ASH.tint.edge);
    const char = rgb(CARD_ASH.tint.char);
    let goneTo = 0;
    let released = 0;
    return (v: number) => {
      const q = v * (1 + width);
      const behind = q - width;
      while (goneTo < order.length && field[order[goneTo]] <= behind) out[order[goneTo++] * 4 + 3] = 0;
      for (let n = goneTo; n < order.length; n++) {
        const i = order[n];
        if (field[i] >= q) break;
        const k = Math.min(1, (q - field[i]) / width);
        const o = i * 4;
        for (let ch = 0; ch < 3; ch++)
          out[o + ch] =
            k < edgeShare
              ? src[o + ch] + (edge[ch] - src[o + ch]) * (k / edgeShare)
              : edge[ch] + (char[ch] - edge[ch]) * ((k - edgeShare) / (1 - edgeShare));
      }
      while (released < flakes.length && flakes[released].t <= behind) release(flakes[released++].at);
    };
  }

  /** The flakes: rising, within the spread of straight up, at a steady speed, tumbling and fading (R56). */
  private flakeConfig(names: string[], resolution: number): EmitterConfig {
    const f = CARD_ASH.flake;
    const pick = (r: Range) => r.from + this.random() * (r.to - r.from);
    return {
      frame: names,
      lifespan: f.lifeMs,
      speed: { min: f.speed.from, max: f.speed.to },
      angle: { onEmit: () => -90 + (this.random() * 2 - 1) * f.spreadDeg },
      rotate: {
        onEmit: (p?: Particle) => {
          const tumble = {
            angle: this.random() * 360,
            spin: (this.random() < 0.5 ? -1 : 1) * pick(f.spinDegPerS),
          };
          if (p) (p as Tumbling)[TUMBLE] = tumble;
          return tumble.angle;
        },
        onUpdate: (p: Particle, _key: string, t: number, value: number) => {
          const tumble = (p as Tumbling)[TUMBLE];
          return tumble ? tumble.angle + (tumble.spin * t * f.lifeMs) / 1000 : value;
        },
      },
      // drawn at the sheet's resolution: one view px per view px, its size never changing
      scale: 1 / resolution,
      alpha: { start: f.alpha.from, end: f.alpha.to, ease: CARD_ASH.ease.flake },
      maxParticles: f.maxParticles,
      emitting: false,
    };
  }

  /** The flakes' sheet at `resolution`, made once and kept; undefined when it cannot be made. */
  private flakes(resolution: number): { key: string; names: string[] } | undefined {
    const key = `cardAsh-flakes@${resolution}`;
    const names = Array.from({ length: FLAKE_SHAPES }, (_, n) => String(n));
    if (this.scene.textures.exists(key)) return { key, names };
    const sheet = flakeSheet(resolution, this.random);
    const canvas = this.scene.textures.createCanvas(key, sheet.width, sheet.height);
    if (!canvas) {
      this.warn("texture", "card ash: no canvas texture for the flakes; the card fades");
      return undefined;
    }
    const image = canvas.context.createImageData(sheet.width, sheet.height);
    image.data.set(sheet.data);
    canvas.context.putImageData(image, 0, 0);
    sheet.frames.forEach((fr) => canvas.add(fr.name, 0, fr.x, fr.y, fr.w, fr.h));
    canvas.refresh();
    return { key, names };
  }

  /** The burned-out image and its texture, put away; the flakes rise on. */
  private putAway(): void {
    this.front = undefined;
    this.image?.destroy();
    this.image = undefined;
    if (this.scene.textures.exists(this.burnKey)) this.scene.textures.remove(this.burnKey);
  }

  /** Takes the ash away at once: its image, its texture, its flakes and its front. */
  stop(): void {
    this.end?.remove(false);
    this.front?.stop();
    this.emitter?.destroy();
    if (this.image) this.putAway();
    this.forget();
  }

  /** Lets go of the ash without touching it: at a scene's end, it went with the scene. */
  forget(): void {
    this.end = undefined;
    this.front = undefined;
    this.emitter = undefined;
    this.image = undefined;
  }

  /** The strokes and the rule, and the card's ink in one image; undefined when they cannot be read. */
  private read(ink: CardInk): { cells: InkCell[]; sheet: InkSheet } | undefined {
    let strokes: InkCell[];
    let sheet: InkSheet;
    try {
      strokes = strokeCells(ink.texts);
      sheet = inkSheet(ink);
    } catch (error) {
      this.warn("read", "card ash: the card's strokes could not be read; the card fades", { error });
      return undefined;
    }
    if (strokes.length === 0) {
      this.warn("read", "card ash: the card's texts drew no ink; the card fades");
      return undefined;
    }
    return { cells: [...strokes, ...ruleCells(ink.rule)], sheet };
  }

  private warn(what: string, message: string, context?: Record<string, unknown>): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    this.logger.warn(message, context);
  }
}
