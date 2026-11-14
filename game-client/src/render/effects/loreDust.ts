/**
 * A lore line's dust (FS-XWHZP §A R6, §B R9): while a line holds, a few fine motes rise slowly off
 * it and fade, a trail, never a burst (FS-KYPQ9 §B.6: at most one mote per 80 ms here, 40 alive);
 * and as a dread line starts, one low emission of at most 12 ember motes from its foot, slowing
 * as they go. View-space, with the HUD: not an `EFFECTS` entry, it has no world position.
 *
 * Under reduced motion it plays nothing, and without the `fx_dust` sheet it plays nothing and says
 * so once: the line still shows (R7).
 */

import type Phaser from "phaser";
import { prefersReducedMotion } from "./mist";
import type { LeaveArt } from "./cardLeaveCore";
import type { ArtLogger } from "@/render/art/library";

/** The dust's numbers (FS-XWHZP R6, R9); a retune is an edit here. */
export const LORE_DUST = {
  texture: "fx_dust",
  /** The trail off a holding line. */
  trail: {
    /** One mote per this many ms, at most (§B.6's trail cap is one per 40 ms). */
    frequencyMs: 80,
    maxAlive: 40,
    lifespanMs: 1600,
    /** View px/s, straight up give or take `spreadDeg`. */
    speed: { from: 6, to: 18 },
    spreadDeg: 25,
    /** About 1 view px of `fx_dust`. */
    scale: 0.12,
    alpha: { from: 0.55, to: 0 },
  },
  /** A dread line's embers. */
  burst: {
    /** §B.6's one-shot cap. */
    count: 12,
    lifespanMs: 900,
    speed: { from: 10, to: 40 },
    /** How far above the sideways each mote leans, at most, in degrees: low, mostly sideways. */
    upDeg: 30,
    /** How fast an ember slows, per second. */
    drag: 2,
    scale: 0.16,
    alpha: { from: 0.9, to: 0 },
  },
  ease: "Sine.easeIn",
} as const;

/** Where the line stands, in view px: the box its motes rise from. */
export interface LoreArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A mote's colour over its life, as two `palette` values. */
export interface LoreTint {
  from: number;
  to: number;
}

/** The slice of a Phaser scene the dust draws and times with. */
export interface LoreDustScene {
  add: Pick<Phaser.GameObjects.GameObjectFactory, "particles">;
  time: Pick<Phaser.Time.Clock, "delayedCall">;
}

export interface LoreDustOptions {
  reducedMotion?: () => boolean;
  logger?: Pick<ArtLogger, "warn">;
  random?: () => number;
}

type Emitter = Phaser.GameObjects.Particles.ParticleEmitter;
type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

/** An emit zone handing out points at random in `area`, or along its foot when `foot` is set. */
function areaZone(area: LoreArea, random: () => number, foot = false) {
  return {
    type: "random" as const,
    source: {
      getRandomPoint: (p: Phaser.Types.Math.Vector2Like) => {
        p.x = area.x + random() * area.width;
        p.y = foot ? area.y + area.height : area.y + random() * area.height;
      },
    },
  };
}

/**
 * The dust off one lore line at a time.
 *
 *   const dust = new LoreDust(scene, () => art);
 *   dust.start(area, tint, depth); // a line holds: motes rise off it
 *   dust.burst(area, depth);       // a dread line starts: its embers
 *   dust.move(area);               // the line moved: new motes rise from its new place
 *   dust.stop();                   // the line fades: no new motes, those in the air finish
 *   dust.forget();                 // the scene ended and took it
 */
export class LoreDust {
  private readonly reducedMotion: () => boolean;
  private readonly logger: Pick<ArtLogger, "warn">;
  private readonly random: () => number;
  private warned = false;
  /** The trail emitting now, if any. */
  private trail?: Emitter;
  /** The box the trail's motes rise from, read at each mote: `move` shifts it. */
  private trailArea?: LoreArea;
  /** Every emitter still in the air, with its end; taken by `clear`, let go by `forget`. */
  private live = new Map<Emitter, { remove(dispatchCallback?: boolean): unknown }>();

  /** `art` is asked at each play: a scene registers its art anew on every start. */
  constructor(
    private readonly scene: LoreDustScene,
    private readonly art: () => LeaveArt | undefined,
    options: LoreDustOptions = {},
  ) {
    this.reducedMotion = options.reducedMotion ?? (() => prefersReducedMotion());
    this.logger = options.logger ?? console;
    this.random = options.random ?? Math.random;
  }

