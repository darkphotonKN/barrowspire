/**
 * Auras (FS-1J1CB §E): a quiet loop of particles over one player body, on for as long as that
 * body is drawn alive with the specialization that owns it. It marks what the body became, where
 * a shimmer marks a moment, so it is no shimmer and keeps none of a shimmer's rules (R31). Two:
 *
 * - the Spellwarden's **ward** (R32): the heal shimmer's glints ({@link HEAL_LOOK}'s vellum centre,
 *   re-looked `necrotic`), dimmer and slower, winking on a faint shell round the figure so they
 *   trace a shield;
 * - the Shadow Ranger's **gloom** (R33): the heal's glimmer without its shine: bare `umbra` motes
 *   (no hot centre, no glow, no light, no additive burn) that darken toward their dusk violet,
 *   rising a little off the figure and sinking back as they fade.
 *
 *   const auras = new Auras(scene, art);   // one per world scene
 *   auras.see(id, player);                 // every snapshot: its class and specialization
 *   auras.follow(id, at, anim.crown, now); // every frame: the drawn feet, or null hidden or dead
 *   auras.forget(id);                      // the body is gone
 *   auras.clear();                         // the scene is
 *
 * Built on the shimmer: its glint ({@link buildGlint}, {@link GLINT}), its look, its depth layers
 * ({@link SHIMMER_LAYER}) and crown fallback, the baked `fx_glint` and `fx_mote` (ADR-0020); no
 * new texture. Cheap enough for every body (R34): a pool built once per body the first time it is
 * drawn alive, then wound by the clock it is followed with. No object, tween, timer, closure or
 * light is made after the pool, and nothing is allocated per frame. It casts no light and has no
 * feet glow: it is never handed the light-map, and draws in the world, under it. Tokens only
 * (ADR-0013).
 */

