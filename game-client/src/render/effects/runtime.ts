/**
 * The effects runtime (FS-KYPQ9 §B.8–§B.10): plays a table entry over the baked `fx_*` sheets at
 * a world position, and owns everything it makes until the effect ends.
 *
 *   const fx = new EffectsRuntime(scene, art, lightMap);
 *   fx.play(String(entityId), "fireballTrail", pos, { direction: velocity }).moveTo(next);
 *   fx.release(String(entityId)); // the projectile left state
 *   fx.clearAll();                // resetRun, scene SHUTDOWN
 *
 * World positions in, drawn through the projection and sorted by footprint like a prop (§B.8,
 * §0.9). Every sprite, emitter, tween, timer and light handle is tracked under its owner key (a
 * projectile `entity_id`, a rival id, `"self"`, `"hub"`) and destroyed when a one-shot's duration
 * ends, on `release(owner)`, and on `clearAll()` (§B.9). A released stream marked `"fade"` stops
 * emitting and is destroyed once its last particles have lived out their life, so a trail does
 * not pop at an impact; it stays tracked until then, and `clearAll()` or
 * `release(owner, { now: true })` cuts it at once.
 *
 * A missing sheet plays nothing and is logged once per sheet. It never falls back to drawn
 * circles (§B.10).
 *
 * Phaser is reached only through the narrow {@link EffectsScene}, so the runtime is tested
 * without a canvas. Per-effect modules sit beside this file and import it directly: there is
 * no barrel.
 */

import type Phaser from "phaser";
import type { ArtLogger, ResolvedFrame } from "@/render/art/library";
import type { TransientLight, TransientSpec } from "@/render/lighting/LightMap";
// The pure projection modules, not the `@/render/iso` barrel, which loads Phaser.
import {
  PLANE_TRANSFORM,
  worldToScreen,
  type Point,
} from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import {
  EFFECTS,
  type EffectEntry,
  type EffectName,
  type Easing,
  type FxTexture,
  type LightChannel,
  type ParticleChannel,
  type ParticleLook,
  type SpriteChannel,
  type Token,
} from "./table";

/** Who an effect belongs to: a projectile `entity_id`, a rival id, `"self"`, `"hub"`. */
export type OwnerKey = string;

interface Destroyable {
  destroy(): void;
}

/**
 * The slice of a Phaser scene the runtime draws with: Phaser's own signatures, picked down to
 * the three factories, the tween manager's `add` and the clock's `delayedCall`.
 */
export interface EffectsScene {
  add: Pick<
    Phaser.GameObjects.GameObjectFactory,
    "image" | "container" | "particles"
  >;
  tweens: Pick<Phaser.Tweens.TweenManager, "add">;
  time: Pick<Phaser.Time.Clock, "delayedCall">;
}

/** What the runtime needs from the art library: whether a sheet is there, and its frame. */
export interface FxArt {
  has(name: string): boolean;
  resolve(name: string): ResolvedFrame;
}

/** What the runtime needs from the light-map. */
export interface EffectLights {
  addTransient(spec: TransientSpec, lifetimeMs?: number): TransientLight;
}

export interface PlayOptions {
  /** Screen radians for an upright sprite; world radians for one on the ground. */
  rotation?: number;
  /** World vector the effect travels along; particle angles are taken behind it. */
  direction?: Point;
  /** Screen px above the ground (chest height for a projectile's trail). */
  lift?: number;
  /** Sub-layer within the footprint's depth, as for `standAt`. */
  layer?: number;
}

/** A playing effect. Streams and loops follow their owner through it until stopped. */
export interface Played {
  /**
   * Moves its sprite, its light and a stream's emission point. Particles already emitted stay
   * where they were fired, and a one-shot's particles never move.
   */
  moveTo(at: Point): void;
  /** Ends it as a release does: a fading stream burns out, everything else goes at once. */
  stop(): void;
}

export interface ReleaseOptions {
  /** Cut fading streams at once too (a reset), rather than let them burn out. */
  now?: boolean;
}

interface Group {
  owner: OwnerKey;
  objects: Destroyable[];
  tweens: { stop(): unknown }[];
  timer?: { remove(dispatchCallback?: boolean): void };
  light?: TransientLight;
  /** A stream that burns out on release: its emitters, and how long its particles live. */
  fade?: { ms: number; emitters: { emitting: boolean }[] };
  done: boolean;
}

const tokens = (keys: readonly Token[]) => keys.map((k) => BARROW_HEX[k]);
const DEG = 180 / Math.PI;

export class EffectsRuntime {
  private readonly owners = new Map<OwnerKey, Set<Group>>();
  private readonly warned = new Set<string>();
  /** Released streams whose last particles are still burning out. */
  private readonly fading = new Set<Group>();

