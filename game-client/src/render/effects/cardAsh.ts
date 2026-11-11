/**
 * The arrival card's leaving as ash (FS-PQ2TW §Change: Ash, a trial alternate leave, R53–R64): when
 * the card's hold ends, a burn front crosses its letters from the left, an ember glow on its edge;
 * the strokes it passes char and go. What comes off is burnt paper and embers, not shapes (the
 * owner's look of 2026-11-12, "灰燼像泡泡一樣怪怪的"): jagged, torn slate shards, some still glowing
 * at one edge, that flutter up, turning over as they go, and a few ember sparks off the front.
 *
 * The burn is per pixel. The card's ink (its two texts' own canvases and its rule) is copied once
 * into one image; each of its pixels carries a fixed threshold, how far along it lies from the left
 * made ragged by noise, and each frame of the front decides from it which pixels are whole, which
 * burning and which gone, redrawn on the CPU into a canvas texture (R55, R63). Flakes start on the
 * strokes as the dust's motes do, through the dust's own `strokeCells` / `ruleCells` /
 * `seedPoints` (R54), each let go on the frame its pixel burns out (R56); sparks likewise, on the
 * frame the front reaches theirs (R64). Flakes and sparks are drawn at runtime, at the render
 * scale, into one sheet; each flake shape is an anim, so a glowing one can dim.
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
    /** How many shapes the sheet holds, each its own anim; a flake takes one at random (R56). */
    shapes: number;
    /** A shape's length, its long side, in view px (R56). */
    lengthPx: Range;
    /** The shapes' lengths run as u^bias over the range: many tiny, a few larger (R56). */
    smallBias: number;
    /** Long side to short, spread over the shapes (R56). */
    aspect: Range;
    /** How far toward `tint.mottle` the lightest mottling goes, 0..1 (R56). */
    mottle: number;
    /** The share of shapes with a glowing patch on one edge, and how it dims to grey, in `steps` frames (R56). */
    glow: { share: number; ms: number; steps: number };
    /** View px/s, picked per flake as it leaves (R56). */
    speed: Range;
    /** The share of its speed a flake loses each second: it slows a little (R56). */
    drag: number;
    /** How far off straight up a flake's heading may be drawn, in degrees, either way (R56). */
    spreadDeg: number;
    /** How fast a flake turns, degrees a second, picked per flake, either way (R56). */
    spinDegPerS: Range;
    /** One turn over in depth, edge-on and back: its scale on one axis through zero (R56, R59). */
    flipMs: Range;
    /** Its sideways sway, picked per flake: how far either side, in view px, and one sway's time (R56). */
    sway: { amplitude: Range; periodMs: Range };
    alpha: Range;
  };
  /** The embers off the front (R64). */
  spark: {
    maxParticles: number;
    /** Sparks per view px² of ink, under the cap. */
    density: number;
    /** Each spark's life, picked per spark. */
    lifeMs: Range;
    /** A spark's size, in view px: one frame each end. */
    sizePx: Range;
    /** View px/s as it leaves: faster than any flake. */
    speed: Range;
    /** The share of its speed a spark loses each second. */
    drag: number;
    spreadDeg: number;
    /** How fast its light beats as it dies, picked per spark. */
    flickerHz: Range;
    /** Drawn additively, so it reads as light. */
    blend: "ADD";
  };
  /** The burning edge, the char, the flake, its mottling, its glow and the sparks (R58). */
  tint: { edge: Token; char: Token; flake: Token; mottle: Token; glow: Token; spark: Token };
  /** The card's rule as the card draws it (`palette.frame` at 0.6), burned with the letters. */
  rule: { tint: Token; alpha: number };
  /** The front's sweep, a flake's fading and a spark's fall (§B.3 allowlist). */
  ease: { front: Easing; flake: Easing; spark: Easing };
}

/** The ash (R53–R64). Like the dust, not an `EFFECTS` entry: a view-space HUD effect, R59's exception. */
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

