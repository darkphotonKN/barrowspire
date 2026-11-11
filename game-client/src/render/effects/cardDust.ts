/**
 * The arrival card's leaving as dust (FS-PQ2TW §D R24–R36): when the card's hold ends, its heading,
 * rule and subtitle break into motes that rise from the strokes of the letters themselves, scatter
 * every way and a little upward, fast and then slow, sway gently as they slow, darken and fade.
 *
 * The strokes are read from each text's own rendered canvas (a Phaser `Text` draws to a 2D canvas
 * of its own, at its resolution: `Text.canvas`, `Text.context`), and from the rule's line. Never
 * from a box around the text: a failed read plays nothing, and the card fades (R35).
 */

import type Phaser from "phaser";
import type { ArtLogger, FrameQuery, ResolvedFrame } from "@/render/art/library";
import type { Point } from "@/render/iso/projection";
import { BARROW_HEX } from "@/utils/theme";
import { prefersReducedMotion } from "./mist";
import type { Easing, FxTexture, Range, Token } from "./table";

/** The dust's numbers (R34), as the owner tuned them five times on 2026-11-12 (the fifth a trial); a retune is an edit here. */
export interface CardDustRecord {
  /** Every mote's life, and the dust's: one fixed duration (FS-KYPQ9 §B.2; past its 1200 ms, R33). */
  durationMs: number;
  /** Motes for the whole card, at most (R32), past §B.6's 12 (R33). */
  maxParticles: number;
  /** Motes per view px² of ink, under the cap (R32). */
  density: number;
  texture: FxTexture;
  /** A mote's size over its life, × the sheet's frame: 0.15 of `fx_dust` is about 1.2 view px. */
  scale: Range;
  /** View px/s at the start, picked per mote; the top is the cap that keeps it dust (R26). */
  speed: Range;
  /** How far up each mote's random heading is pulled, 0..1 (R26). */
  lean: number;
  /** How fast a mote slows, per second: its speed falls by this share of itself (R26). */
  drag: number;
  /**
   * Each mote's sideways sway off its straight path (R26), picked per mote: how far to either
   * side, in view px, and how long one sway takes. It grows as the mote slows.
   */
  sway: { amplitude: Range; periodMs: Range };
  /** From the heading's colour to the subtitle's, over a mote's life (R28). */
  tint: { from: Token; to: Token };
  alpha: Range;
  /** Of the alpha, the colour and the scale over a mote's life (§B.3 allowlist). */
  ease: Easing;
}

/**
 * The dust (FS-PQ2TW §D). Not an `EFFECTS` entry: it is a view-space HUD effect with no world
 * position, and its count, scatter and length are the one named exception to FS-KYPQ9
 * §B.6 and §B.2's ceiling (R33), so the table's rules hold unchanged for every effect there. Its
 * own rule test is beside it.
 */
export const CARD_DUST = {
  durationMs: 1800,
  // a trial, the owner's fifth tune
  maxParticles: 6000,
  density: 4,
  texture: "fx_dust",
  scale: { from: 0.15, to: 0.15 },
  speed: { from: 30, to: 120 },
  lean: 0.2,
  // fast out, then slow
  drag: 1.8,
  sway: { amplitude: { from: 2, to: 5 }, periodMs: { from: 700, to: 1200 } },
  // hudText, hudLabel
  tint: { from: "vellum", to: "vellumDark" },
  alpha: { from: 1, to: 0 },
  ease: "Sine.easeIn",
} as const satisfies CardDustRecord;

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

/** A piece of ink, a rectangle in view px: one pixel of a text's canvas, or one px of the rule. */
export interface InkCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A canvas pixel this opaque or more is a stroke; below it, the faint edge around one. */
const INK_ALPHA = 128;