  constructor(
    private readonly scene: EffectsScene,
    private readonly art: FxArt,
    private readonly lights: EffectLights,
    private readonly logger: ArtLogger = console,
  ) {}

  /**
   * Plays an entry at a world position for an owner. Returns null when it draws nothing: a sheet
   * is missing (logged once), or the entry has nothing the runtime draws (`hit` is a tint the hit
   * module applies).
   */
  play(
    owner: OwnerKey,
    name: EffectName,
    at: Point,
    opts: PlayOptions = {},
  ): Played | null {
    const entry: EffectEntry = EFFECTS[name];
    if (!entry.sprite && !entry.particles && !entry.light) return null;
    if (!this.sheetsPresent(entry)) return null;

    const group: Group = { owner, objects: [], tweens: [], done: false };
    const movers: ((at: Point) => void)[] = [];
    if (entry.sprite)
      movers.push(this.sprite(group, entry, entry.sprite, at, opts));
    if (entry.particles)
      movers.push(this.particles(group, entry, entry.particles, at, opts));
    if (entry.light) movers.push(this.light(group, entry, entry.light, at));

    if (entry.timing.kind === "oneShot")
      group.timer = this.scene.time.delayedCall(entry.timing.durationMs, () =>
        this.finish(group, true),
      );

    let set = this.owners.get(owner);
    if (!set) this.owners.set(owner, (set = new Set()));
    set.add(group);

    return {
      moveTo: (to) => {
        if (!group.done) for (const move of movers) move(to);
      },
      stop: () => this.finish(group, false),
    };
  }

  /**
   * Ends everything an owner has playing (a projectile gone, a rival gone). A stream marked
   * `"fade"` stops emitting and lets its particles finish; `now` cuts it, and any of the owner's
   * streams still burning out, at once.
   */
  release(owner: OwnerKey, opts: ReleaseOptions = {}): void {
    const now = opts.now ?? false;
    for (const group of [...(this.owners.get(owner) ?? [])])
      this.finish(group, now);
    if (now)
      for (const group of [...this.fading])
        if (group.owner === owner) this.cut(group);
  }

  /** Ends and destroys everything at once, fading streams too (resetRun, SHUTDOWN/DESTROY). */
  clearAll(): void {
    for (const owner of [...this.owners.keys()])
      this.release(owner, { now: true });
    for (const group of [...this.fading]) this.cut(group);
  }

  /** How many effects are playing, for one owner or in all. A burning-out stream is not. */
  playing(owner?: OwnerKey): number {
    if (owner !== undefined) return this.owners.get(owner)?.size ?? 0;
    let n = 0;
    for (const set of this.owners.values()) n += set.size;
    return n;
  }

  private sheetsPresent(entry: EffectEntry): boolean {
    const sheets: FxTexture[] = [
      ...(entry.sprite ? [entry.sprite.texture] : []),
      ...(entry.particles?.texture ?? []),
    ];
    let ok = true;
    for (const sheet of sheets) {
      if (this.art.has(sheet)) continue;
      ok = false;
      if (!this.warned.has(sheet)) {
        this.warned.add(sheet);
        this.logger.warn(
          `effects: "${sheet}" missing; the effect plays nothing`,
          { sheet },
        );
      }
    }
    return ok;
  }

  private frame(sheet: FxTexture): {
    texture: string;
    frame?: string;
    anchor: Point;
  } {
    const r = this.art.resolve(sheet);
    return r.placeholder
      ? { texture: r.texture, anchor: r.anchor }
      : { texture: r.texture, frame: r.frame, anchor: r.anchor };
  }