/** The slice of a Phaser scene the ash draws, tweens, animates and times with. */
export interface CardAshScene {
  add: Pick<Phaser.GameObjects.GameObjectFactory, "particles" | "image">;
  /** Each flake shape is an anim of the sheet's frames: one frame, or a glow dimming. */
  anims: {
    exists(key: string): boolean;
    create(config: { key: string; frames: { key: string; frame: string }[]; frameRate: number; repeat: number }): unknown;
  };
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

const pick = (r: Range, random: () => number) => r.from + random() * (r.to - r.from);

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

/** One frame of the runtime sheet, in its canvas px. */
interface SheetFrame {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One pixel of a flake shape: where it lies in its cell, its alpha, its mottling and its burnt edge. */
interface PaperPixel {
  x: number;
  y: number;
  alpha: number;
  /** 0..1: how far toward `tint.mottle` its paper is. */
  mottle: number;
  /** 0..1: how far into the shape's burnt edge it lies: grey ash, and on a glowing shape, hot. */
  burnt: number;
}

const mix = (a: readonly number[], b: readonly number[], k: number) => [0, 1, 2].map((c) => a[c] + (b[c] - a[c]) * k);

/** Whether (`x`, `y`) lies inside `poly` (even-odd). */
function inside(poly: readonly (readonly [number, number])[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/**
 * Flake shape `k` of `n`, in a `cell`-px square at `resolution` canvas px per view px (R56): a
 * shard of burnt paper. Its length runs over the shapes as u^bias (many tiny, a few larger), its
 * aspect is spread over them (a speck stays a speck: no side under 1.5 view px unless the whole
 * shard is), and its outline is an angular polygon, its two ends at full length; a larger shard
 * has a bite torn out of it, and its edge pixels are torn (some missing, the rest thinned at
 * random), the same paper as its body, so no ring is drawn round it. Its paper is mottled in
 * small patches, and one side of it, never all round, is its burnt edge: ash grey, or on a
 * glowing shape, hot.
 */
function paperShape(k: number, n: number, cell: number, resolution: number, random: () => number): PaperPixel[] {
  const f = CARD_ASH.flake;
  const length = f.lengthPx.from + (f.lengthPx.to - f.lengthPx.from) * ((k + 0.5) / n) ** f.smallBias;
  // a low-discrepancy walk over the aspects, so every sheet holds squat and long shards alike
  const aspect = f.aspect.from + (f.aspect.to - f.aspect.from) * ((k * 0.618034 + 0.31) % 1);
  const a = (length * resolution) / 2;
  const b = Math.max(a / aspect, Math.min(a, 0.75 * resolution));
  const corners = 6 + Math.floor(random() * 4);
  const ends = [0, Math.round(corners / 2)];
  const poly = Array.from({ length: corners }, (_, i) => {
    const end = ends.includes(i);
    const th = (2 * Math.PI * (i + (end ? 0 : (random() - 0.5) * 0.6))) / corners;
    const r = end ? 1 : 0.72 + 0.28 * random();
    return [Math.cos(th) * a * r, Math.sin(th) * b * r] as const;
  });
  const c = cell / 2;
  const key = (x: number, y: number) => y * cell + x;
  const at = new Map<number, PaperPixel>();
  for (let y = 0; y < cell; y++)
    for (let x = 0; x < cell; x++)
      if (inside(poly, x + 0.5 - c, y + 0.5 - c)) at.set(key(x, y), { x, y, alpha: 255, mottle: 0, burnt: 0 });
  if (at.size === 0) {
    const m = Math.floor(c);
    at.set(key(m, m), { x: m, y: m, alpha: 255, mottle: 0, burnt: 0 });
  }
  const edgeOf = () =>
    [...at.values()].filter((p) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => !at.has(key(p.x + dx, p.y + dy))));
  // a bite torn from a larger shard's edge
  if (at.size > 40) {
    const edge = edgeOf();
    const bite = edge[Math.floor(random() * edge.length)];
    const radius = (0.6 + 0.6 * random()) * resolution;
    for (const p of [...at.values()]) if (Math.hypot(p.x - bite.x, p.y - bite.y) <= radius) at.delete(key(p.x, p.y));
  }
  // torn: the edge missing here and there, thinned elsewhere; a speck is left whole
  for (const p of edgeOf()) {
    if (at.size > 12 && random() < 0.15) at.delete(key(p.x, p.y));
    else p.alpha = Math.round(150 + 105 * random());
  }
  // mottled in patches of 2 × 2 canvas px
  const patches = new Map<number, number>();
  for (const p of at.values()) {
    const patch = key(p.x >> 1, p.y >> 1);
    if (!patches.has(patch)) patches.set(patch, random() < 0.5 ? random() * f.mottle : 0);
    p.mottle = patches.get(patch)!;
  }
  // its burnt edge: the far side along a heading of its own, deepest at the very edge
  const phi = random() * 2 * Math.PI;
  const along = (p: PaperPixel) => (p.x + 0.5 - c) * Math.cos(phi) + (p.y + 0.5 - c) * Math.sin(phi);
  const far = Math.max(...[...at.values()].map(along));
  for (const p of at.values()) {
    const e = far > 0 ? along(p) / far : 1;
    p.burnt = e < 0.4 ? 0 : Math.min(1, Math.max(0, (e - 0.4) / 0.6 + (random() - 0.5) * 0.3));
  }
  return [...at.values()];
}

/** The sheet's two spark frames: a pixel and its tail, and a two-pixel ember. */
const SPARK_FRAMES = ["s0", "s1"];

/**
 * The flakes' and the sparks' one sheet (R56, R59, R64), drawn at `resolution` canvas px per view
 * px: a row of cells per flake shape, a glowing shape's row holding its `glow.steps` frames as its
 * burnt edge dims from `ember` to ash grey, then a row of sparks, solid `ember`, each a pixel or a
 * pixel and its tail. Every flake pixel is a mix of `slate`, `slateLight` and `ember`; no blend
 * with anything else.
 */
function ashSheet(resolution: number, random: () => number) {
  const f = CARD_ASH.flake;
  const s = CARD_ASH.spark;
  const body = rgb(CARD_ASH.tint.flake);
  const light = rgb(CARD_ASH.tint.mottle);
  const hot = rgb(CARD_ASH.tint.glow);
  const spark = rgb(CARD_ASH.tint.spark);
  const cell = Math.ceil(f.lengthPx.to * resolution) + 2;
  const steps = f.glow.steps;
  // a spark: a pixel with a fainter tail under it, or a two-pixel ember, its corners dimmed
  const px = (v: number) => Math.max(1, Math.round(v * resolution));
  const sparkSizes = [
    { w: px(s.sizePx.from), h: px(s.sizePx.to), tail: px(s.sizePx.from) },
    { w: px(s.sizePx.to), h: px(s.sizePx.to), tail: Infinity },
  ];
  const width = Math.max(steps * cell, sparkSizes.reduce((sum, z) => sum + z.w + 1, 0));
  const height = f.shapes * cell + Math.max(...sparkSizes.map((z) => z.h));
  const data = new Uint8ClampedArray(width * height * 4);
  const frames: SheetFrame[] = [];
  // the glowing shapes spread over the sizes: every one whose share ticks over
  const glows = (k: number) => Math.floor((k + 1) * f.glow.share) > Math.floor(k * f.glow.share);
  const shapes = Array.from({ length: f.shapes }, (_, k) => {
    const glowing = glows(k);
    const pixels = paperShape(k, f.shapes, cell, resolution, random);
    const names = Array.from({ length: glowing ? steps : 1 }, (_, j) => {
      const name = `f${k}-${j}`;
      const left = j * cell;
      const top = k * cell;
      // the burnt edge's heat at this step: from its own down to none, the ash grey it leaves
      const heat = glowing ? 1 - j / (steps - 1) : 0;
      for (const p of pixels) {
        const paper = mix(mix(body, light, p.mottle), light, p.burnt * 0.7);
        const colour = mix(paper, hot, p.burnt * heat);
        data.set([...colour, p.alpha], ((top + p.y) * width + left + p.x) * 4);
      }
      frames.push({ name, x: left, y: top, w: cell, h: cell });
      return name;
    });
    return names;
  });
  let left = 0;
  const sparks = sparkSizes.map(({ w, h, tail }, n) => {
    const top = f.shapes * cell;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const corner = w >= 3 && (x === 0 || x === w - 1) && (y === 0 || y === h - 1);
        data.set([...spark, y >= tail ? 140 : corner ? 110 : 255], ((top + y) * width + left + x) * 4);
      }
    const name = SPARK_FRAMES[n];
    frames.push({ name, x: left, y: top, w, h });
    left += w + 1;
    return name;
  });
  return { width, height, data, frames, shapes, sparks };
}

/**
 * A flake's flutter, picked as it leaves (R56): its slow turn, its turning over in depth and its
 * sway. Made on the first op that asks for it, whichever the engine calls first.
 */
interface Flutter {
  angle: number;
  /** Degrees a second. */
  spin: number;
  /** Radians per ms, and where in its turn over it starts. */
  flipRate: number;
  flipPhase: number;
  /** View px, signed: the side it sways to first. */
  swayAmp: number;
  /** Radians per ms. */
  swayRate: number;
  /** The sway already put on its x. */
  swayOn: number;
}

/** A spark's flicker, picked as it leaves (R64): how fast its light beats, and from where. */
interface Flicker {
  /** Radians per ms. */
  rate: number;
  phase: number;
}

/**
 * How much of a flake's face shows at `phase` of its turn over: through zero, edge-on, and over to
 * its other face. A square root of the cosine, so it shows its face most of the turn and goes
 * through edge-on quickly, as a scrap of paper does, not shrinking to a line half its life.
 */
function turnedOver(phase: number): number {
  const c = Math.cos(phase);
  return Math.sign(c) * Math.sqrt(Math.abs(c));
}

const FLUTTER = Symbol("cardAshFlutter");
const FLICKER = Symbol("cardAshFlicker");
type Fluttering = { [FLUTTER]?: Flutter; [FLICKER]?: Flicker };

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
  private sparks?: { destroy(): void };
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
    const art = this.art(sheet.resolution);
    if (!art) return false;
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

