/**
 * Shimmers (FS-KZC92): a one-shot glitter over one character's body, played the moment an effect
 * lands on them. It marks the moment and holds no state about the effect.
 *
 * A concrete shimmer is a **base** (the motion) plus a **look** (three `BARROW` tokens). The
 * **granted** base, for effects no player is the source of (a potion, a scroll, a shrine), is 16
 * glints winking over the body, a soft glow at the feet and one short-lived light, all gone by
 * {@link SHIMMER_GRANTED_MS}. It never tints the body: the hit's flash tints the figure oxblood,
 * and a heal that did too would read as damage (R10). The **invoked** base, for effects a player
 * is the source of (an ally's buff, a charge-up), is two strands of motes winding up the body
 * over a ring opening at the feet, breaking into glints at the head, all gone by
 * {@link SHIMMER_INVOKED_MS}. Nothing in the game plays it yet (R19).
 *
 *   const shimmers = new ShimmerFx(scene, art, lightMap);
 *   shimmers.playGranted(HEAL_LOOK, animator.crown); // a potion drunk
 *   shimmers.playInvoked(look, animator.crown);      // a player's own magic (no consumer yet)
 *   shimmers.follow(playerPos);                     // each frame, the figure's drawn feet
 *   shimmers.forget();                              // resetRun
 *
 * Drawn and tracked here on the `ParryFx` pattern, not as effects-table entries: the table can't
 * scatter staggered glints over a body (R20). Every object and light it makes is tracked until
 * its shimmer ends, and `forget()` takes them all down. The textures are the baked `fx_glint`,
 * `fx_mote`, `fx_glow` and `fx_ring` (ADR-0020); nothing is drawn at runtime, and a missing sheet plays
 * nothing, logged once (FS-KYPQ9 §B.10). Tokens only (ADR-0013); no scale ever shrinks and no
 * scale tween yoyos (FS-KYPQ9 §B.4).
 */

import type Phaser from "phaser";
import type { ArtLogger } from "@/render/art/library";
import type { TransientLight } from "@/render/lighting/LightMap";
// The pure projection modules, not the `@/render/iso` barrel, which loads Phaser.
import {
  PLANE_TRANSFORM,
  worldToScreen,
  type Point,
} from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { BARROW_HEX } from "@/utils/theme";
import { drawGlint, fxImage, GLINT, type GlintDraw } from "./glitter";
import type { EffectLights, EffectsScene, FxArt } from "./runtime";
import type { Token } from "./table";

/**
 * A shimmer's three colours (R3): the glint's body, its hot core, and the light it casts and
 * pools at the feet. No other colour appears in a shimmer.
 */
export interface Look {
  glint: Token;
  centre: Token;
  light: Token;
}

/** Health came back, in the health bar's own red (R4; guideline "Restoring a resource"). */
export const HEAL_LOOK: Look = {
  glint: "oxbloodText",
  centre: "vellum",
  light: "oxblood",
};

/** Every object and the light of a granted shimmer are gone by now (R12; FS-KYPQ9 §B.2's 1200). */
export const SHIMMER_GRANTED_MS = 1150;

/** Every object and the light of an invoked shimmer are gone by now (R18; FS-KYPQ9 §B.2's cap). */
export const SHIMMER_INVOKED_MS = 1200;

/** The figure's head height when its sheet records no `crown` (R6). */
export const SHIMMER_CROWN_FALLBACK = 76;

/** The granted base's numbers (R5–R11), from the approved prototype `sparkle`. */
const GRANTED = {
  glints: 16,
  /** The glints' start times spread evenly over this window, each jittered by `jitterMs`. */
  windowMs: 760,
  jitterMs: 30,
  /** Height over the feet, as a share of the crown. */
  height: { from: 0.05, to: 1.05 },
  /** Half-width of the scatter at mid-body; it narrows toward the feet and the head. */
  halfWidth: 18,
  /** The share of glints that sort in front of the figure; the rest go behind it. */
  front: 0.7,
  lifeMs: { from: 260, to: 360 },
  /** The feet glow: total rise and fall, peak alpha, and its size on the ground. */
  glowMs: 840,
  glowAlpha: 0.7,
  glowScale: 0.7,
  light: { radius: 110, intensity: 0.7, fadeMs: 900 },
} as const;

