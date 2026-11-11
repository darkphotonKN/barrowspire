/**
 * What the arrival card's three leaves do alike (FS-PQ2TW §D R35, §Change: Smoke R50, §Change: Ash
 * R60): their options' defaults, a warning logged once per reason, the art sheet the dust and the
 * smoke draw from, the card's ink read once (each text's own canvas, never a box around it) with the
 * fade to fall back to, the emit zone that hands out their start points, and what each holds until
 * its end, a stop or the scene's end. Nothing of a leave's look is here: that stays in its module
 * (`cardDust.ts`, `cardSmoke.ts`, `cardAsh.ts`).
 *
 *   const core = new LeaveCore("card dust", options);
 *   const read = core.read(ink);              // undefined: logged once, the card fades
 *   core.hold(() => emitter.destroy());
 *   core.endAt(scene.time, ms, gone);         // everything held taken away, then `gone`
 *   core.stop();                              // a new card, a resize: gone at once
 *   core.forget();                            // the scene ended and took it
 */

import type Phaser from "phaser";
import type { ArtLogger, FrameQuery, ResolvedFrame } from "@/render/art/library";
import type { Point } from "@/render/iso/projection";
import { prefersReducedMotion } from "./mist";

/** What of a text its strokes are read from. A Phaser `Text` is one. */
export interface InkText {
  canvas: { width: number; height: number };
  context: Pick<CanvasRenderingContext2D, "getImageData">;
  /** Canvas px per view px: the text is rasterised at the render scale (FS-ZAJMH R5). */
  style: { resolution: number };
  x: number;
  y: number;
  /** The text's origin, in view px from its canvas' top left. */
  displayOriginX: number;
  displayOriginY: number;
  scaleX: number;
  scaleY: number;
}

/** The card's rule: a line across, in view px. */
export interface RuleLine {
  x1: number;
  x2: number;
  y: number;
}

/** What a leave reads: the card's two texts and its rule. */
export interface CardInk {
  texts: readonly InkText[];
  rule: RuleLine;
}

/** A piece of ink, a rectangle in view px: one pixel of a text's canvas, or one px of the rule. */
export interface InkCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A canvas pixel this opaque or more is a stroke; below it, the faint edge around one. */
const INK_ALPHA = 128;

/** Each text's canvas pixels (RGBA), each canvas read once. A failed read throws. */
export function inkPixels(texts: readonly InkText[]): Uint8ClampedArray[] {
  return texts.map((text) => text.context.getImageData(0, 0, text.canvas.width, text.canvas.height).data);
}

/**
 * Every drawn pixel of `texts`, in view px, from their `pixels` (read here, once a canvas, when not
 * handed in). A failed read throws.
 */
export function strokeCells(texts: readonly InkText[], pixels: readonly Uint8ClampedArray[] = inkPixels(texts)): InkCell[] {
  const cells: InkCell[] = [];
  texts.forEach((text, n) => {
    const { width, height } = text.canvas;
    const data = pixels[n];
    const resolution = text.style.resolution || 1;
    const w = text.scaleX / resolution;
    const h = text.scaleY / resolution;
    const left = text.x - text.displayOriginX * text.scaleX;
    const top = text.y - text.displayOriginY * text.scaleY;
    for (let py = 0; py < height; py++)
      for (let px = 0; px < width; px++)
        if (data[(py * width + px) * 4 + 3] >= INK_ALPHA)
          cells.push({ x: left + px * w, y: top + py * h, w, h });
  });
  return cells;
}

/** The rule's ink: one view px of line per px across, centred on its `y`. */
export function ruleCells(rule: RuleLine): InkCell[] {
  const cells: InkCell[] = [];
  for (let x = rule.x1; x < rule.x2; x++)
    cells.push({ x, y: rule.y - 0.5, w: Math.min(1, rule.x2 - x), h: 1 });
  return cells;
}

/**
 * `count` start points over `cells`, each cell picked in proportion to its area, so the motes
 * spread over the strokes as their ink does, and each point lands inside its cell. No cells, no
 * points.
 */
export function seedPoints(cells: readonly InkCell[], count: number, random: () => number): Point[] {
  if (cells.length === 0) return [];
  const upTo = new Float64Array(cells.length);
  let total = 0;
  cells.forEach((c, i) => (upTo[i] = total += c.w * c.h));
  const points: Point[] = [];
  for (let n = 0; n < count; n++) {
    const cell = cells[firstAbove(upTo, random() * total)];
    points.push({ x: cell.x + random() * cell.w, y: cell.y + random() * cell.h });
  }
  return points;
}

