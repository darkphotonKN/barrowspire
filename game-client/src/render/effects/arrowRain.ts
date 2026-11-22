/**
 * Arrow Rain (FS-04EEA §H R45): on the archer's own release, {@link ARROW_RAIN}'s volleys of falling arrows
 * into the circle, the first 0.3 s after the send and one every 0.3 s after it, each arrow landing with an
 * impact inside the circle. The caster's own: never broadcast (R42), and drawn by the world scene that sent it
 * (ADR-0086 2.1, 2.2).
 *
 *   const rain = new ArrowRain(scene, art, fx);
 *   rain.start(from, centre); // the `arrow_rain` just sent, at the circle's centre
 *   rain.stop();              // a floor change, the scene tearing down, the archer resolving
 *
 * Each arrow is the baked `fx_arrow` body, untinted as an arrow in flight is drawn (`projectile.ts`),
 * dropped from above its landing point and slanted in from the archer's side, falling under `Quad.easeIn`
 * as a thing under its own weight does; where it lands the table's `arrowRainImpact` plays, and it stands
 * stuck in the ground a moment, fading, so the circle reads struck. No new texture. The volleys are drawn where the server's rain falls, not read from it: the wire carries no volley,
 * so a rain refused by the server (cooldown jitter) has already been drawn, as every optimistic send is.
 */

import type Phaser from "phaser";
import { worldToScreen, type Point } from "@/render/iso/projection";
import { worldDepth } from "@/render/iso/shapes";
import { ARROW_RAIN_RADIUS } from "@/scenes/arrowRainAim";
import type { EffectsRuntime, EffectsScene, FxArt, OwnerKey } from "./runtime";
import { Staged } from "./staged";
import type { EffectName } from "./table";

/** The rain's numbers: the server's volleys and interval (FS-04EEA §E), the fall's starting values. */
export const ARROW_RAIN = {
  volleys: 5,
  /** Between the send and the first volley, and between one volley and the next. */
  intervalMs: 300,
  /** Arrows drawn landing in one volley. */
  arrows: 5,
  /** How long an arrow takes to fall onto its landing point. */
  fallMs: 160,
  /** Screen px above its landing point an arrow falls from. */
  drop: 150,
  /** Screen px across an arrow drifts while it falls, in from the archer's side. */
  slant: 36,
  /** Arrows land within this share of the circle's radius, so none lands on its rim. */
  spread: 0.9,
  /** How long a landed arrow stands stuck in the ground, fading out. */
  stuckMs: 450,
} as const;

/** The falling arrow's sub-layer within its landing point's footprint: an arrow in flight's. */
const ARROW_LAYER = 5;

/** Every table entry the rain plays, for the palette check. */
export const ARROW_RAIN_EFFECTS = ["arrowRainImpact"] as const satisfies readonly EffectName[];

/** An arrow drawn: its body and the tween moving it, its fall and then its fade where it stuck. */
interface Falling {
  body: { destroy(): void; setPosition(x: number, y: number): unknown };
  tween: { stop(): unknown };
  /** Screen px it lands at. */
  at: Point;
}

/** One rain in progress: its steps, its arrows drawn (falling or stuck), and the owner its impacts play under. */
interface Rain {
  owner: OwnerKey;
  steps: Staged;
  falling: Set<Falling>;
  /** Volleys still to land. */
  volleysLeft: number;
}

export interface ArrowRainOptions {
  /** Where in the circle each arrow lands; `Math.random` unless a test pins it. */
  random?: () => number;
}

/** The scene an Arrow Rain draws on: the effects runtime's, and a counter tween to drop each arrow by. */
export type ArrowRainScene = EffectsScene & { tweens: Pick<Phaser.Tweens.TweenManager, "add" | "addCounter"> };

export class ArrowRain {
  private readonly rains = new Set<Rain>();
  private readonly random: () => number;
  private started = 0;

  constructor(
    private readonly scene: ArrowRainScene,
    private readonly art: FxArt,
    private readonly fx: Pick<EffectsRuntime, "play" | "release">,
    options: ArrowRainOptions = {},
  ) {
    this.random = options.random ?? Math.random;
  }