/** The invoked base's numbers (R13–R17), from the approved prototype `spiral`. */
const INVOKED = {
  strands: 2,
  motes: 7,
  /** A strand's lead climbs from the feet to the head in this long; mote `k` lags it `k × lagMs`. */
  climbMs: 820,
  lagMs: 45,
  /** Turns over the climb: `phase + t × turns`, the strands half a turn apart. */
  turns: 3.2 * Math.PI,
  /** Radius at the feet, narrowing by `narrow` of it at the head. */
  radius: 20,
  narrow: 0.45,
  /** Px over the crown the strands top out at. */
  overCrown: 4,
  /** The ellipse of a circle seen in isometric view: y is `sin × radius × squash`. */
  squash: 0.5,
  /** A mote behind the figure shows at this alpha; in front, at full. */
  behindAlpha: 0.55,
  /** A mote fades in over this first share of its climb and out over this last share. */
  fadeIn: 0.1,
  fadeOut: 0.2,
  /** The lead mote's scale, and the trail's: `trail.from − trail.step × k`. Fixed (FS-KYPQ9 §B.4). */
  lead: 0.75,
  trail: { from: 0.6, step: 0.06 },
  /** The ground ring: its scale opening, its alpha falling, over `ringMs`. */
  ringMs: 700,
  ringScale: { from: 0.35, to: 0.75 },
  ringAlpha: 0.8,
  /** The head glints: glint `i` starts at `headStartMs + i × headStepMs` (R16). */
  headGlints: 6,
  headStartMs: 740,
  headStepMs: 35,
  headLifeMs: { from: 220, to: 280 },
  /** Their scatter about the head: ±`headHalfWidth` px in x, and under / over the crown. */
  headHalfWidth: 14,
  headUnder: 6,
  headOver: 10,
  light: { radius: 120, intensity: 0.7, fadeMs: 1120 },
} as const;

/**
 * Depth sub-layers about the figure (`standAt(…, 1)`, its legs at 2): in front just over it, as
 * the parry's guard is; behind and on the ground just under it (R24).
 */
const LAYER = { behind: 0, ground: 0, front: 3 } as const;

/** The baked sheets each base draws with. */
const GRANTED_SHEETS = ["fx_glint", "fx_mote", "fx_glow"] as const;
const INVOKED_SHEETS = ["fx_glint", "fx_mote", "fx_ring"] as const;

/** A range sampled uniformly. */
interface Range {
  from: number;
  to: number;
}

/** What a shimmer made: destroyed when it ends. */
interface Part {
  destroy(): void;
}

/** A top-level object: kept hidden until the shimmer is first placed. */
interface Root {
  setVisible(visible: boolean): unknown;
}

/** A placed object: moved to the figure's feet each frame. */
interface Layer extends Part, Root {
  setPosition(x: number, y: number): unknown;
  setDepth(depth: number): unknown;
}

/** One shimmer playing, and everything it made. */
interface Live {
  parts: Part[];
  /** What it made that no other of its objects holds: shown once it is first placed. */
  roots: Root[];
  tweens: { stop(): unknown }[];
  timer?: { remove(dispatchCallback?: boolean): void };
  light: TransientLight;
  lift: number;
  /** Puts it at the figure's feet: its layers, its ground decal, its light and anything else. */
  place(at: Point): void;
}

/** A soft decal laid on the ground at the feet, under the figure (R8, R15). */
interface Decal {
  image: Phaser.GameObjects.Image;
  /** The plane's root: the one thing to sort. */
  root: Phaser.GameObjects.Container;
}

export interface ShimmerOptions {
  /** The scatter's randomness (R28); `Math.random` unless a test pins it. */
  random?: () => number;
  logger?: ArtLogger;
}