import type Phaser from "phaser";
import type { Wearer } from "@/render/art/specLooks";
import type { ArtLogger } from "@/render/art/library";
// The pure projection modules, not the `@/render/iso` barrel, which loads Phaser.
import { worldToScreenInto, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { specializationOf } from "@/data/specializations";
import { buildGlint, fxImage, GLINT, type GlintLook } from "./glitter";
import type { EffectsScene, FxArt } from "./runtime";
import { HEAL_LOOK, SHIMMER_CROWN_FALLBACK, SHIMMER_LAYER } from "./shimmer";
import type { Token } from "./table";

export type AuraKind = "ward" | "gloom";

/** The specialization each aura belongs to (R31). */
const AURA_OF: Partial<Record<string, AuraKind>> = {
  spellwarden: "ward",
  shadow_ranger: "gloom",
};

/** The aura a body of `who` wears: none but a Spellwarden's and a Shadow Ranger's (R31). */
export function auraOf(who: Wearer): AuraKind | undefined {
  const spec = specializationOf(who.class, who.specialization);
  return spec && AURA_OF[spec];
}

/** The ward's glints: the heal shimmer's, its pale centre kept, its red turned the dark blue-white (R32). */
export const WARD_LOOK: GlintLook = { glint: "necrotic", centre: HEAL_LOOK.centre };

/** The gloom's motes: one dusk colour, no centre (R33). */
export const GLOOM_LOOK: { mote: Token } = { mote: "umbra" };

/** A range sampled uniformly. */
interface Range {
  from: number;
  to: number;
}

/** The ward's numbers (R32, R36). v1, tuned at the contact sheet. */
export const WARD = {
  max: 6,
  /** One glint winks on every so often, while fewer than `max` are alive. */
  gapMs: { from: 400, to: 700 },
  /**
   * A slow wink, far longer than the heal glint's 260 to 360 ms, rising and falling on a sine so it
   * holds a while at its peak: with a wink every 400 to 700 ms some four are lit at once, enough
   * to trace the shell.
   */
  lifeMs: { from: 1800, to: 2600 },
  /** A glint's peak: half the heal glint's, which burns to 1. */
  alpha: 0.5,
  /** The shell's half-width, a little wider than the shoulders (the heal's mid-body scatter is 18). */
  halfWidth: 22,
  /** The shell's foot, at the shins, as a share of the crown, and its top, px over the crown. */
  shins: 0.15,
  overCrown: 6,
  /** A glint drifts up this little off its point on the shell, and turns as the heal glint does. */
  rise: { from: 1, to: 3 },
  /** The share of glints sorted in front of the figure; the rest go behind it. */
  front: 0.5,
  /** Under reduced motion: still glints, evenly round the shell, at a lower alpha. */
  still: { count: 3, alpha: 0.25 },
} as const;

/** The gloom's numbers (R33, R36). v1, tuned at the contact sheet. */
export const GLOOM = {
  max: 8,
  gapMs: { from: 200, to: 340 },
  lifeMs: { from: 1500, to: 2100 },
  /** Never bright: a dusk mote laid over the figure, darkening what it covers toward its violet. */
  alpha: 0.8,
  /**
   * Half-width of the scatter at mid-body; it narrows toward the feet and the head, as the heal's,
   * but wider, so the motes gather on the silhouette's edge and read off it.
   */
  halfWidth: 22,
  /** Height over the feet, as a share of the crown. */
  height: { from: 0.1, to: 0.9 },
  /** How far a mote rises off the figure before it sinks back, px. */
  rise: { from: 4, to: 9 },
  /** It fades in over this first share of its life and out, sinking, over the rest. */
  fadeIn: 0.3,
  /** The baked mote is 12 px: a dusk speck of 14 to 24 px. */
  scale: { from: 1.2, to: 2 },
  front: 0.6,
  still: { count: 4, alpha: 0.3 },
} as const;

/** The baked sheets each aura draws with. */
const SHEETS: Record<AuraKind, readonly string[]> = {
  ward: ["fx_glint", "fx_mote"],
  gloom: ["fx_mote"],
};

/** What a pooled particle is drawn with: a glint's container or a bare mote. */
interface Drawn {
  setAlpha(alpha: number): Drawn;
  setPosition(x: number, y: number): Drawn;
  setScale(scale: number): Drawn;
  setRotation(rotation: number): Drawn;
}

/** One pooled particle and the wink it is on. Rewritten in place: never re-made. */
interface Slot {
  drawn: Drawn;
  live: boolean;
  start: number;
  life: number;
  x: number;
  h: number;
  rise: number;
  turn: number;
  size: number;
}

/** A body's pool: its two layers, its particles, and the clock of its next wink. */
interface Pool {
  front: Phaser.GameObjects.Container;
  behind: Phaser.GameObjects.Container;
  slots: Slot[];
  parts: { destroy(): void }[];
  shown: boolean;
  /** When the next particle may wink on. */
  next: number;
  /** The crown the still particles were last laid out on. */
  crown: number;
  /** The feet's screen point, written each frame. */
  screen: Point;
}

/** One body's aura: its kind, and its pool once it is first drawn alive. */
interface Body {
  kind: AuraKind;
  pool?: Pool;
  /** Its sheets were missing at its first draw: it plays nothing, and is not tried again. */
  failed?: boolean;
}

export interface AuraOptions {
  /** `Math.random` unless a test pins it. */
  random?: () => number;
  /** Whether the player asked for less motion (R36), read once by the scene that makes these. */
  reducedMotion?: boolean;
  logger?: ArtLogger;
}

/** A world scene's auras, one per player body that wears one (R34, R35). */
export class Auras {
  private readonly bodies = new Map<string, Body>();
  private readonly random: () => number;
  private readonly still: boolean;
  private readonly logger: ArtLogger;
  private warned = false;

  constructor(
    private readonly scene: Pick<EffectsScene, "add">,
    private readonly art: FxArt,
    opts: AuraOptions = {},
  ) {
    this.random = opts.random ?? Math.random;
    this.still = opts.reducedMotion ?? false;
    this.logger = opts.logger ?? console;
  }

  /**
   * Body `id`'s entry in this snapshot (R35). A body whose specialization wears an aura gets one,
   * built at its next draw; one whose aura changed or went loses the old one at once.
   */
  see(id: string, who: Wearer): void {
    const kind = auraOf(who);
    const body = this.bodies.get(id);
    if (body?.kind === kind) return;
    if (body) this.forget(id);
    if (kind) this.bodies.set(id, { kind });
  }

  /**
   * Each frame (R35): body `id`'s aura at its drawn feet `at`, sized to its sheet's `crown`, wound
   * to `now`. `null` while the body is not drawn alive (hidden by fog, a blackout or the interest
   * cut, in its death clip, dead): the aura hides and winks nothing until it is drawn alive again.
   */
  follow(id: string, at: Point | null, crown: number | undefined, now: number): void {
    const body = this.bodies.get(id);
    if (!body || body.failed) return;
    if (!at) {
      if (body.pool) this.hide(body.pool);
      return;
    }
    const pool = body.pool ?? (body.pool = this.build(body));
    if (!pool) return;
    const top = crown ?? SHIMMER_CROWN_FALLBACK;

    worldToScreenInto(at.x, at.y, pool.screen);
    pool.front.setPosition(pool.screen.x, pool.screen.y).setDepth(worldDepth(at.x, at.y, SHIMMER_LAYER.front));
    pool.behind.setPosition(pool.screen.x, pool.screen.y).setDepth(worldDepth(at.x, at.y, SHIMMER_LAYER.behind));
    if (!pool.shown) {
      pool.shown = true;
      pool.front.setVisible(true);
      pool.behind.setVisible(true);
      // a random point in the first gap, so a crowd of Spellwardens does not wink in unison
      pool.next = now + this.random() * this.rand(this.numbers(body.kind).gapMs);
    }

    if (this.still) {
      if (pool.crown !== top) this.layStill(body.kind, pool, top);
      return;
    }
    if (now >= pool.next) {
      this.wink(body.kind, pool, top, now);
      pool.next = now + this.rand(this.numbers(body.kind).gapMs);
    }
    for (const slot of pool.slots) if (slot.live) this.wind(body.kind, slot, now);
  }

  /** Body `id` is gone from the world (R34): its aura's objects go with it. */
  forget(id: string): void {
    const body = this.bodies.get(id);
    if (!body) return;
    this.bodies.delete(id);
    for (const p of body.pool?.parts ?? []) p.destroy();
  }

  /** The scene is torn down: every aura goes. */
  clear(): void {
    for (const id of [...this.bodies.keys()]) this.forget(id);
  }

  /** How many of body `id`'s particles are winking now: never over its aura's cap. */
  alive(id: string): number {
    const pool = this.bodies.get(id)?.pool;
    if (!pool || !pool.shown) return 0;
    if (this.still) return pool.slots.length;
    let n = 0;
    for (const slot of pool.slots) if (slot.live) n++;
    return n;
  }

  private numbers(kind: AuraKind): typeof WARD | typeof GLOOM {
    return kind === "ward" ? WARD : GLOOM;
  }

  /**
   * The body's pool, made once (R34): two layers about the figure and every particle it will ever
   * wink, or under reduced motion only its still few (R36). Hidden until placed. A missing sheet
   * builds nothing, logged once (FS-KYPQ9 §B.10).
   */
  private build(body: Body): Pool | undefined {
    const missing = SHEETS[body.kind].filter((s) => !this.art.has(s));
    if (missing.length > 0) {
      body.failed = true;
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          `aura: ${missing.map((s) => `"${s}"`).join(", ")} missing; the ${body.kind} plays nothing`,
          { sheets: missing },
        );
      }
      return undefined;
    }
    const n = this.numbers(body.kind);
    const front = this.scene.add.container(0, 0).setVisible(false);
    const behind = this.scene.add.container(0, 0).setVisible(false);
    const pool: Pool = {
      front,
      behind,
      slots: [],
      parts: [],
      shown: false,
      next: 0,
      crown: Number.NaN,
      screen: { x: 0, y: 0 },
    };
    const count = this.still ? n.still.count : n.max;
    for (let i = 0; i < count; i++) {
      // the layers alternate by the aura's front share, fixed per particle so none is re-parented
      const layer = (i + 0.5) / count < n.front ? front : behind;
      pool.slots.push(this.particle(body.kind, layer, pool.parts));
    }
    pool.parts.push(front, behind);
    return pool;
  }

  /** One pooled particle in `layer`, unlit: a ward's glint, or a gloom's bare mote. */
  private particle(kind: AuraKind, layer: Phaser.GameObjects.Container, parts: { destroy(): void }[]): Slot {
    let drawn: Drawn;
    if (kind === "ward") {
      const glint = buildGlint(this.scene, this.art, layer, WARD_LOOK);
      parts.push(...glint.parts);
      drawn = glint.glint;
    } else {
      // the heal's glimmer without its shine (R33): a bare dusk mote, no hot centre, no glow, no
      // light, and no additive burn, so it darkens toward its violet and is never bright
      const mote = fxImage(this.scene, this.art, "fx_mote", GLOOM_LOOK.mote).setAlpha(0);
      layer.add(mote);
      parts.push(mote);
      drawn = mote;
    }
    return { drawn, live: false, start: 0, life: 1, x: 0, h: 0, rise: 0, turn: 0, size: 1 };
  }

  /** One free particle winks on, on its aura's shape; none free, none does. */
  private wink(kind: AuraKind, pool: Pool, crown: number, now: number): void {
    const free = this.free(pool);
    if (!free) return;
    free.live = true;
    free.start = now;
    free.turn = (this.random() * 2 - 1) * GLINT.turn;
    if (kind === "ward") {
      const w = WARD;
      const angle = this.random() * 2 * Math.PI;
      this.onShell(free, crown, angle);
      free.life = this.rand(w.lifeMs);
      free.rise = this.rand(w.rise);
      free.size = this.rand(GLINT.size);
    } else {
      const g = GLOOM;
      free.h = crown * this.rand(g.height);
      const half = g.halfWidth * (1 - Math.abs(free.h / crown - 0.55) * 0.6);
      free.x = (this.random() * 2 - 1) * half;
      free.life = this.rand(g.lifeMs);
      free.rise = this.rand(g.rise);
      free.size = this.rand(g.scale);
    }
    this.wind(kind, free, now);
  }

  /** A free particle, from a random place in the pool so the layers share the winks. */
  private free(pool: Pool): Slot | undefined {
    const n = pool.slots.length;
    const from = Math.floor(this.random() * n);
    for (let i = 0; i < n; i++) {
      const slot = pool.slots[(from + i) % n];
      if (!slot.live) return slot;
    }
    return undefined;
  }

  /** A slot's point on the ward's shell: the ellipse from the shins to just over the crown (R32). */
  private onShell(slot: Slot, crown: number, angle: number): void {
    const bottom = crown * WARD.shins;
    const top = crown + WARD.overCrown;
    slot.x = Math.cos(angle) * WARD.halfWidth;
    slot.h = (top + bottom) / 2 + (Math.sin(angle) * (top - bottom)) / 2;
  }

  /** A live particle wound to `now`: winking, or once its life is out, back in the pool. */
  private wind(kind: AuraKind, slot: Slot, now: number): void {
    const t = (now - slot.start) / slot.life;
    if (t >= 1) {
      slot.live = false;
      slot.drawn.setAlpha(0);
      return;
    }
    if (kind === "ward") {
      // the heal glint's motion (`drawGlint`) wound slower: a sine wink that holds at its peak,
      // a small rise and turn, and a scale that only grows (FS-KYPQ9 §B.4)
      slot.drawn
        .setAlpha(WARD.alpha * Math.sin(Math.PI * t))
        .setPosition(slot.x, -slot.h - slot.rise * t)
        .setRotation(slot.turn * t)
        .setScale(slot.size * (GLINT.growFrom + (1 - GLINT.growFrom) * t));
    } else {
      const g = GLOOM;
      const fade = t < g.fadeIn ? t / g.fadeIn : (1 - t) / (1 - g.fadeIn);
      slot.drawn
        .setAlpha(g.alpha * fade)
        .setPosition(slot.x, -slot.h - slot.rise * Math.sin(Math.PI * t))
        .setScale(slot.size);
    }
  }

  /** Reduced motion (R36): the still few, evenly laid on the aura's shape, at a lower alpha. */
  private layStill(kind: AuraKind, pool: Pool, crown: number): void {
    pool.crown = crown;
    const n = pool.slots.length;
    pool.slots.forEach((slot, i) => {
      if (kind === "ward") {
        // one over the crown and the rest evenly round the shell from it
        this.onShell(slot, crown, Math.PI / 2 + (i * 2 * Math.PI) / n);
        slot.drawn
          .setAlpha(WARD.still.alpha)
          .setPosition(slot.x, -slot.h)
          .setRotation(0)
          .setScale(GLINT.size.from);
      } else {
        const g = GLOOM;
        const share = g.height.from + ((g.height.to - g.height.from) * (i + 0.5)) / n;
        slot.drawn
          .setAlpha(g.still.alpha)
          .setPosition((i % 2 === 0 ? -1 : 1) * g.halfWidth * 0.6, -crown * share)
          .setScale(g.scale.from);
      }
    });
  }

  /** Hidden or dead (R35): the layers go, and every wink with them. */
  private hide(pool: Pool): void {
    if (!pool.shown) return;
    pool.shown = false;
    pool.front.setVisible(false);
    pool.behind.setVisible(false);
    if (this.still) return;
    for (const slot of pool.slots) {
      if (!slot.live) continue;
      slot.live = false;
      slot.drawn.setAlpha(0);
    }
  }

  private rand(r: Range): number {
    return r.from + (r.to - r.from) * this.random();
  }
}
