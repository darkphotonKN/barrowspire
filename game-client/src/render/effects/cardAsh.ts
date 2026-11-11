/**
 * The arrival card's leaving as ash (FS-PQ2TW §Change: Ash, a trial alternate leave, R53–R64): when
 * the card's hold ends, a burn front crosses its letters from the left, an ember glow on its edge;
 * the strokes it passes char and go. What comes off is burnt paper and embers, not shapes (the
 * owner's look of 2026-11-12, "灰燼像泡泡一樣怪怪的"): jagged, torn shards of charred paper, a
 * black core and a broken pale ash rim, some with a seam of fire still eating their edge
 * ("灰燼碎屑再多一點燒焦感"), that flutter up, turning over as they go, and a few sparks off the
 * front. Every hot thing runs fire's ramp, hottest first ("火的顏色有辦法擬真一點嗎").
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
  /**
   * The band behind the front, in threshold units: its fire, then its char (R55). Across the fire
   * a pixel runs `tint.band`'s ramp, hottest first, reaching each stop at its share of the fire in
   * `stops`; across the char, from the ramp's last stop to `tint.char`.
   */
  band: { ember: number; char: number; stops: readonly number[] };
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
    /** How far toward `tint.core` a char blotch goes, 0..1: darker spots in the body (R56). */
    mottle: number;
    /**
     * The charred body (R56): its lift from `tint.core` toward `tint.flake`, `core` at its deepest
     * and `edge` by its torn edge, the core reached `depthPx` view px in.
     */
    char: { core: number; edge: number; depthPx: number };
    /**
     * The ash rim (R56): the torn edge going pale toward `tint.rim`, by up to `pale`, `depthPx` view
     * px deep, broken round the outline (where its noise falls under `gap`, the char shows to the
     * edge), so it is never a closed ring.
     */
    ash: { depthPx: number; pale: number; gap: number };
    /**
     * The share of shapes with a glowing seam along part of their torn edge, and how it dies to ash
     * over `ms` (R56): `steps` frames of its anim, drawn from `shades` of the seam, from its heat to
     * none. Its colour cools down `tint.seam`, passing each stop at its heat in `cools`, then goes
     * to the rim's ash. It holds its heat, then goes (`ease.glow`), and flickers `flicker.count`
     * times on the way: a dip of `depth` of its heat and back within `ms`, each centred somewhere
     * in `within` of its dying.
     */
    glow: {
      share: number;
      /** How deep the seam reaches in from the edge, in view px (R56). */
      seamPx: number;
      cools: readonly number[];
      /**
       * Where a glowing shape's burnt edge starts, as a share of the way from its middle to its far
       * side (a plain shape's starts at 0.4): lower, a larger ember patch, still on one side (R56).
       */
      edgeFrom: number;
      ms: number;
      steps: number;
      shades: number;
      flicker: { count: Range; depth: number; ms: number; within: Range };
    };
    /** View px/s, picked per flake as it leaves (R56). */
    speed: Range;
    /** The share of its speed a flake loses each second: it slows a little (R56). */
    drag: number;
    /**
     * How far left of straight up a flake's heading is centred, in degrees, screen-left (R56): the
     * ash drifts back over what has burned.
     */
    leanLeftDeg: number;
    /** How far off that centre a flake's heading may be drawn, in degrees, either way (R56). */
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
    /** View px/s as it leaves: faster than the flakes on average. */
    speed: Range;
    /** The share of its speed a spark loses each second. */
    drag: number;
    /** How far left of straight up a spark's heading is centred, in degrees, screen-left (R64). */
    leanLeftDeg: number;
    /** How far off that centre a spark's heading may be drawn, in degrees, either way. */
    spreadDeg: number;
    /** How fast its light beats as it dies, picked per spark. */
    flickerHz: Range;
    /** Where in its life it passes each stop of `tint.spark`, born hottest, cooling to red. */
    cools: readonly number[];
    /** Drawn additively, so it reads as light. */
    blend: "ADD";
  };
  /**
   * The colours (R58): the burn's fire ramp, hottest first, and its char; a flake's char core (and
   * its blotches), its body and its ash rim; its glowing seam's ramp and the sparks', hottest first.
   */
  tint: {
    band: readonly Token[];
    char: Token;
    core: Token;
    flake: Token;
    rim: Token;
    seam: readonly Token[];
    spark: readonly Token[];
  };
  /** The card's rule as the card draws it (`palette.frame` at 0.6), burned with the letters. */
  rule: { tint: Token; alpha: number };
  /** The front's sweep, a flake's fading, a spark's fall and a glow's dying (§B.3 allowlist). */
  ease: { front: Easing; flake: Easing; spark: Easing; glow: Easing };
}

