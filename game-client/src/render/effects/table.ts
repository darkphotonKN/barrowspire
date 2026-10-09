/**
 * The effects table (FS-KYPQ9 §B.1, §B.2, §B.7): one typed entry per world effect. It holds the
 * duration, easing, colour tokens, particle counts and scale range of each effect, so "no silly
 * animations" is a vitest (`table.test.ts`) and not a matter of taste.
 *
 * FS-fixed: later slices read this table and never edit it. A value found wrong against the FS
 * is flagged, not patched, so slices running in parallel do not collide.
 *
 * `runtime.ts` plays an entry's `sprite`, `particles` and `light`. `tint` is not drawable on its
 * own: the hit module applies it to the struck character.
 *
 * Baked cursor textures are not entries (§B.7 exempts them).
 */

import type { BARROW_HEX } from "@/utils/theme";

/** A colour, always a `BARROW` key (ADR-0013). */
export type Token = keyof typeof BARROW_HEX;

/** The baked fx sheets (§B.10), by manifest name. */
export type FxTexture =
  | "fx_slash"
  | "fx_dust"
  | "fx_ember"
  | "fx_fire_core"
  | "fx_smoke"
  | "fx_scorch"
  | "fx_glow"
  | "fx_escape_column"
  | "fx_arrow";

/** §B.3: Linear, Sine, Quad and Cubic only. No Bounce, Elastic or Back. */
export type Easing =
  | "Linear"
  | `${"Sine" | "Quad" | "Cubic"}.${"easeIn" | "easeOut" | "easeInOut"}`;

export interface Range {
  from: number;
  to: number;
}

/**
 * - `oneShot` plays once for `durationMs`, then everything it made is destroyed.
 * - `stream` emits one particle per `intervalMs`, each living `lifeMs`, until its owner is
 *   released (a projectile's trail, a chimney's smoke). On release it either stops emitting and
 *   lets the particles already out finish their life (`"fade"`), or goes at once with what it
 *   follows (`"cut"`). A reset or scene shutdown cuts every stream either way.
 * - `loop` repeats every `periodMs` until released (the entrance marker's breath).
 */
export type Timing =
  | { kind: "oneShot"; durationMs: number }
  | {
      kind: "stream";
      lifeMs: number;
      intervalMs: number;
      maxAlive?: number;
      onRelease: "fade" | "cut";
    }
  | { kind: "loop"; periodMs: number };

/** One baked sprite laid at the effect's point. */
export interface SpriteChannel {
  texture: FxTexture;
  /** One token, or two shaded from the trailing side to the leading side. */
  tint: readonly Token[];
  /** Uniform scale over the effect: only ever grows, and ends at ≤ 1.6 (§B.4). */
  scale: Range;
  alpha: Range;
  /** Lies flat on the isometric ground (a world plane) rather than standing upright. */
  ground?: boolean;
  /** Radians the sprite turns through over the effect, centred on the play rotation. */
  sweep?: number;
  /** §B.4: alpha only, and only on the entrance marker. */
  yoyo?: "alpha";
  /** -1 loops forever. Only with an alpha `yoyo`. */
  repeat?: number;
}

/** How one sheet's particles are drawn: their tints and their scale over their life. */
export interface ParticleLook {
  tint: readonly Token[];
  scale: Range;
}

/** Particles: a one-shot's `count` at once, or a stream's one per interval. */
export interface ParticleChannel {
  /** Particles pick among these frames. They must share an atlas, or only the first is used. */
  texture: readonly FxTexture[];
  /** Each particle takes one of these, picked at random. Never cycled (§B.7). */
  tint: readonly Token[];
  /** One-shot: particles emitted, at most 12 (§B.6). Streams emit 1 per interval. */
  count: number;
  scale: Range;
  alpha: Range;
  /** Screen px/s. */
  speed: Range;
  /**
   * Screen degrees (0 is east, 90 is down). With a play `direction`, relative to the reverse of
   * the projected heading, so a trail streams out behind what it follows.
   */
  angle: Range;
  /** Screen px/s²: gravity for falling debris, a fixed wind for smoke. */
  accel: { x: number; y: number };
  /** Spawned on a ring this many px out and drawn in to the point (the fireball's gather). */
  inward?: number;
  /**
   * A sheet's own look, when one emitter mixes sheets that must not share one: fire and smoke
   * (§B.4, §B.7). Each particle takes the look of the sheet it was drawn from, so smoke never
   * comes out ember and embers never grow. Sheets not listed take the channel's `tint`/`scale`.
   */
  looks?: Partial<Record<FxTexture, ParticleLook>>;
}