/** The first index whose running total is above `v`. */
function firstAbove(upTo: Float64Array, v: number): number {
  let lo = 0;
  let hi = upTo.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (upTo[mid] > v) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

export interface LeaveOptions {
  /** Whether the player asked for less motion; read once, as the card starts to leave. */
  reducedMotion?: () => boolean;
  logger?: ArtLogger;
  random?: () => number;
}

/** What a leave needs of the art library: whether its sheet is there, and each variant's frame. */
export interface LeaveArt {
  has(name: string): boolean;
  resolve(name: string, query?: Pick<FrameQuery, "index">): ResolvedFrame;
}

/** A sheet's texture and its variants' frames. */
export interface LeaveSheet {
  texture: string;
  frames: string[];
}

/** The card's ink: its strokes and its rule's line, and each text's pixels as they were read. */
export interface ReadInk {
  cells: InkCell[];
  pixels: Uint8ClampedArray[];
}

/** An emit zone handing out `points` in turn, from the first again once all are out. */
export function seedZone(points: readonly Point[]) {
  let next = 0;
  return {
    type: "random" as const,
    source: {
      getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => {
        const at = points[next++ % points.length];
        p.x = at.x;
        p.y = at.y;
      },
    },
  };
}

/** What a leave's end is timed by: a Phaser scene's clock is one. */
export interface LeaveClock {
  delayedCall(delay: number, callback: () => void): { remove(dispatchCallback?: boolean): unknown };
}

export class LeaveCore {
  readonly reducedMotion: () => boolean;
  readonly random: () => number;
  private readonly logger: ArtLogger;
  private readonly warned = new Set<string>();
  private held: (() => void)[] = [];

  /** `name` heads every line it logs ("card dust", "card smoke", "card ash"). */
  constructor(
    private readonly name: string,
    options: LeaveOptions = {},
  ) {
    this.reducedMotion = options.reducedMotion ?? (() => prefersReducedMotion());
    this.logger = options.logger ?? console;
    this.random = options.random ?? Math.random;
  }

  /** Logs `message` once per `what`, under the leave's name. */
  warn(what: string, message: string, context?: Record<string, unknown>): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    this.logger.warn(`${this.name}: ${message}`, context);
  }

  /** `texture`'s sheet and its three variants' frames, or undefined, logged once, when it is not there. */
  sheet(art: LeaveArt | undefined, texture: string): LeaveSheet | undefined {
    const variants = art?.has(texture) ? [0, 1, 2].map((index) => art.resolve(texture, { index })) : [];
    const [first] = variants;
    if (!first || first.placeholder) {
      this.warn("sheet", `"${texture}" missing; the card fades`);
      return undefined;
    }
    const frames = variants.flatMap((v) => (v.placeholder || v.texture !== first.texture ? [] : [v.frame]));
    return { texture: first.texture, frames: [...new Set(frames)] };
  }

  /**
   * The card's strokes and its rule, each text's canvas read once (its pixels handed back, for a
   * leave that draws from them); undefined, logged once, when the texts cannot be read or drew
   * nothing (R35): never a box around them.
   */
  read(ink: CardInk): ReadInk | undefined {
    let pixels: Uint8ClampedArray[];
    let strokes: InkCell[];
    try {
      pixels = inkPixels(ink.texts);
      strokes = strokeCells(ink.texts, pixels);
    } catch (error) {
      this.warn("read", "the card's strokes could not be read; the card fades", { error });
      return undefined;
    }
    if (strokes.length === 0) {
      this.warn("read", "the card's texts drew no ink; the card fades");
      return undefined;
    }
    return { cells: [...strokes, ...ruleCells(ink.rule)], pixels };
  }

  /** Holds `take` until the leave ends, is stopped, or its scene ends. */
  hold(take: () => void): void {
    this.held.push(take);
  }

  /** At `ms`, everything held is taken away, then `gone` is told. */
  endAt(time: LeaveClock, ms: number, gone: () => void): void {
    const end = time.delayedCall(ms, () => {
      this.stop();
      gone();
    });
    this.hold(() => end.remove(false));
  }

  /** Takes everything held away at once, in the order it was held. Harmless with nothing held. */
  stop(): void {
    const held = this.held;
    this.held = [];
    held.forEach((take) => take());
  }

  /** Lets go of everything held without touching it: at a scene's end, it went with the scene. */
  forget(): void {
    this.held = [];
  }
}