/** The ash (R53–R64). Like the dust, not an `EFFECTS` entry: a view-space HUD effect, R59's exception. */
export const CARD_ASH = {
  frontMs: 2000,
  durationMs: 3000,
  ragged: 0.35,
  grainPx: 6,
  // the owner's "火的顏色有辦法擬真一點嗎" (2026-11-12): fire runs a temperature ramp
  band: { ember: 0.06, char: 0.08, stops: [0.1, 0.35, 0.65, 1] },
  flake: {
    lifeMs: 1000,
    // the owner's sixth tune of 2026-11-12, "灰燼碎屑少一點": a fifth fewer again (was 240 and
    // 0.08; before his fourth, "灰燼 碎屑少２０％", 300 and 0.1)
    maxParticles: 192,
    density: 0.064,
    shapes: 24,
    lengthPx: { from: 3, to: 14 },
    smallBias: 1.2,
    aspect: { from: 1.1, to: 2.8 },
    // the owner's "灰燼碎屑再多一點燒焦感" (2026-11-12): a charred core, char blotches, a pale ash rim
    mottle: 0.6,
    char: { core: 0.08, edge: 0.55, depthPx: 2 },
    ash: { depthPx: 0.75, pale: 0.85, gap: 0.45 },
    glow: {
      share: 0.85,
      seamPx: 0.75,
      cools: [1, 0.6, 0.3],
      edgeFrom: 0.28,
      ms: 900,
      steps: 20,
      shades: 12,
      flicker: { count: { from: 1, to: 2 }, depth: 0.6, ms: 100, within: { from: 0.15, to: 0.7 } },
    },
    speed: { from: 18, to: 45 },
    drag: 0.4,
    leanLeftDeg: 30,
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
    leanLeftDeg: 15,
    spreadDeg: 25,
    flickerHz: { from: 6, to: 14 },
    cools: [0, 0.45, 1],
    blend: "ADD",
  },
  tint: {
    band: ["fireCore", "fireHot", "ember", "fireDeep"],
    char: "slate",
    core: "pitch",
    flake: "slate",
    rim: "vellumFaint",
    seam: ["fireHot", "ember", "fireDeep"],
    spark: ["fireHot", "ember", "fireDeep"],
  },
  rule: { tint: "brass", alpha: 0.6 },
  ease: { front: "Linear", flake: "Sine.easeIn", spark: "Quad.easeIn", glow: "Sine.easeIn" },
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

/**
 * The colour at `x` along a ramp of `colours` placed at `at` (rising or falling), held at its ends:
 * how a fire's colour runs with its heat (the owner's "火的顏色有辦法擬真一點嗎").
 */
function ramp(colours: readonly (readonly number[])[], at: readonly number[], x: number): number[] {
  const rising = at[0] <= at[at.length - 1];
  const cs = rising ? colours : [...colours].reverse();
  const ps = rising ? at : [...at].reverse();
  if (x <= ps[0]) return [...cs[0]];
  for (let n = 1; n < ps.length; n++)
    if (x <= ps[n]) return mix(cs[n - 1], cs[n], (x - ps[n - 1]) / (ps[n] - ps[n - 1] || 1));
  return [...cs[cs.length - 1]];
}

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

/** One pixel of a flake shape: where it lies in its cell, its alpha, and what of burnt paper it is. */
interface PaperPixel {
  x: number;
  y: number;
  alpha: number;
  /** Canvas px in from outside the shape: 1 on its outline. */
  depth: number;
  /** 0..1: how far a char blotch takes it toward `tint.core`. */
  blotch: number;
  /** 0..1: how far into the ash rim it lies, toward `tint.rim`. */
  rim: number;
  /** 0..1: how much of the glowing seam it carries (a glowing shape only). */
  seam: number;
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
 * shard of burnt paper. Its length runs over the shapes as u^bias (the smaller more), its aspect
 * is spread over them (a shard, not a line: no side under the shortest length unless the whole
 * shard is), and its outline is an angular polygon, its two ends at full length; a larger shard
 * has a bite torn out of it, and its edge pixels are torn (some missing, the rest thinned at
 * random). Its paper is charred (the owner's "灰燼碎屑再多一點燒焦感"): blotched darker in small
 * patches, its depth read in from the edge so the core is the darkest, and its torn edge pale
 * ash, a rim that comes and goes round the outline (never a closed ring), palest on its burnt side
 * (from `edgeFrom` of the way out along a heading of its own). On a glowing shape the burnt side's
 * edge band, `glow.seamPx` deep, carries the seam: the ember eating into the edge, on one side only.
 */
function paperShape(k: number, n: number, cell: number, resolution: number, random: () => number, glowing: boolean): PaperPixel[] {
  const f = CARD_ASH.flake;
  const length = f.lengthPx.from + (f.lengthPx.to - f.lengthPx.from) * ((k + 0.5) / n) ** f.smallBias;
  // a low-discrepancy walk over the aspects, so every sheet holds squat and long shards alike
  const aspect = f.aspect.from + (f.aspect.to - f.aspect.from) * ((k * 0.618034 + 0.31) % 1);
  const a = (length * resolution) / 2;
  const b = Math.max(a / aspect, Math.min(a, (f.lengthPx.from / 2) * resolution));
  const corners = 6 + Math.floor(random() * 4);
  const ends = [0, Math.round(corners / 2)];
  const outline = Array.from({ length: corners }, (_, i) => {
    const end = ends.includes(i);
    const th = (2 * Math.PI * (i + (end ? 0 : (random() - 0.5) * 0.6))) / corners;
    const r = end ? 1 : 0.72 + 0.28 * random();
    return [Math.cos(th) * a * r, Math.sin(th) * b * r] as const;
  });
  // a shard, not a line: its corners, drawn in from its sides, still span the least width across
  const ys = outline.map(([, y]) => y);
  const across = Math.max(...ys) - Math.min(...ys);
  const least = Math.min(2 * a, f.lengthPx.from * resolution);
  const widen = across > 0 && across < least ? least / across : 1;
  const poly = outline.map(([x, y]) => [x, y * widen] as const);
  const c = cell / 2;
  const key = (x: number, y: number) => y * cell + x;
  const at = new Map<number, PaperPixel>();
  for (let y = 0; y < cell; y++)
    for (let x = 0; x < cell; x++)
      if (inside(poly, x + 0.5 - c, y + 0.5 - c)) at.set(key(x, y), { x, y, alpha: 255, depth: 0, blotch: 0, rim: 0, seam: 0 });
  if (at.size === 0) {
    const m = Math.floor(c);
    at.set(key(m, m), { x: m, y: m, alpha: 255, depth: 0, blotch: 0, rim: 0, seam: 0 });
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
  // its depth, read in from the outline: 1 there, rising a canvas px a ring
  let ring = edgeOf();
  for (const p of ring) p.depth = 1;
  for (let d = 2; ring.length > 0; d++) {
    const next: PaperPixel[] = [];
    for (const p of ring)
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const q = at.get(key(p.x + dx, p.y + dy));
        if (q && q.depth === 0) {
          q.depth = d;
          next.push(q);
        }
      }
    ring = next;
  }
  // char blotches in patches of 2 × 2 canvas px
  const patches = new Map<number, number>();
  for (const p of at.values()) {
    const patch = key(p.x >> 1, p.y >> 1);
    if (!patches.has(patch)) patches.set(patch, random() < 0.5 ? random() * f.mottle : 0);
    p.blotch = patches.get(patch)!;
  }
  // its burnt side: the far side along a heading of its own, deepest at the very edge
  const phi = random() * 2 * Math.PI;
  const along = (p: PaperPixel) => (p.x + 0.5 - c) * Math.cos(phi) + (p.y + 0.5 - c) * Math.sin(phi);
  const far = Math.max(...[...at.values()].map(along));
  const edgeFrom = glowing ? f.glow.edgeFrom : 0.4;
  // the ash rim's cover round the outline: a slow wave of the bearing, so it comes and goes, its
  // phase from the burnt side's heading (no draw of its own: the shapes stay as they were drawn)
  const cover = (p: PaperPixel) => {
    const th = Math.atan2(p.y + 0.5 - c, p.x + 0.5 - c);
    return 0.5 + 0.28 * Math.sin(2 * th + 3 * phi) + 0.22 * Math.sin(3 * th + 5 * phi + 1);
  };
  const within = (d: number, px: number) => Math.min(1, Math.max(0, 1 - (d - 1) / Math.max(1, px * resolution)));
  for (const p of at.values()) {
    const e = far > 0 ? along(p) / far : 1;
    const burnt = e < edgeFrom ? 0 : Math.min(1, Math.max(0, (e - edgeFrom) / 0.6 + (random() - 0.5) * 0.3));
    const band = within(p.depth, f.ash.depthPx);
    const shown = Math.min(1, Math.max(0, (cover(p) + 0.5 * burnt - f.ash.gap) / 0.25));
    p.seam = glowing ? Math.min(1, Math.max(0, (burnt - 0.15) * 1.6)) * within(p.depth, f.glow.seamPx) : 0;
    p.rim = Math.max(shown * band, p.seam > 0 ? band : 0);
  }
  return [...at.values()];
}

/**
 * A glow's heat, 1 to 0, over its anim's `steps` frames (R56): it dies like an ember, not a fade.
 * It holds its heat, then goes (`Sine.easeIn`, the record's `ease.glow`), and flickers once or
 * twice on the way (`flicker.count`): each a quick dip of `flicker.depth` of its heat and back
 * within `flicker.ms`, centred on a frame in `flicker.within` of its dying, the dips kept apart.
 */
function dying(random: () => number): number[] {
  const { steps, ms, flicker } = CARD_ASH.flake.glow;
  const last = steps - 1;
  const frameMs = ms / last;
  const count = Math.min(flicker.count.to, Math.floor(flicker.count.from + random() * (flicker.count.to - flicker.count.from + 1)));
  const from = flicker.within.from * last;
  const span = (flicker.within.to - flicker.within.from) * last;
  // two dips at least a dip's time and a frame apart, so each recovers before the next
  const apart = Math.ceil(flicker.ms / frameMs) + 1;
  const centres: number[] = [];
  for (let n = 0; n < count; n++) {
    const at = Math.round(from + ((n + 0.25 + 0.5 * random()) * span) / count);
    const c = n > 0 ? Math.max(at, centres[n - 1] + apart) : at;
    if (c <= Math.floor(from + span)) centres.push(c);
  }
  return Array.from({ length: steps }, (_, i) => {
    // Sine.easeIn's fall: 1 - (1 - cos(t·π/2))
    const held = Math.cos(((i / last) * Math.PI) / 2);
    const dip = Math.min(1, ...centres.map((c) => 1 - flicker.depth * Math.max(0, 1 - (Math.abs(i - c) * frameMs) / (flicker.ms / 2))));
    return i === last ? 0 : held * dip;
  });
}

/** The sheet's two spark frames: a pixel and its tail, and a two-pixel ember. */
const SPARK_FRAMES = ["s0", "s1"];

/**
 * The flakes' and the sparks' one sheet (R56, R59, R64), drawn at `resolution` canvas px per view
 * px: a row of cells per flake shape, a glowing shape's row holding its `glow.shades` frames, its
 * seam cooling down `tint.seam` to the rim's ash, then a row of sparks, drawn in the hottest of
 * `tint.spark` (each tinted down the ramp as it flies), each a pixel or a pixel and its tail.
 * Every flake pixel is a mix of `tint.core`, `tint.flake`, `tint.rim` and `tint.seam`'s stops; no
 * blend with anything else.
 */
function ashSheet(resolution: number, random: () => number) {
  const f = CARD_ASH.flake;
  const s = CARD_ASH.spark;
  const core = rgb(CARD_ASH.tint.core);
  const body = rgb(CARD_ASH.tint.flake);
  const ash = rgb(CARD_ASH.tint.rim);
  const seam = CARD_ASH.tint.seam.map(rgb);
  const { cools } = f.glow;
  const coolest = cools[cools.length - 1];
  const spark = rgb(CARD_ASH.tint.spark[0]);
  const cell = Math.ceil(f.lengthPx.to * resolution) + 2;
  const { shades } = f.glow;
  // a spark: a pixel with a fainter tail under it, or a two-pixel ember, its corners dimmed
  const px = (v: number) => Math.max(1, Math.round(v * resolution));
  const sparkSizes = [
    { w: px(s.sizePx.from), h: px(s.sizePx.to), tail: px(s.sizePx.from) },
    { w: px(s.sizePx.to), h: px(s.sizePx.to), tail: Infinity },
  ];
  const width = Math.max(shades * cell, sparkSizes.reduce((sum, z) => sum + z.w + 1, 0));
  const height = f.shapes * cell + Math.max(...sparkSizes.map((z) => z.h));
  const data = new Uint8ClampedArray(width * height * 4);
  const frames: SheetFrame[] = [];
  // the glowing shapes spread over the sizes: every one whose share ticks over
  const glows = (k: number) => Math.floor((k + 1) * f.glow.share) > Math.floor(k * f.glow.share);
  const shapes = Array.from({ length: f.shapes }, (_, k) => {
    const glowing = glows(k);
    const pixels = paperShape(k, f.shapes, cell, resolution, random, glowing);
    // its charred paper: the core darkest, lifted toward the body by the edge, blotched, the rim ash
    const paper = pixels.map((p) => {
      const deep = Math.min(1, Math.max(0, (p.depth - 1) / (f.char.depthPx * resolution)));
      const lift = (f.char.edge + (f.char.core - f.char.edge) * deep) * (1 - p.blotch);
      return mix(mix(core, body, lift), ash, p.rim * f.ash.pale);
    });
    const names = Array.from({ length: glowing ? shades : 1 }, (_, j) => {
      const name = `f${k}-${j}`;
      const left = j * cell;
      const top = k * cell;
      // the seam's heat at this shade, from its own down to none: it cools down the ramp, its
      // hottest first, then from its coolest stop to the rim's ash it leaves
      const heat = glowing ? 1 - j / (shades - 1) : 0;
      const fire = ramp(seam, cools, heat);
      const hold = heat >= coolest ? 1 : heat / coolest;
      pixels.forEach((p, n) => {
        const colour = mix(paper[n], fire, p.seam * hold);
        data.set([...colour.map(Math.round), p.alpha], ((top + p.y) * width + left + p.x) * 4);
      });
      frames.push({ name, x: left, y: top, w: cell, h: cell });
      return name;
    });
    // a glowing shape's anim: its dying, each frame the shade nearest its heat
    return glowing ? dying(random).map((heat) => names[Math.round((1 - heat) * (shades - 1))]) : names;
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

/** Phaser 4's `TintModes.FILL`: the tint replaces the frame's colours, its alpha kept. */
const TINT_FILL = 1 as Phaser.TintModes;

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
   * passed by the whole band is gone, each within the band burns from its ink to the fire's
   * hottest at the front, cools down the fire's ramp, then chars to slate; each flake whose pixel has just gone is let go by `release`, and
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

    const fire = CARD_ASH.tint.band.map(rgb);
    const { stops } = band;
    const char = rgb(CARD_ASH.tint.char);
    const deep = fire[fire.length - 1];
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
        // its fire, hottest at the leading edge: from its ink to the ramp's hottest stop, then down
        // the ramp; then its char, from the ramp's last stop
        const x = k / edgeShare;
        const colour =
          k >= edgeShare
            ? mix(deep, char, (k - edgeShare) / (1 - edgeShare))
            : x < stops[0]
              ? mix([src[o], src[o + 1], src[o + 2]], fire[0], x / stops[0])
              : ramp(fire, stops, x);
        out[o] = colour[0];
        out[o + 1] = colour[1];
        out[o + 2] = colour[2];
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
   * The flakes (R56): rising within the spread of their lean, up and to the left, and slowing a little, turning slowly,
   * turning over in depth (the scale across them swinging through zero, edge-on, and back), swaying
   * sideways, and fading. Each takes one shape's anim: still, or a glow dying over 900 ms.
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
      // -90 is straight up and the screen's left is -180: leaning left, back over what has burned
      angle: { onEmit: () => -90 - f.leanLeftDeg + (this.random() * 2 - 1) * f.spreadDeg },
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
   * The sparks (R64): faster than the flakes, within their spread of their lean left of up, slowing a little,
   * drawn additively; each flickers as its light falls (`Quad.easeIn`, the record's `ease.spark`)
   * and is gone within its life, born hottest and cooling down `tint.spark` to red as it goes.
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
    const ramped = CARD_ASH.tint.spark.map(rgb);
    const cooled = (t: number) => {
      const [r, g, b] = ramp(ramped, s.cools, t).map(Math.round);
      return (r << 16) | (g << 8) | b;
    };
    return {
      frame: frames,
      lifespan: { min: s.lifeMs.from, max: s.lifeMs.to },
      speed: { min: s.speed.from, max: s.speed.to },
      angle: { onEmit: () => -90 - s.leanLeftDeg + (this.random() * 2 - 1) * s.spreadDeg },
      accelerationX: { onUpdate: (p: Particle) => -p.velocityX * s.drag },
      accelerationY: { onUpdate: (p: Particle) => -p.velocityY * s.drag },
      scale: 1 / resolution,
      alpha: {
        onEmit: (p?: Particle) => (p ? light(p, 0) : 1),
        onUpdate: (p: Particle, _key: string, t: number) => light(p, t),
      },
      // its colour, cooling as it flies: the tint fills the frame, so the ramp is its colour
      tintMode: TINT_FILL,
      tint: {
        onEmit: () => cooled(0),
        onUpdate: (_p: Particle, _key: string, t: number) => cooled(t),
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
    // a glowing shape's dying, its `glow.steps` frames over `glow.ms`, then held on the last, grey
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