    const emitter = this.scene.add.particles(0, 0, art.key, this.flakeConfig(art.anims, sheet.resolution));
    emitter.setScrollFactor(0).setDepth(depth);
    this.emitter = emitter;
    const sparks = this.scene.add.particles(0, 0, art.key, this.sparkConfig(art.sparks, sheet.resolution));
    sparks.setScrollFactor(0).setDepth(depth);
    this.sparks = sparks;

    const burn = this.burner(
      sheet,
      cells,
      image.data,
      (at) => emitter.emitParticle(1, at.x, at.y),
      (at) => sparks.emitParticle(1, at.x, at.y),
    );
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
   * front, then charred to slate; each flake whose pixel has just gone is let go by `release`, and
   * each spark whose pixel the front has just reached by `spark`. Only the band and what has just
   * left it are visited: the pixels are kept in threshold order.
   */
  private burner(
    sheet: InkSheet,
    cells: InkCell[],
    out: Uint8ClampedArray,
    release: (at: Point) => void,
    spark: (at: Point) => void,
  ) {
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
    const seeds = (max: number, density: number) =>
      seedPoints(cells, Math.min(max, Math.ceil(area * density)), this.random)
        .map((at) => ({ at, t: field[pixelOf(at)] }))
        .sort((a, b) => a.t - b.t);
    const flakes = seeds(f.maxParticles, f.density);
    const embers = seeds(CARD_ASH.spark.maxParticles, CARD_ASH.spark.density);

    const edge = rgb(CARD_ASH.tint.edge);
    const char = rgb(CARD_ASH.tint.char);
    let goneTo = 0;
    let released = 0;
    let sparked = 0;
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
      while (sparked < embers.length && embers[sparked].t < q) spark(embers[sparked++].at);
    };
  }