/** Every drawn pixel of `texts`, in view px. Reads each canvas once; a failed read throws. */
export function strokeCells(texts: readonly InkText[]): InkCell[] {
  const cells: InkCell[] = [];
  for (const text of texts) {
    const { width, height } = text.canvas;
    const { data } = text.context.getImageData(0, 0, width, height);
    const resolution = text.style.resolution || 1;
    const w = text.scaleX / resolution;
    const h = text.scaleY / resolution;
    const left = text.x - text.displayOriginX * text.scaleX;
    const top = text.y - text.displayOriginY * text.scaleY;
    for (let py = 0; py < height; py++)
      for (let px = 0; px < width; px++)
        if (data[(py * width + px) * 4 + 3] >= INK_ALPHA)
          cells.push({ x: left + px * w, y: top + py * h, w, h });
  }
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

/**
 * A mote's heading in screen degrees (0 east, 90 down): drawn at `u` (0..1) of the full turn, any
 * way at all, inward over the card too, then pulled up by `lean`. Under 1, a mote drawn downward
 * still goes down.
 */
export function scatterAngle(u: number, lean: number): number {
  const rad = u * 2 * Math.PI;
  return (Math.atan2(Math.sin(rad) - lean, Math.cos(rad)) * 180) / Math.PI;
}

/**
 * One mote's sway (R26): its own amplitude, period and phase, across the heading it set out on.
 * The rest is its running state: the offset worked out for life fraction `t`, and the offset
 * already put on its x and on its y.
 */
export interface Sway {
  /** Across the starting heading: a unit vector, in view px. */
  acrossX: number;
  acrossY: number;
  /** View px to either side. */
  amplitude: number;
  /** Radians per second. */
  rate: number;
  phase: number;
  t: number;
  offset: number;
  onX: number;
  onY: number;
}

/** A mote's sway, picked from `CARD_DUST.sway`, across a heading of `headingDeg` (`scatterAngle`'s). */
export function swayFor(headingDeg: number, random: () => number): Sway {
  const { amplitude, periodMs } = CARD_DUST.sway;
  const rad = (headingDeg * Math.PI) / 180;
  const pick = (r: Range) => r.from + random() * (r.to - r.from);
  return {
    acrossX: -Math.sin(rad),
    acrossY: Math.cos(rad),
    amplitude: pick(amplitude),
    rate: (2 * Math.PI * 1000) / pick(periodMs),
    phase: random() * 2 * Math.PI,
    t: 0,
    offset: 0,
    onX: 0,
    onY: 0,
  };
}

/**
 * How far across its heading the mote is swayed at life fraction `t`: a sine, grown by the share of
 * its speed the drag has taken (1 − e^(−drag·s), s seconds in). Nothing as it leaves the letters,
 * the full sway once it has slowed. Worked out once a frame, however many axes ask.
 */
function swayOffset(sway: Sway, t: number): number {
  if (t !== sway.t) {
    const s = (t * CARD_DUST.durationMs) / 1000;
    sway.offset = sway.amplitude * Math.sin(sway.rate * s + sway.phase) * (1 - Math.exp(-CARD_DUST.drag * s));
    sway.t = t;
  }
  return sway.offset;
}

/** A particle carrying its sway, set as it is emitted. */
const SWAY = Symbol("cardDustSway");
type Swaying = { [SWAY]?: Sway };

/** What the dust needs of the art library: whether its sheet is there, and each variant's frame. */
export interface DustArt {
  has(name: string): boolean;
  resolve(name: string, query?: Pick<FrameQuery, "index">): ResolvedFrame;
}

/** What the dust reads: the card's two texts and its rule. */
export interface CardInk {
  texts: readonly InkText[];
  rule: RuleLine;
}

/** The slice of a Phaser scene the dust draws and times with. */
export interface CardDustScene {
  add: Pick<Phaser.GameObjects.GameObjectFactory, "particles">;
  time: Pick<Phaser.Time.Clock, "delayedCall">;
}

export interface CardDustOptions {
  /** Whether the player asked for less motion; read once, as the card starts to leave. */
  reducedMotion?: () => boolean;
  logger?: ArtLogger;
  random?: () => number;
}

type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

/**
 * Plays one card's dust at a time, and owns it until it is gone: its one emitter and its end.
 *
 *   const dust = new CardDust(scene, () => art);
 *   if (!dust.play(ink, depth, gone)) fadeTheCard(); // reduced motion, no sheet, a failed read
 *   dust.stop();   // a new card, a resize: gone at once
 *   dust.forget(); // the scene ended and took it
 */
export class CardDust {
  private emitter?: { destroy(): void };
  private end?: { remove(dispatchCallback?: boolean): void };
  private readonly warned = new Set<string>();
  private readonly reducedMotion: () => boolean;
  private readonly logger: ArtLogger;
  private readonly random: () => number;

  /** `art` is asked at each play: a scene registers its art anew on every start. */
  constructor(
    private readonly scene: CardDustScene,
    private readonly art: () => DustArt | undefined,
    options: CardDustOptions = {},
  ) {
    this.reducedMotion = options.reducedMotion ?? (() => prefersReducedMotion());
    this.logger = options.logger ?? console;
    this.random = options.random ?? Math.random;
  }

  /**
   * Breaks `ink` to dust at `depth`, in place of any dust still in the air, calling `gone` once it
   * has all faded. False when it plays nothing, and the card should fade instead: reduced motion,
   * the sheet missing, or strokes that cannot be read (these two logged once each).
   */
  play(ink: CardInk, depth: number, gone: () => void): boolean {
    this.stop();
    if (this.reducedMotion()) return false;
    const frames = this.frames();
    if (!frames) return false;
    const cells = this.read(ink);
    if (!cells) return false;

    const d = CARD_DUST;
    const area = cells.reduce((sum, c) => sum + c.w * c.h, 0);
    const points = seedPoints(cells, Math.min(d.maxParticles, Math.ceil(area * d.density)), this.random);
    let next = 0;
    const slow = (key: "velocityX" | "velocityY") => ({
      onUpdate: (p: Phaser.GameObjects.Particles.Particle) => -p[key] * d.drag,
    });
    // the engine calls every op's onUpdate for every mote on every frame (Particle.update), so
    // the sway takes the x and y slots it calls anyway: no further call per mote, one sine and
    // one exp a frame, and the drift's speed and heading are left as they are
    const sway = (axis: "onX" | "onY", across: "acrossX" | "acrossY") => ({
      onUpdate: (p: Phaser.GameObjects.Particles.Particle, _key: string, t: number, value: number) => {
        const s = (p as Swaying)[SWAY];
        if (!s) return value;
        const offset = swayOffset(s, t);
        const moved = s[across] * (offset - s[axis]);
        s[axis] = offset;
        return value + moved;
      },
    });
    const config: EmitterConfig = {
      frame: frames.frames,
      lifespan: d.durationMs,
      speed: { min: d.speed.from, max: d.speed.to },
      angle: {
        onEmit: (p) => {
          if (!p) return -90;
          const heading = scatterAngle(this.random(), d.lean);
          (p as Swaying)[SWAY] = swayFor(heading, this.random);
          return heading;
        },
      },
      // a drag: each mote slows by a share of its own speed, and never turns back
      accelerationX: slow("velocityX"),
      accelerationY: slow("velocityY"),
      // and sways across its path as it slows (R26)
      x: sway("onX", "acrossX"),
      y: sway("onY", "acrossY"),
      scale: { start: d.scale.from, end: d.scale.to, ease: d.ease },
      alpha: { start: d.alpha.from, end: d.alpha.to, ease: d.ease },
      color: [BARROW_HEX[d.tint.from], BARROW_HEX[d.tint.to]],
      colorEase: d.ease,
      maxParticles: d.maxParticles,
      emitting: false,
      emitZone: {
        type: "random",
        source: {
          getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => {
            const at = points[next++ % points.length];
            p.x = at.x;
            p.y = at.y;
          },
        },
      },
    };
    // in view px: the emitter at the origin, still with the HUD
    const emitter = this.scene.add.particles(0, 0, frames.texture, config);
    emitter.setScrollFactor(0).setDepth(depth);
    emitter.emitParticle(points.length);
    this.emitter = emitter;
    this.end = this.scene.time.delayedCall(d.durationMs, () => {
      this.stop();
      gone();
    });
    return true;
  }

  /** Takes the dust away at once. Harmless with none in the air. */
  stop(): void {
    this.end?.remove(false);
    this.emitter?.destroy();
    this.forget();
  }

  /** Lets go of the dust without touching it: at a scene's end, it went with the scene. */
  forget(): void {
    this.end = undefined;
    this.emitter = undefined;
  }

  /** The sheet's texture and its variants, or undefined when the sheet is not there. */
  private frames(): { texture: string; frames: string[] } | undefined {
    const art = this.art();
    const variants = art?.has(CARD_DUST.texture)
      ? [0, 1, 2].map((index) => art.resolve(CARD_DUST.texture, { index }))
      : [];
    const [first] = variants;
    if (!first || first.placeholder) {
      this.warn("sheet", `card dust: "${CARD_DUST.texture}" missing; the card fades`);
      return undefined;
    }
    const frames = variants.flatMap((v) => (v.placeholder || v.texture !== first.texture ? [] : [v.frame]));
    return { texture: first.texture, frames: [...new Set(frames)] };
  }

  /** The strokes and the rule, or undefined when the texts cannot be read or drew nothing. */
  private read(ink: CardInk): InkCell[] | undefined {
    let strokes: InkCell[];
    try {
      strokes = strokeCells(ink.texts);
    } catch (error) {
      this.warn("read", "card dust: the card's strokes could not be read; the card fades", { error });
      return undefined;
    }
    if (strokes.length === 0) {
      this.warn("read", "card dust: the card's texts drew no ink; the card fades");
      return undefined;
    }
    return [...strokes, ...ruleCells(ink.rule)];
  }

  private warn(what: string, message: string, context?: Record<string, unknown>): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    this.logger.warn(message, context);
  }
}