  /**
   * Motes rising off `area` until `stop`, in `tint`, at `depth`, in place of any trail still
   * emitting. False when it plays nothing: reduced motion, or the sheet missing (logged once).
   */
  start(area: LoreArea, tint: LoreTint, depth: number): boolean {
    this.stop();
    const sheet = this.sheet();
    if (!sheet) return false;
    const t = LORE_DUST.trail;
    const at = { ...area };
    const config: EmitterConfig = {
      frame: sheet.frames,
      frequency: t.frequencyMs,
      quantity: 1,
      maxAliveParticles: t.maxAlive,
      lifespan: t.lifespanMs,
      speed: { min: t.speed.from, max: t.speed.to },
      angle: { min: -90 - t.spreadDeg, max: -90 + t.spreadDeg },
      scale: t.scale,
      alpha: { start: t.alpha.from, end: t.alpha.to, ease: LORE_DUST.ease },
      color: [tint.from, tint.to],
      colorEase: LORE_DUST.ease,
      emitZone: areaZone(at, this.random),
    };
    this.trail = this.emitter(sheet.texture, config, depth);
    this.trailArea = at;
    return true;
  }

  /**
   * The line moved to `area`: the trail's new motes rise from there, those in the air keep their
   * course. Harmless with none emitting.
   */
  move(area: LoreArea): void {
    if (this.trailArea) Object.assign(this.trailArea, area);
  }

  /**
   * A dread line's embers off the foot of `area`, once: at most 12, low and mostly sideways,
   * slowing as they go (R9). False when it plays nothing.
   */
  burst(area: LoreArea, tint: LoreTint, depth: number): boolean {
    const sheet = this.sheet();
    if (!sheet) return false;
    const b = LORE_DUST.burst;
    const slow = (key: "velocityX" | "velocityY") => ({
      onUpdate: (p: Phaser.GameObjects.Particles.Particle) => -p[key] * b.drag,
    });
    const config: EmitterConfig = {
      frame: sheet.frames,
      lifespan: b.lifespanMs,
      speed: { min: b.speed.from, max: b.speed.to },
      // left or right, leaned up by at most `upDeg`: screen degrees, 0 east, −90 up
      angle: {
        onEmit: () => {
          const lean = this.random() * b.upDeg;
          return this.random() < 0.5 ? -lean : -180 + lean;
        },
      },
      accelerationX: slow("velocityX"),
      accelerationY: slow("velocityY"),
      scale: b.scale,
      alpha: { start: b.alpha.from, end: b.alpha.to, ease: LORE_DUST.ease },
      color: [tint.from, tint.to],
      colorEase: LORE_DUST.ease,
      maxParticles: b.count,
      emitting: false,
      emitZone: areaZone(area, this.random, true),
    };
    const embers = this.emitter(sheet.texture, config, depth);
    embers.emitParticle(b.count);
    this.endAfter(embers, b.lifespanMs);
    return true;
  }

  /** No new motes; those in the air finish their life, then go. Harmless with none emitting. */
  stop(): void {
    const trail = this.trail;
    if (!trail) return;
    this.trail = undefined;
    this.trailArea = undefined;
    trail.stop();
    this.endAfter(trail, LORE_DUST.trail.lifespanMs);
  }

  /** Every mote gone at once: a run's reset, a floor change. */
  clear(): void {
    this.trail = undefined;
    this.trailArea = undefined;
    for (const [emitter, end] of this.live) {
      end.remove(false);
      emitter.destroy();
    }
    this.live.clear();
  }

  /** Lets go of the dust without touching it: at a scene's end, it went with the scene. */
  forget(): void {
    this.trail = undefined;
    this.trailArea = undefined;
    this.live.clear();
  }

  private emitter(texture: string, config: EmitterConfig, depth: number): Emitter {
    // in view px: the emitter at the origin, still with the HUD
    const emitter = this.scene.add.particles(0, 0, texture, config);
    emitter.setScrollFactor(0).setDepth(depth);
    this.live.set(emitter, { remove: () => undefined });
    return emitter;
  }

  /** `emitter` goes once `ms` have passed. */
  private endAfter(emitter: Emitter, ms: number): void {
    const end = this.scene.time.delayedCall(ms, () => {
      this.live.delete(emitter);
      emitter.destroy();
    });
    this.live.set(emitter, end);
  }

  /** The sheet's texture and its variants' frames; none under reduced motion or without it. */
  private sheet(): { texture: string; frames: string[] } | undefined {
    if (this.reducedMotion()) return undefined;
    const art = this.art();
    const texture = LORE_DUST.texture;
    const variants = art?.has(texture) ? [0, 1, 2].map((index) => art.resolve(texture, { index })) : [];
    const [first] = variants;
    if (!first || first.placeholder) {
      if (!this.warned) this.logger.warn(`lore dust: "${texture}" missing; the line shows without dust`);
      this.warned = true;
      return undefined;
    }
    const frames = variants.flatMap((v) => (v.placeholder || v.texture !== first.texture ? [] : [v.frame]));
    return { texture: first.texture, frames: [...new Set(frames)] };
  }
}