  /** A flake's flutter, made on the first ask (R56). */
  private flutter(p: object): Flutter {
    const held = (p as Fluttering)[FLUTTER];
    if (held) return held;
    const f = CARD_ASH.flake;
    const side = () => (this.random() < 0.5 ? -1 : 1);
    const made: Flutter = {
      angle: this.random() * 360,
      spin: side() * pick(f.spinDegPerS, this.random),
      flipRate: (2 * Math.PI) / pick(f.flipMs, this.random),
      flipPhase: this.random() * 2 * Math.PI,
      swayAmp: side() * pick(f.sway.amplitude, this.random),
      swayRate: (2 * Math.PI) / pick(f.sway.periodMs, this.random),
      swayOn: 0,
    };
    (p as Fluttering)[FLUTTER] = made;
    return made;
  }

  /**
   * The flakes (R56): rising within the spread of straight up and slowing a little, turning slowly,
   * turning over in depth (the scale across them swinging through zero, edge-on, and back), swaying
   * sideways, and fading. Each takes one shape's anim: still, or a glow dimming over 500 ms.
   */
  private flakeConfig(anims: string[], resolution: number): EmitterConfig {
    const f = CARD_ASH.flake;
    const size = 1 / resolution;
    // seconds into a flake's life at life fraction t: a flake's life is fixed
    const ms = (t: number) => t * f.lifeMs;
    return {
      anim: anims,
      lifespan: f.lifeMs,
      speed: { min: f.speed.from, max: f.speed.to },
      angle: { onEmit: () => -90 + (this.random() * 2 - 1) * f.spreadDeg },
      // a drag: each slows by a share of its own speed, and never turns back
      accelerationX: { onUpdate: (p: Particle) => -p.velocityX * f.drag },
      accelerationY: { onUpdate: (p: Particle) => -p.velocityY * f.drag },
      // the sway rides the x slot the engine calls anyway: the change since the last frame
      x: {
        onUpdate: (p: Particle, _key: string, t: number, value: number) => {
          const fl = this.flutter(p);
          const offset = fl.swayAmp * Math.sin(fl.swayRate * ms(t));
          const moved = offset - fl.swayOn;
          fl.swayOn = offset;
          return value + moved;
        },
      },
      rotate: {
        onEmit: (p?: Particle) => (p ? this.flutter(p).angle : 0),
        onUpdate: (p: Particle, _key: string, t: number) => {
          const fl = this.flutter(p);
          return fl.angle + (fl.spin * ms(t)) / 1000;
        },
      },
      // drawn at the sheet's resolution: one view px per view px; its size never changes but for
      // the turn over, the scale on one axis through zero and back (R59's §B.4 exception)
      scaleX: size,
      scaleY: {
        onEmit: (p?: Particle) => (p ? size * turnedOver(this.flutter(p).flipPhase) : size),
        onUpdate: (p: Particle, _key: string, t: number) => {
          const fl = this.flutter(p);
          return size * turnedOver(fl.flipPhase + fl.flipRate * ms(t));
        },
      },
      alpha: { start: f.alpha.from, end: f.alpha.to, ease: CARD_ASH.ease.flake },
      maxParticles: f.maxParticles,
      emitting: false,
    };
  }