/** One figure's shimmers: made once per run, followed every frame, forgotten with the run. */
export class ShimmerFx {
  private readonly live = new Set<Live>();
  private readonly random: () => number;
  private readonly logger: ArtLogger;
  private warned = false;
  /** The figure's feet, as last followed; undefined until the first follow. */
  private at?: Point;

  constructor(
    private readonly scene: EffectsScene,
    private readonly art: FxArt,
    private readonly lights: EffectLights,
    opts: ShimmerOptions = {},
  ) {
    this.random = opts.random ?? Math.random;
    this.logger = opts.logger ?? console;
  }

  /** How many shimmers are playing. */
  get playing(): number {
    return this.live.size;
  }

  /**
   * Plays the granted base in a look over the figure (R5–R12). `crown` is the figure's sheet
   * `crown`; without one it falls back to {@link SHIMMER_CROWN_FALLBACK}. A shimmer already
   * playing carries on beside it (R25).
   */
  playGranted(look: Look, crown: number = SHIMMER_CROWN_FALLBACK): void {
    if (!this.sheetsPresent(GRANTED_SHEETS)) return;
    const g = GRANTED;
    const live = this.begin(look, g.light, crown);

    // The feet glow, first so it sorts under the behind glints at the same depth (R8).
    const glow = this.decal(live, "fx_glow", look.light);
    glow.image.setAlpha(0).setScale(g.glowScale);
    live.tweens.push(
      this.scene.tweens.add({
        targets: glow.image,
        alpha: { from: 0, to: g.glowAlpha },
        duration: g.glowMs / 2,
        yoyo: true,
        ease: "Sine.easeInOut",
      }),
    );

    const front = this.scene.add.container(0, 0);
    const behind = this.scene.add.container(0, 0);
    live.parts.push(front, behind);

    for (let i = 0; i < g.glints; i++) {
      const jitter = (this.random() * 2 - 1) * g.jitterMs;
      const start = Math.max(0, (i / g.glints) * g.windowMs + jitter);
      // Height first: the scatter is widest at mid-body and narrows at the feet and head (R6).
      const h = crown * this.rand(g.height);
      const half = g.halfWidth * (1 - Math.abs(h / crown - 0.55) * 0.6);
      const x = (this.random() * 2 - 1) * half;
      const layer = this.random() < g.front ? front : behind;
      this.glint(live, layer, look, {
        x,
        h,
        start,
        life: this.rand(g.lifeMs),
        rise: this.rand(GLINT.rise),
        turn: (this.random() * 2 - 1) * GLINT.turn,
        size: this.rand(GLINT.size),
      });
    }

    this.finish(live, SHIMMER_GRANTED_MS, { front, behind }, glow);
  }

