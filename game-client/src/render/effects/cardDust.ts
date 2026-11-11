/**
 * The arrival card's leaving as dust (FS-PQ2TW §D R24–R36): when the card's hold ends, its heading,
 * rule and subtitle break into motes that rise from the strokes of the letters themselves, scatter
 * every way and a little upward, fast and then slow, sway gently as they slow, darken and fade.
 *
 * The strokes are read from each text's own rendered canvas (a Phaser `Text` draws to a 2D canvas
 * of its own, at its resolution: `Text.canvas`, `Text.context`), and from the rule's line, by the
 * reading the three leaves share (`cardLeaveCore.ts`; its `strokeCells` / `ruleCells` /
 * `seedPoints` are re-exported here, as the smoke and the ash first read them). Never from a box
 * around the text: a failed read plays nothing, and the card fades (R35).
 */

import type Phaser from "phaser";
import { BARROW_HEX } from "@/utils/theme";
import { LeaveCore, seedPoints, seedZone, type CardInk, type LeaveArt, type LeaveOptions } from "./cardLeaveCore";
import type { Easing, FxTexture, Range, Token } from "./table";

export {
  inkPixels,
  ruleCells,
  seedPoints,
  strokeCells,
  type CardInk,
  type InkCell,
  type InkText,
  type RuleLine,
} from "./cardLeaveCore";

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
  speed: { from: 24, to: 96 },
  lean: 0.2,
  // fast out, then slow
  drag: 1.8,
  sway: { amplitude: { from: 2, to: 5 }, periodMs: { from: 700, to: 1200 } },
  // hudText, hudLabel
  tint: { from: "vellum", to: "vellumDark" },
  alpha: { from: 1, to: 0 },
  ease: "Sine.easeIn",
} as const satisfies CardDustRecord;

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
export type DustArt = LeaveArt;

/** The slice of a Phaser scene the dust draws and times with. */
export interface CardDustScene {
  add: Pick<Phaser.GameObjects.GameObjectFactory, "particles">;
  time: Pick<Phaser.Time.Clock, "delayedCall">;
}

export type CardDustOptions = LeaveOptions;

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
  private readonly core: LeaveCore;

  /** `art` is asked at each play: a scene registers its art anew on every start. */
  constructor(
    private readonly scene: CardDustScene,
    private readonly art: () => DustArt | undefined,
    options: CardDustOptions = {},
  ) {
    this.core = new LeaveCore("card dust", options);
  }

  /**
   * Breaks `ink` to dust at `depth`, in place of any dust still in the air, calling `gone` once it
   * has all faded. False when it plays nothing, and the card should fade instead: reduced motion,
   * the sheet missing, or strokes that cannot be read (these two logged once each).
   */
  play(ink: CardInk, depth: number, gone: () => void): boolean {
    this.stop();
    const { core } = this;
    if (core.reducedMotion()) return false;
    const frames = core.sheet(this.art(), CARD_DUST.texture);
    if (!frames) return false;
    const read = core.read(ink);
    if (!read) return false;
    const { cells } = read;

    const d = CARD_DUST;
    const area = cells.reduce((sum, c) => sum + c.w * c.h, 0);
    const points = seedPoints(cells, Math.min(d.maxParticles, Math.ceil(area * d.density)), core.random);
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
          const heading = scatterAngle(core.random(), d.lean);
          (p as Swaying)[SWAY] = swayFor(heading, core.random);
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
      emitZone: seedZone(points),
    };
    // in view px: the emitter at the origin, still with the HUD
    const emitter = this.scene.add.particles(0, 0, frames.texture, config);
    emitter.setScrollFactor(0).setDepth(depth);
    emitter.emitParticle(points.length);
    core.hold(() => emitter.destroy());
    core.endAt(this.scene.time, d.durationMs, gone);
    return true;
  }

  /** Takes the dust away at once. Harmless with none in the air. */
  stop(): void {
    this.core.stop();
  }

  /** Lets go of the dust without touching it: at a scene's end, it went with the scene. */
  forget(): void {
    this.core.forget();
  }
}