/** A short-lived pool on the light-map (§C). No flame halo. */
export interface LightChannel {
  color: Token;
  /** Pool radius, screen px. */
  radius: number;
  /** Over a one-shot's duration; a stream's light holds `from` while it lives. */
  intensity: Range;
}

/** A partial multiply tint on a drawn character (§G.1). */
export interface TintChannel {
  color: Token;
  /** How far toward `color` at the peak, 0..1. */
  peak: number;
}

export interface EffectEntry {
  timing: Timing;
  ease: Easing;
  sprite?: SpriteChannel;
  particles?: ParticleChannel;
  light?: LightChannel;
  tint?: TintChannel;
}

const still: Range = { from: 1, to: 1 };
const noAccel = { x: 0, y: 0 };

export const EFFECTS = {
  // ── Warrior (§D) ────────────────────────────────────────────────────────
  /**
   * A heavy steel smear swept across the ground toward the target, dust at the feet. Pale
   * enough to read under the dark of the barrow: dull steel inside, a vellum cutting lip.
   */
  slash: {
    timing: { kind: "oneShot", durationMs: 220 },
    ease: "Quad.easeOut",
    sprite: {
      texture: "fx_slash",
      tint: ["vellumDark", "vellum"],
      scale: still,
      alpha: { from: 1, to: 0 },
      ground: true,
      sweep: 1.1,
    },
    particles: {
      texture: ["fx_dust"],
      tint: ["vellumDark"],
      count: 4,
      scale: { from: 1.1, to: 1.4 },
      alpha: { from: 0.65, to: 0 },
      speed: { from: 4, to: 14 },
      angle: { from: 200, to: 340 },
      accel: { x: 0, y: 60 },
    },
  },
  /**
   * A low dust burst behind the charge that spreads a little and settles. Pale dust, so it
   * reads on the brown ground; it holds most of its life (`Sine.easeIn`) and then fades.
   */
  chargeDust: {
    timing: { kind: "oneShot", durationMs: 450 },
    ease: "Sine.easeIn",
    particles: {
      texture: ["fx_dust"],
      tint: ["vellumDark", "vellumFaint"],
      count: 8,
      scale: { from: 1.2, to: 1.6 },
      alpha: { from: 0.85, to: 0 },
      speed: { from: 10, to: 34 },
      angle: { from: -40, to: 40 },
      accel: { x: 0, y: 24 },
    },
  },
  /**
   * Faint dust kicked up at the warrior's feet for as long as the server carries the charge
   * (a stream that follows the drawn body). Each mote barely drifts back along the heading and
   * is left where the feet were, so the dust lies along the path actually run, then settles.
   */
  chargeTrail: {
    timing: {
      kind: "stream",
      lifeMs: 350,
      intervalMs: 40,
      maxAlive: 10,
      onRelease: "fade",
    },
    ease: "Sine.easeIn",
    particles: {
      texture: ["fx_dust"],
      tint: ["vellumDark", "vellumFaint"],
      count: 1,
      scale: { from: 1.1, to: 1.4 },
      alpha: { from: 0.65, to: 0 },
      speed: { from: 6, to: 30 },
      angle: { from: -18, to: 18 },
      accel: noAccel,
    },
  },

  // ── Sorcerer (§E) ───────────────────────────────────────────────────────
  /** Embers drawn in toward the casting hand. */
  fireballCast: {
    timing: { kind: "oneShot", durationMs: 160 },
    ease: "Quad.easeIn",
    particles: {
      texture: ["fx_ember"],
      tint: ["ember", "amberBright"],
      count: 5,
      scale: still,
      alpha: { from: 0.4, to: 1 },
      speed: { from: 0, to: 0 },
      angle: { from: 0, to: 360 },
      accel: noAccel,
      inward: 14,
    },
  },
  /** The light at the caster for the cast. */
  castLight: {
    timing: { kind: "oneShot", durationMs: 200 },
    ease: "Quad.easeOut",
    light: { color: "ember", radius: 110, intensity: { from: 0.7, to: 0 } },
  },
  /** A brief flare at the fireball's last position. */
  impactFlare: {
    timing: { kind: "oneShot", durationMs: 120 },
    ease: "Quad.easeOut",
    sprite: {
      texture: "fx_glow",
      tint: ["ember", "amberBright"],
      scale: still,
      alpha: { from: 0.9, to: 0 },
    },
  },
  /** The fireball's light jumps up on impact, then decays. */
  lightDecay: {
    timing: { kind: "oneShot", durationMs: 500 },
    ease: "Cubic.easeOut",
    light: { color: "ember", radius: 170, intensity: { from: 1, to: 0 } },
  },
  /** Embers that fall under gravity and fade. Debris falls; it never sprays (§B.6). */
  fallingEmbers: {
    timing: { kind: "oneShot", durationMs: 600 },
    ease: "Quad.easeIn",
    particles: {
      texture: ["fx_ember"],
      tint: ["ember", "amberBright"],
      count: 8,
      scale: still,
      alpha: { from: 1, to: 0 },
      speed: { from: 10, to: 30 },
      angle: { from: 245, to: 295 },
      accel: { x: 0, y: 260 },
    },
  },
  /** A scorch smudge on the ground that fades. */
  scorch: {
    timing: { kind: "oneShot", durationMs: 1200 },
    ease: "Sine.easeIn",
    sprite: {
      texture: "fx_scorch",
      tint: ["pitch", "barrowDeep"],
      scale: still,
      alpha: { from: 0.9, to: 0 },
      ground: true,
    },
  },
  /**
   * Embers and smoke streaming behind the core, and the light that rides on it. Embers burn
   * steady in fire colours; the smoke is dark and disperses. At impact the trail stops and its
   * last embers burn out over their life rather than vanishing with the core.
   */
  fireballTrail: {
    timing: { kind: "stream", lifeMs: 300, intervalMs: 40, onRelease: "fade" },
    ease: "Sine.easeOut",
    particles: {
      texture: ["fx_ember", "fx_smoke"],
      tint: ["ember", "amberBright"],
      count: 1,
      scale: still,
      alpha: { from: 0.8, to: 0 },
      speed: { from: 10, to: 24 },
      angle: { from: -12, to: 12 },
      accel: noAccel,
      looks: {
        fx_smoke: { tint: ["barrowDeep"], scale: { from: 1, to: 1.4 } },
      },
    },
    light: { color: "ember", radius: 140, intensity: { from: 0.7, to: 0.7 } },
  },

  // ── Archer (§F) ─────────────────────────────────────────────────────────
  /** A faint string-snap shimmer at the bow, with a few fibre motes. */
  arrowRelease: {
    timing: { kind: "oneShot", durationMs: 140 },
    ease: "Quad.easeOut",
    sprite: {
      texture: "fx_glow",
      tint: ["vellumDark"],
      scale: still,
      alpha: { from: 0.4, to: 0 },
    },
    particles: {
      texture: ["fx_dust"],
      tint: ["vellumDark", "vellum"],
      count: 3,
      scale: { from: 1.1, to: 1.3 },
      alpha: { from: 0.8, to: 0 },
      speed: { from: 6, to: 16 },
      angle: { from: -30, to: 30 },
      accel: noAccel,
    },
  },
  /**
   * Pale air-streak motes behind the arrowhead that go through with the arrow and die with it.
   * No light. Subtle, but clear at 1× over the dark ground: two per interval, at most 12 alive,
   * holding their alpha most of their life (`Sine.easeIn`) and drifting back at spread speeds,
   * so they string into a line rather than dots. The baked arrow carries a hairline streak of
   * its own behind the nock.
   */
  arrowTrail: {
    // dies with the arrow (§F.2)
    timing: {
      kind: "stream",
      lifeMs: 180,
      intervalMs: 40,
      maxAlive: 12,
      onRelease: "cut",
    },
    ease: "Sine.easeIn",
    particles: {
      texture: ["fx_dust"],
      tint: ["vellumDark", "vellum"],
      count: 2,
      scale: { from: 1.3, to: 1.5 },
      alpha: { from: 0.55, to: 0 },
      speed: { from: 20, to: 200 },
      angle: { from: -6, to: 6 },
      accel: noAccel,
    },
  },
  /** A dull puff of dust and splinters that drops to the ground. */
  arrowImpact: {
    timing: { kind: "oneShot", durationMs: 300 },
    ease: "Quad.easeIn",
    particles: {
      texture: ["fx_dust"],
      tint: ["barrowBrown", "vellumDark"],
      count: 6,
      scale: still,
      alpha: { from: 0.8, to: 0 },
      speed: { from: 8, to: 22 },
      angle: { from: 240, to: 300 },
      accel: { x: 0, y: 220 },
    },
  },

  // ── Hit, death, escape (§G) ─────────────────────────────────────────────
  /** Part of the way toward oxblood, easing back to untinted. Applied by the hit module. */
  hit: {
    timing: { kind: "oneShot", durationMs: 220 },
    ease: "Quad.easeOut",
    tint: { color: "oxblood", peak: 0.5 },
  },
  /**
   * A low dust settle at a fallen body's feet, pale so it reads on the brown ground, holding
   * most of its life (`Sine.easeIn`) before it fades.
   */
  deathDust: {
    timing: { kind: "oneShot", durationMs: 600 },
    ease: "Sine.easeIn",
    particles: {
      texture: ["fx_dust"],
      tint: ["vellumDark", "vellumFaint"],
      count: 6,
      scale: { from: 1.2, to: 1.6 },
      alpha: { from: 0.85, to: 0 },
      speed: { from: 8, to: 22 },
      angle: { from: 160, to: 380 },
      accel: { x: 0, y: 30 },
    },
  },
  /** A quiet column of pale light with slow rising motes: gone, not triumph. */
  escape: {
    timing: { kind: "oneShot", durationMs: 1000 },
    ease: "Sine.easeOut",
    sprite: {
      texture: "fx_escape_column",
      tint: ["vellum", "vellumFaint"],
      scale: still,
      alpha: { from: 0.8, to: 0 },
    },
    particles: {
      texture: ["fx_dust"],
      tint: ["vellumFaint"],
      count: 10,
      scale: still,
      alpha: { from: 0.6, to: 0 },
      speed: { from: 6, to: 14 },
      angle: { from: 260, to: 280 },
      accel: { x: 0, y: -12 },
    },
    light: { color: "vellum", radius: 150, intensity: { from: 0.6, to: 0 } },
  },

  // ── World indicators (§H) ───────────────────────────────────────────────
  /** A soft amber ground glow that breathes slowly and shallowly. Amber: the delver can act. */
  entranceBreath: {
    timing: { kind: "loop", periodMs: 2400 },
    ease: "Sine.easeInOut",
    sprite: {
      texture: "fx_glow",
      tint: ["amber"],
      scale: still,
      alpha: { from: 0.55, to: 0.85 },
      ground: true,
      yoyo: "alpha",
      repeat: -1,
    },
  },

  // ── Hub (§A.6) ──────────────────────────────────────────────────────────
  /** Soft grey puffs drifting on one fixed wind, at most 10 alive per chimney. */
  chimneySmoke: {
    timing: {
      kind: "stream",
      lifeMs: 4000,
      intervalMs: 400,
      maxAlive: 10,
      onRelease: "fade",
    },
    ease: "Sine.easeOut",
    particles: {
      texture: ["fx_smoke"],
      tint: ["slate", "vellumFaint"],
      count: 1,
      scale: { from: 1, to: 1.6 },
      alpha: { from: 0.35, to: 0 },
      speed: { from: 6, to: 10 },
      angle: { from: 265, to: 275 },
      accel: { x: 3, y: -4 },
    },
  },
} as const satisfies Record<string, EffectEntry>;

export type EffectName = keyof typeof EFFECTS;