  /**
   * Plays the invoked base in a look over the figure (R13–R18): two strands of seven motes
   * winding up the body, a ring opening at the feet, six glints breaking at the head and one
   * short-lived light. `crown` as for {@link playGranted}. A shimmer already playing carries on
   * beside it (R25). Nothing in the game plays it yet (R19).
   */
  playInvoked(look: Look, crown: number = SHIMMER_CROWN_FALLBACK): void {
    if (!this.sheetsPresent(INVOKED_SHEETS)) return;
    const v = INVOKED;
    const live = this.begin(look, v.light, crown);

    // The ground ring, first so it sorts under the behind motes at the same depth (R15).
    const ring = this.decal(live, "fx_ring", look.glint);
    ring.image.setAlpha(v.ringAlpha).setScale(v.ringScale.from);
    live.tweens.push(
      this.scene.tweens.add({
        targets: ring.image,
        scale: { from: v.ringScale.from, to: v.ringScale.to },
        duration: v.ringMs,
        ease: "Sine.easeOut",
      }),
      this.scene.tweens.add({
        targets: ring.image,
        alpha: { from: v.ringAlpha, to: 0 },
        duration: v.ringMs,
        ease: "Quad.easeIn",
      }),
    );

    // The strands (R13, R14). Each mote stands on its own, so it can pass in front of the
    // figure and behind it as it winds round: the side is its depth, set each frame.
    const motes: {
      image: Phaser.GameObjects.Image;
      x: number;
      y: number;
      front: boolean;
    }[] = [];
    let feet: { x: number; y: number; front: number; behind: number } | undefined;
    const stand = (m: (typeof motes)[number]) => {
      if (!feet) return;
      m.image.setPosition(feet.x + m.x, feet.y + m.y);
      m.image.setDepth(m.front ? feet.front : feet.behind);
    };
    const top = crown + v.overCrown;

    for (let s = 0; s < v.strands; s++) {
      const phase = (s * 2 * Math.PI) / v.strands; // half a turn apart
      for (let k = 0; k < v.motes; k++) {
        const image = this.image("fx_mote", k === 0 ? look.centre : look.glint)
          .setBlendMode("ADD")
          .setAlpha(0)
          .setScale(k === 0 ? v.lead : v.trail.from - v.trail.step * k);
        live.parts.push(image);
        live.roots.push(image);
        const mote = { image, x: 0, y: 0, front: false };
        motes.push(mote);
        const climb = { t: 0 };
        live.tweens.push(
          this.scene.tweens.add({
            targets: climb,
            t: { from: 0, to: 1 },
            delay: k * v.lagMs,
            duration: v.climbMs,
            ease: "Sine.easeInOut",
            onUpdate: () => {
              const { t } = climb;
              const angle = phase + t * v.turns;
              const radius = v.radius * (1 - v.narrow * t);
              const side = Math.sin(angle);
              mote.x = Math.cos(angle) * radius;
              mote.y = -t * top + side * radius * v.squash;
              mote.front = side > 0;
              const fade = Math.min(
                1,
                t / v.fadeIn,
                Math.max(0, 1 - t) / v.fadeOut,
              );
              image.setAlpha((mote.front ? 1 : v.behindAlpha) * fade);
              stand(mote);
            },
          }),
        );
      }
    }

    // The head glints, breaking as the strands arrive (R16), in front of the figure.
    const head = this.scene.add.container(0, 0);
    live.parts.push(head);
    for (let i = 0; i < v.headGlints; i++)
      this.glint(live, head, look, {
        x: (this.random() * 2 - 1) * v.headHalfWidth,
        h: crown + this.rand({ from: -v.headUnder, to: v.headOver }),
        start: v.headStartMs + i * v.headStepMs,
        life: this.rand(v.headLifeMs),
        rise: this.rand(GLINT.rise),
        turn: (this.random() * 2 - 1) * GLINT.turn,
        size: this.rand(GLINT.size),
      });

    this.finish(live, SHIMMER_INVOKED_MS, { front: head }, ring, (at) => {
      const s = worldToScreen(at.x, at.y);
      feet = {
        x: s.x,
        y: s.y,
        front: worldDepth(at.x, at.y, LAYER.front),
        behind: worldDepth(at.x, at.y, LAYER.behind),
      };
      for (const m of motes) stand(m);
    });
  }

  /** Each frame (R23): every shimmer stands at the figure's drawn feet, its light with it. */
  follow(at: Point): void {
    this.at = { x: at.x, y: at.y };
    for (const live of this.live) live.place(this.at);
  }

  /**
   * The run is torn down (R26): every live shimmer's objects and light go at once, as
   * `ParryFx.forget` does. The next shimmer waits for a fresh follow.
   */
  forget(): void {
    for (const live of [...this.live]) this.end(live);
    this.at = undefined;
  }

  /** A shimmer's bookkeeping and its one short-lived light at mid-body (R11, R17). */
  private begin(
    look: Look,
    light: { radius: number; intensity: number; fadeMs: number },
    crown: number,
  ): Live {
    const live: Live = {
      parts: [],
      roots: [],
      tweens: [],
      light: this.lights.addTransient({
        x: 0,
        y: 0,
        radius: light.radius,
        color: BARROW_HEX[look.light],
        intensity: light.intensity,
      }),
      lift: crown / 2,
      place: () => {},
    };
    live.tweens.push(
      this.scene.tweens.add({
        targets: live.light,
        intensity: { from: light.intensity, to: 0 },
        duration: light.fadeMs,
        ease: "Sine.easeIn",
      }),
    );
    return live;
  }