  /**
   * The sparks (R64): faster than any flake, within their spread of straight up, slowing a little,
   * drawn additively; each flickers as its light falls (`Quad.easeIn`, the record's `ease.spark`)
   * and is gone within its life.
   */
  private sparkConfig(frames: string[], resolution: number): EmitterConfig {
    const s = CARD_ASH.spark;
    const flicker = (p: Particle) => {
      const held = (p as Fluttering)[FLICKER];
      if (held) return held;
      const made: Flicker = { rate: (2 * Math.PI * pick(s.flickerHz, this.random)) / 1000, phase: this.random() * 2 * Math.PI };
      (p as Fluttering)[FLICKER] = made;
      return made;
    };
    const light = (p: Particle, t: number) => {
      const fl = flicker(p);
      // Quad.easeIn's fall: it holds its light, then goes
      const fall = 1 - t * t;
      return Math.min(1, Math.max(0, fall * (0.65 + 0.35 * Math.sin(fl.phase + fl.rate * t * p.life))));
    };
    return {
      frame: frames,
      lifespan: { min: s.lifeMs.from, max: s.lifeMs.to },
      speed: { min: s.speed.from, max: s.speed.to },
      angle: { onEmit: () => -90 + (this.random() * 2 - 1) * s.spreadDeg },
      accelerationX: { onUpdate: (p: Particle) => -p.velocityX * s.drag },
      accelerationY: { onUpdate: (p: Particle) => -p.velocityY * s.drag },
      scale: 1 / resolution,
      alpha: {
        onEmit: (p?: Particle) => (p ? light(p, 0) : 1),
        onUpdate: (p: Particle, _key: string, t: number) => light(p, t),
      },
      blendMode: s.blend,
      maxParticles: s.maxParticles,
      emitting: false,
    };
  }

  /**
   * The flakes' and sparks' sheet at `resolution` and each flake shape's anim, made once and kept;
   * undefined when the sheet cannot be made.
   */
  private art(resolution: number): { key: string; anims: string[]; sparks: string[] } | undefined {
    const f = CARD_ASH.flake;
    const key = `cardAsh-flakes@${resolution}`;
    const anims = Array.from({ length: f.shapes }, (_, k) => `${key}-${k}`);
    if (this.scene.textures.exists(key)) return { key, anims, sparks: SPARK_FRAMES };
    const sheet = ashSheet(resolution, this.random);
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
    // a glowing shape's steps over `glow.ms`, then held on the last, grey
    const frameRate = (f.glow.steps * 1000) / f.glow.ms;
    sheet.shapes.forEach((names, k) => {
      if (this.scene.anims.exists(anims[k])) return;
      this.scene.anims.create({ key: anims[k], frames: names.map((frame) => ({ key, frame })), frameRate, repeat: 0 });
    });
    return { key, anims, sparks: sheet.sparks };
  }

  /** The burned-out image and its texture, put away; the flakes rise on. */
  private putAway(): void {
    this.front = undefined;
    this.image?.destroy();
    this.image = undefined;
    if (this.scene.textures.exists(this.burnKey)) this.scene.textures.remove(this.burnKey);
  }

  /** Takes the ash away at once: its image, its texture, its flakes, its sparks and its front. */
  stop(): void {
    this.end?.remove(false);
    this.front?.stop();
    this.emitter?.destroy();
    this.sparks?.destroy();
    if (this.image) this.putAway();
    this.forget();
  }

  /** Lets go of the ash without touching it: at a scene's end, it went with the scene. */
  forget(): void {
    this.end = undefined;
    this.front = undefined;
    this.emitter = undefined;
    this.sparks = undefined;
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