  /** Whether a volley is still to land. */
  get raining(): boolean {
    for (const rain of this.rains) if (rain.volleysLeft > 0) return true;
    return false;
  }

  /** The rain sent by the archer at `from` onto the circle centred at `centre`, both world points. */
  start(from: Point, centre: Point): void {
    const rain: Rain = {
      owner: `rain:${++this.started}`,
      steps: new Staged(this.scene.time),
      falling: new Set(),
      volleysLeft: ARROW_RAIN.volleys,
    };
    this.rains.add(rain);
    // the arrows come in from the archer's side of the circle, as loosed from where they stand
    const side = Math.sign(worldToScreen(centre.x - from.x, centre.y - from.y).x) || 1;
    for (let v = 1; v <= ARROW_RAIN.volleys; v++) {
      const lands = v * ARROW_RAIN.intervalMs;
      const points = Array.from({ length: ARROW_RAIN.arrows }, () => this.landing(centre));
      const drops: Falling[] = [];
      rain.steps.at(lands - ARROW_RAIN.fallMs, () => {
        for (const p of points) {
          const arrow = this.fall(p, side);
          if (arrow) {
            drops.push(arrow);
            rain.falling.add(arrow);
          }
        }
      });
      rain.steps.at(lands, () => {
        rain.volleysLeft--;
        for (const arrow of drops) this.stick(arrow);
        for (const p of points) this.fx.play(rain.owner, "arrowRainImpact", p);
      });
      rain.steps.at(lands + ARROW_RAIN.stuckMs, () => {
        for (const arrow of drops) this.take(rain, arrow);
        if (!rain.steps.busy && rain.falling.size === 0) this.rains.delete(rain);
      });
    }
  }

  /** Every rain ends now: no more volleys, no arrow left in the air, no impact left playing. */
  stop(): void {
    for (const rain of this.rains) {
      rain.steps.cancel();
      for (const arrow of rain.falling) this.take(rain, arrow);
      this.fx.release(rain.owner, { now: true });
    }
    this.rains.clear();
  }

  /** A point uniformly inside the circle, short of its rim. */
  private landing(centre: Point): Point {
    const r = ARROW_RAIN_RADIUS * ARROW_RAIN.spread * Math.sqrt(this.random());
    const a = this.random() * Math.PI * 2;
    return { x: centre.x + Math.cos(a) * r, y: centre.y + Math.sin(a) * r };
  }

  /** One arrow dropped onto world point `p`, slanting in from `side`; nothing when its sheet is missing. */
  private fall(p: Point, side: number): Falling | undefined {
    if (!this.art.has("fx_arrow")) return undefined;
    const r = this.art.resolve("fx_arrow");
    const to = worldToScreen(p.x, p.y);
    const from = { x: to.x - side * ARROW_RAIN.slant, y: to.y - ARROW_RAIN.drop };
    const body = (
      r.placeholder ? this.scene.add.image(from.x, from.y, r.texture) : this.scene.add.image(from.x, from.y, r.texture, r.frame)
    )
      .setOrigin(r.anchor.x, r.anchor.y)
      // the baked arrow points +x: turned to the way it falls
      .setRotation(Math.atan2(to.y - from.y, to.x - from.x))
      .setDepth(worldDepth(p.x, p.y, ARROW_LAYER));
    // driven by a counter, the body set down each step, as a gallery flight is flown
    const tween = this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: ARROW_RAIN.fallMs,
      ease: "Quad.easeIn",
      onUpdate: (tw) => {
        const t = tw.getValue() ?? 0;
        body.setPosition(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t);
      },
    });
    return { body, tween, at: to };
  }

  /** A landed arrow stands where it struck, fading out over {@link ARROW_RAIN}`.stuckMs`. */
  private stick(arrow: Falling): void {
    arrow.tween.stop();
    arrow.body.setPosition(arrow.at.x, arrow.at.y);
    arrow.tween = this.scene.tweens.add({
      targets: arrow.body,
      alpha: { from: 1, to: 0 },
      duration: ARROW_RAIN.stuckMs,
      ease: "Sine.easeIn",
    });
  }

  private take(rain: Rain, arrow: Falling): void {
    arrow.tween.stop();
    arrow.body.destroy();
    rain.falling.delete(arrow);
  }
}