  /** A baked decal laid on the world plane at the feet (R8, R15), placed in world px. */
  private decal(live: Live, sheet: string, tint: Token): Decal {
    const image = this.image(sheet, tint);
    const surface = this.scene.add
      .container(0, 0)
      .setRotation(PLANE_TRANSFORM.rotation);
    const root = this.scene.add
      .container(0, 0)
      .setScale(PLANE_TRANSFORM.scaleX, PLANE_TRANSFORM.scaleY);
    root.add(surface);
    surface.add(image);
    live.parts.push(image, surface, root);
    return { image, root };
  }

  /** One glint in a layer, its objects and tweens tracked until the shimmer ends. */
  private glint(
    live: Live,
    layer: { add(child: unknown): unknown },
    look: Look,
    d: GlintDraw,
  ): void {
    const { parts, tweens } = drawGlint(this.scene, this.art, layer, look, d);
    live.parts.push(...parts);
    live.tweens.push(...tweens);
  }

  /**
   * Places the shimmer at the feet from now on (R23, R24): its layers in front of or behind the
   * figure, its ground decal under it, its light at mid-body, plus whatever `also` places. Until
   * the figure is first drawn it shows nothing, its light dark and its objects hidden, so nothing
   * winks in at the world origin. Ends it after `ms` and tracks it till then.
   */
  private finish(
    live: Live,
    ms: number,
    layers: { front: Layer; behind?: Layer },
    decal: Decal,
    also?: (at: Point) => void,
  ): void {
    const layered: [Layer, number][] = [[layers.front, LAYER.front]];
    if (layers.behind) layered.push([layers.behind, LAYER.behind]);
    live.roots.push(...layered.map(([l]) => l), decal.root);
    let shown = false;
    live.place = (at) => {
      const s = worldToScreen(at.x, at.y);
      for (const [l, sub] of layered) {
        l.setPosition(s.x, s.y);
        l.setDepth(worldDepth(at.x, at.y, sub));
      }
      decal.image.setPosition(at.x, at.y);
      decal.root.setDepth(worldDepth(at.x, at.y, LAYER.ground));
      also?.(at);
      live.light.x = s.x;
      live.light.y = s.y - live.lift;
      live.light.hidden = false;
      if (!shown) {
        shown = true;
        for (const r of live.roots) r.setVisible(true);
      }
    };
    if (this.at) live.place(this.at);
    else {
      live.light.hidden = true;
      for (const r of live.roots) r.setVisible(false);
    }

    live.timer = this.scene.time.delayedCall(ms, () => this.end(live));
    this.live.add(live);
  }

  /** A uniform sample of a range, from the injected random source (R28). */
  private rand(r: Range): number {
    return r.from + (r.to - r.from) * this.random();
  }

  /** Destroys what a shimmer made. Harmless to repeat. */
  private end(live: Live): void {
    if (!this.live.delete(live)) return;
    live.timer?.remove(false);
    for (const t of live.tweens) t.stop();
    live.light.remove();
    for (const p of live.parts) p.destroy();
  }

  /** A baked fx frame, centred on its anchor and tinted one look token. */
  private image(sheet: string, tint: Token) {
    return fxImage(this.scene, this.art, sheet, tint);
  }

  /** Whether every sheet is there; otherwise logs once, naming what is missing (R27). */
  private sheetsPresent(sheets: readonly string[]): boolean {
    const missing = sheets.filter((s) => !this.art.has(s));
    if (missing.length === 0) return true;
    if (!this.warned) {
      this.warned = true;
      this.logger.warn(
        `shimmer: ${missing.map((s) => `"${s}"`).join(", ")} missing; the shimmer plays nothing`,
        { sheets: missing },
      );
    }
    return false;
  }
}