  /** One baked sprite: upright at the projected point, or flat on a world plane. */
  private sprite(
    group: Group,
    entry: EffectEntry,
    ch: SpriteChannel,
    at: Point,
    opts: PlayOptions,
  ): (at: Point) => void {
    const { texture, frame, anchor } = this.frame(ch.texture);
    const lift = opts.lift ?? 0;
    const rotation = opts.rotation ?? 0;
    const [trailing, leading = trailing] = tokens(ch.tint);
    const image = this.scene.add
      .image(0, 0, texture, frame)
      .setOrigin(anchor.x, anchor.y)
      .setTint(trailing, leading, trailing, leading)
      .setAlpha(ch.alpha.from)
      .setScale(ch.scale.from)
      .setRotation(rotation);

    // On the ground: the plane pair carries the projection (see `addWorldPlane`), so the image
    // sits at its world position inside it. Upright: the image stands at the projected point.
    let place: (at: Point) => void;
    if (ch.ground) {
      const surface = this.scene.add
        .container(0, 0)
        .setRotation(PLANE_TRANSFORM.rotation);
      const root = this.scene.add
        .container(0, -lift)
        .setScale(PLANE_TRANSFORM.scaleX, PLANE_TRANSFORM.scaleY);
      root.add(surface);
      surface.add(image);
      group.objects.push(image, surface, root);
      place = (p) => {
        image.setPosition(p.x, p.y);
        root.setDepth(worldDepth(p.x, p.y, opts.layer));
      };
    } else {
      group.objects.push(image);
      place = (p) => {
        const s = worldToScreen(p.x, p.y);
        image
          .setPosition(s.x, s.y - lift)
          .setDepth(worldDepth(p.x, p.y, opts.layer));
      };
    }
    place(at);

    const t = entry.timing;
    if (t.kind === "loop") {
      group.tweens.push(
        this.scene.tweens.add({
          targets: image,
          alpha: { from: ch.alpha.from, to: ch.alpha.to },
          duration: t.periodMs / 2,
          ease: entry.ease,
          yoyo: ch.yoyo === "alpha",
          repeat: ch.repeat ?? 0,
        }),
      );
    } else if (t.kind === "oneShot") {
      const sweep = ch.sweep ?? 0;
      group.tweens.push(
        this.scene.tweens.add({
          targets: image,
          alpha: { from: ch.alpha.from, to: ch.alpha.to },
          scale: { from: ch.scale.from, to: ch.scale.to },
          rotation: { from: rotation - sweep / 2, to: rotation + sweep / 2 },
          duration: t.durationMs,
          ease: entry.ease,
        }),
      );
    }
    return place;
  }

  /** Particles: a one-shot's count emitted once, or a stream's one per interval. */
  private particles(
    group: Group,
    entry: EffectEntry,
    ch: ParticleChannel,
    at: Point,
    opts: PlayOptions,
  ): (at: Point) => void {
    // Frames must share one atlas texture to share an emitter; the rest are left out.
    const frames = ch.texture.map((sheet) => ({ sheet, ...this.frame(sheet) }));
    const texture = frames[0].texture;
    const drawn = frames.flatMap((f) =>
      f.texture === texture && f.frame !== undefined
        ? [{ sheet: f.sheet, frame: f.frame }]
        : [],
    );
    const base: ParticleLook = { tint: ch.tint, scale: ch.scale };

    const t = entry.timing;
    const lifespan =
      t.kind === "oneShot" ? t.durationMs : t.kind === "stream" ? t.lifeMs : 0;
    const back = opts.direction ? this.backAngle(opts.direction) : 0;
    const lift = opts.lift ?? 0;
    const config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig = {
      frame: drawn.map((f) => f.frame),
      lifespan,
      speed: { min: ch.speed.from, max: ch.speed.to },
      angle: { min: back + ch.angle.from, max: back + ch.angle.to },
      alpha: { start: ch.alpha.from, end: ch.alpha.to, ease: entry.ease },
      ...(ch.looks
        ? lookPerSheet(
            new Map(drawn.map((f) => [f.frame, ch.looks?.[f.sheet] ?? base])),
            base,
            entry.ease,
          )
        : {
            scale: { start: ch.scale.from, end: ch.scale.to, ease: entry.ease },
            tint: tokens(ch.tint),
          }),
      accelerationX: ch.accel.x,
      accelerationY: ch.accel.y,
      emitting: t.kind === "stream",
      ...(t.kind === "stream"
        ? {
            frequency: t.intervalMs,
            quantity: ch.count,
            maxAliveParticles: t.maxAlive,
          }
        : {}),
      ...(ch.inward ? inwardFrom(ch.inward) : {}),
    };
    const emitter = this.scene.add.particles(0, 0, texture, config);
    group.objects.push(emitter);
    if (t.kind === "stream" && t.onRelease === "fade")
      group.fade = { ms: t.lifeMs, emitters: [emitter] };
    const sortAt = (p: Point) =>
      emitter.setDepth(worldDepth(p.x, p.y, opts.layer));
    const s = worldToScreen(at.x, at.y);

    if (t.kind === "stream") {
      // Particles live in their emitter's space: moving the emitter drags every live particle
      // with it. A stream's emitter stays at the origin and follows a point instead, so each
      // particle fires where its owner is and is then left behind in the world (§E.2, §F.2).
      const source = { x: s.x, y: s.y };
      emitter.startFollow(source, 0, -lift);
      sortAt(at);
      return (p) => {
        const to = worldToScreen(p.x, p.y);
        source.x = to.x;
        source.y = to.y;
        sortAt(p);
      };
    }

    // A one-shot fires once from its point and stays there. Its emitter is placed, never moved,
    // so `inward`'s draw-in to the emitter's origin lands on the point.
    emitter.setPosition(s.x, s.y - lift);
    sortAt(at);
    emitter.emitParticle(ch.count);
    return () => {};
  }

  /** A short-lived pool at the point: a one-shot's fades out over its duration. */
  private light(
    group: Group,
    entry: EffectEntry,
    ch: LightChannel,
    at: Point,
  ): (at: Point) => void {
    const s = worldToScreen(at.x, at.y);
    const t = entry.timing;
    // No lifetime for the light-map to count: this runtime removes the light in `finish`, on
    // the same timer that ends the tween and sprites. One owner per light (LightMap.addTransient).
    const light = this.lights.addTransient({
      x: s.x,
      y: s.y,
      radius: ch.radius,
      color: BARROW_HEX[ch.color],
      intensity: ch.intensity.from,
    });
    group.light = light;
    if (t.kind === "oneShot" && ch.intensity.to !== ch.intensity.from)
      group.tweens.push(
        this.scene.tweens.add({
          targets: light,
          intensity: { from: ch.intensity.from, to: ch.intensity.to },
          duration: t.durationMs,
          ease: entry.ease,
        }),
      );
    return (p) => {
      const to = worldToScreen(p.x, p.y);
      light.x = to.x;
      light.y = to.y;
    };
  }

  /** Screen degrees pointing back along a world heading. */
  private backAngle(direction: Point): number {
    const h = worldToScreen(direction.x, direction.y);
    return Math.atan2(-h.y, -h.x) * DEG;
  }

  /**
   * Ends a group: its timer, tweens and light go now. Its objects go now too, unless it is a
   * fading stream ended gently: then it stops emitting and is cut once its particles have lived.
   */
  private finish(group: Group, now: boolean): void {
    if (group.done) return;
    group.done = true;
    group.timer?.remove(false);
    for (const tween of group.tweens) tween.stop();
    group.light?.remove();
    const set = this.owners.get(group.owner);
    set?.delete(group);
    if (set?.size === 0) this.owners.delete(group.owner);

    if (now || !group.fade) return this.cut(group);
    for (const emitter of group.fade.emitters) emitter.emitting = false;
    this.fading.add(group);
    group.timer = this.scene.time.delayedCall(group.fade.ms, () =>
      this.cut(group),
    );
  }

  /** Destroys what a group made. Harmless to repeat. */
  private cut(group: Group): void {
    group.timer?.remove(false);
    for (const o of group.objects) o.destroy();
    group.objects.length = 0;
    this.fading.delete(group);
  }
}

/** Particles spawned on a ring `radius` px out and drawn in to the emitter's point. */
function inwardFrom(
  radius: number,
): Pick<
  Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
  "emitZone" | "moveToX" | "moveToY"
> {
  return {
    emitZone: {
      type: "random",
      source: {
        getRandomPoint: (point: Phaser.Types.Math.Vector2Like) => {
          const a = Math.random() * Math.PI * 2;
          point.x = Math.cos(a) * radius;
          point.y = Math.sin(a) * radius;
        },
      },
    },
    moveToX: 0,
    moveToY: 0,
  };
}

type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;

/**
 * Tint and scale chosen per particle by the sheet it was drawn from (Phaser picks a particle's
 * frame before its tint and scale), so one emitter can mix fire and smoke without sharing a look.
 */
function lookPerSheet(
  looks: ReadonlyMap<string, ParticleLook>,
  base: ParticleLook,
  ease: Easing,
): Pick<EmitterConfig, "tint" | "scale"> {
  const lookOf = (p?: Phaser.GameObjects.Particles.Particle) =>
    (p && looks.get(p.frame.name)) || base;
  return {
    tint: {
      onEmit: (p) => {
        const tint = lookOf(p).tint;
        return BARROW_HEX[tint[Math.floor(Math.random() * tint.length)]];
      },
    },
    scale: {
      onEmit: (p) => lookOf(p).scale.from,
      onUpdate: (p, _key, t) => {
        const { from, to } = lookOf(p).scale;
        return from + (to - from) * easeAt(ease, t);
      },
    },
  };
}

/** The allowlisted easings (§B.3) at progress `t`, 0..1, matching Phaser's. */
function easeAt(ease: Easing, t: number): number {
  if (ease === "Linear") return t;
  const [family, form] = ease.split(".") as [string, string];
  if (family === "Sine") {
    if (form === "easeIn") return 1 - Math.cos((t * Math.PI) / 2);
    if (form === "easeOut") return Math.sin((t * Math.PI) / 2);
    return -(Math.cos(Math.PI * t) - 1) / 2;
  }
  const power = family === "Quad" ? 2 : 3;
  if (form === "easeIn") return t ** power;
  if (form === "easeOut") return 1 - (1 - t) ** power;
  return t < 0.5
    ? 2 ** (power - 1) * t ** power
    : 1 - (-2 * t + 2) ** power / 2;
}
