/**
 * The arrival card's leaving as smoke (FS-PQ2TW §Change: Smoke, a trial alternate leave, R41–R51):
 * when the card's hold ends, its letters blur, drift up a little and fade, while soft puffs rise
 * from their strokes, each starting small and swelling, rising slowly, curling and turning as it
 * goes, overlapping into one body of smoke that thins out.
 *
 * A trial beside the dust (`cardDust.ts`), which stays the card's leave in the game; the card's one
 * switch picks between them (`CARD_LEAVE`, `src/ui/arrivalCard.ts`). The strokes are read as the
 * dust reads them, through the reading the leaves share (`cardLeaveCore.ts`: `strokeCells` /
 * `ruleCells` / `seedPoints`): never from a box around the text (R42). Where it plays nothing, the card fades (R50).
 */

import type Phaser from "phaser";
import { BARROW_HEX } from "@/utils/theme";
import type { CardDustScene, DustArt } from "./cardDust";
import { LeaveCore, seedPoints, seedZone, type CardInk, type LeaveOptions } from "./cardLeaveCore";
import type { Easing, FxTexture, Range, Token } from "./table";

/** The smoke's numbers (R51), at their starting values; a retune is an edit here. */
export interface CardSmokeRecord {
  /** Every puff's life, and the smoke's: one fixed duration (FS-KYPQ9 §B.2; past its 1200 ms, R49). */
  durationMs: number;
  /** Puffs for the whole card, at most (R47), past §B.6's 12 (R49). */
  maxParticles: number;
  /** Puffs per view px² of ink, under the cap (R47). */
  density: number;
  texture: FxTexture;
  /** A puff's size over its life, × the sheet's 32 px frame: it only grows, to ≤ 1.6 (§B.4, R45). */
  scale: Range;
  /** View px/s, picked per puff and held: a steady rise, no drag (R44). */
  speed: Range;
  /** How far off straight up a puff's heading may be drawn, in degrees, either way (R44). */
  spreadDeg: number;
  /**
   * Each puff's sideways wobble (R44), picked per puff: how far to either side, in view px, and how
   * long one wobble takes. It grows from none over the puff's life.
   */
  sway: { amplitude: Range; periodMs: Range };
  /** How fast a puff turns, degrees a second, picked per puff: its curl (R44). */
  turnDegPerS: Range;
  /** From the card text's colour to a grey, over a puff's life (R46). */
  tint: { from: Token; to: Token };
  alpha: Range;
  /** Of the swelling, the thinning and the colour (§B.3 allowlist). */
  ease: { scale: Easing; alpha: Easing; color: Easing };
  /**
   * The card's own letters as the smoke rises (R43): the texts' blur at its end (Phaser's blur
   * strength, from none), how far up they drift in view px, and the fade they are gone by.
   */
  letters: { blur: number; rise: number; fadeMs: number; ease: Easing };
}

/** The smoke (R41–R51). Like the dust, not an `EFFECTS` entry: a view-space HUD effect, R49's exception. */
export const CARD_SMOKE = {
  durationMs: 2000,
  maxParticles: 400,
  density: 0.2,
  texture: "fx_smoke",
  // about 10 view px swelling to about 48
  scale: { from: 0.3, to: 1.5 },
  speed: { from: 10, to: 30 },
  spreadDeg: 35,
  sway: { amplitude: { from: 4, to: 10 }, periodMs: { from: 1000, to: 1600 } },
  turnDegPerS: { from: -30, to: 30 },
  // hudText, to a grey
  tint: { from: "vellum", to: "slateLight" },
  alpha: { from: 0.35, to: 0 },
  // swells quickly, then gently; holds, then thins out
  ease: { scale: "Sine.easeOut", alpha: "Sine.easeIn", color: "Linear" },
  letters: { blur: 2, rise: 8, fadeMs: 1200, ease: "Sine.easeOut" },
} as const satisfies CardSmokeRecord;

/** A blur on a text: Phaser's `Filters.Blur` controller is one. */
interface BlurControl {
  strength: number;
  setPaddingOverride(left?: number | null): void;
}

/** What of a text the smoke blurs: a Phaser `Text` under WebGL. Without filters, it is not blurred. */
interface Blurrable {
  enableFilters?(): unknown;
  filters?: { internal: { addBlur(quality?: number, x?: number, y?: number, strength?: number): BlurControl } } | null;
}

/** A piece of the card the smoke takes away: the heading, the rule, the line. */
export interface SmokeLetter {
  y: number;
  alpha: number;
}

/** What the smoke reads and takes: the card's ink, as the dust reads it, and its three pieces. */
export interface SmokeInk extends CardInk {
  texts: readonly (CardInk["texts"][number] & Blurrable)[];
  letters: readonly SmokeLetter[];
}

/** The slice of a Phaser scene the smoke draws, tweens and times with. */
export interface CardSmokeScene extends CardDustScene {
  tweens: Pick<Phaser.Tweens.TweenManager, "add">;
}

export type CardSmokeOptions = LeaveOptions;

/** One puff's own wobble and turn, picked as it is emitted, and the wobble already put on its x. */
interface Curl {
  amplitude: number;
  /** Radians per second. */
  rate: number;
  phase: number;
  /** Degrees per second. */
  turn: number;
  /** Its angle as it was emitted. */
  angle: number;
  onX: number;
}

/** A particle carrying its curl, set as it is emitted. */
const CURL = Symbol("cardSmokeCurl");
type Curling = { [CURL]?: Curl };

type EmitterConfig = Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
type Particle = Phaser.GameObjects.Particles.Particle;

/**
 * Plays one card's smoke at a time, and owns it until it is gone: its one emitter, the tweens on
 * the card's letters, and its end. The same shape as `CardDust`, and it takes the letters itself.
 *
 *   const smoke = new CardSmoke(scene, () => art);
 *   if (!smoke.play(ink, depth, gone)) fadeTheCard(); // reduced motion, no sheet, a failed read
 *   smoke.stop();   // a new card, a resize: gone at once
 *   smoke.forget(); // the scene ended and took it
 */
export class CardSmoke {
  /** The smoke blurs, drifts and fades the card's letters itself: the card leaves them to it. */
  readonly takesLetters = true;
  private readonly core: LeaveCore;

  /** `art` is asked at each play: a scene registers its art anew on every start. */
  constructor(
    private readonly scene: CardSmokeScene,
    private readonly art: () => DustArt | undefined,
    options: CardSmokeOptions = {},
  ) {
    this.core = new LeaveCore("card smoke", options);
  }

  /**
   * Takes `ink`'s letters off as smoke at `depth`, in place of any smoke still up, calling `gone`
   * once it has thinned out. False when it plays nothing, its letters untouched, and the card
   * should fade instead: reduced motion, the sheet missing, or strokes that cannot be read.
   */
  play(ink: SmokeInk, depth: number, gone: () => void): boolean {
    this.stop();
    const { core } = this;
    if (core.reducedMotion()) return false;
    const frames = core.sheet(this.art(), CARD_SMOKE.texture);
    if (!frames) return false;
    const read = core.read(ink);
    if (!read) return false;
    const { cells } = read;

    const s = CARD_SMOKE;
    const area = cells.reduce((sum, c) => sum + c.w * c.h, 0);
    const points = seedPoints(cells, Math.min(s.maxParticles, Math.ceil(area * s.density)), core.random);
    const pick = (r: Range) => r.from + core.random() * (r.to - r.from);
    const config: EmitterConfig = {
      frame: frames.frames,
      lifespan: s.durationMs,
      speed: { min: s.speed.from, max: s.speed.to },
      // up, within the spread either way
      angle: { onEmit: () => -90 + (core.random() * 2 - 1) * s.spreadDeg },
      // the wobble rides on the x the engine updates anyway (Particle.update): from none, growing
      // with the puff's life, never more than its amplitude to either side
      x: {
        onUpdate: (p: Particle, _key: string, t: number, value: number) => {
          const c = (p as Curling)[CURL];
          if (!c) return value;
          const offset = c.amplitude * t * Math.sin(c.rate * (t * s.durationMs) / 1000 + c.phase);
          const moved = offset - c.onX;
          c.onX = offset;
          return value + moved;
        },
      },
      // the engine emits a particle's turn before its heading (Particle.fire): the puff's own
      // wobble and turn are picked here, fresh for each puff
      rotate: {
        onEmit: (p) => {
          const curl: Curl = {
            amplitude: pick(s.sway.amplitude),
            rate: (2 * Math.PI * 1000) / pick(s.sway.periodMs),
            phase: core.random() * 2 * Math.PI,
            turn: pick(s.turnDegPerS),
            angle: core.random() * 360,
            onX: 0,
          };
          if (p) (p as Curling)[CURL] = curl;
          return curl.angle;
        },
        onUpdate: (p: Particle, _key: string, t: number, value: number) => {
          const c = (p as Curling)[CURL];
          return c ? c.angle + (c.turn * t * s.durationMs) / 1000 : value;
        },
      },
      scale: { start: s.scale.from, end: s.scale.to, ease: s.ease.scale },
      alpha: { start: s.alpha.from, end: s.alpha.to, ease: s.ease.alpha },
      color: [BARROW_HEX[s.tint.from], BARROW_HEX[s.tint.to]],
      colorEase: s.ease.color,
      maxParticles: s.maxParticles,
      emitting: false,
      emitZone: seedZone(points),
    };
    // in view px: the emitter at the origin, still with the HUD
    const emitter = this.scene.add.particles(0, 0, frames.texture, config);
    emitter.setScrollFactor(0).setDepth(depth);
    emitter.emitParticle(points.length);
    core.hold(() => emitter.destroy());
    this.soften(ink);
    core.endAt(this.scene.time, s.durationMs, gone);
    return true;
  }

  /** The letters blur from none, drift up and fade as the smoke rises off them (R43). */
  private soften(ink: SmokeInk): void {
    const { letters } = CARD_SMOKE;
    const blurs = ink.texts.flatMap((text) => {
      text.enableFilters?.();
      const blur = text.filters?.internal.addBlur(0, 1, 1, 0);
      if (!blur) return [];
      // padded to the blur as it grows, so it is not clipped at the text's edge
      blur.setPaddingOverride(null);
      return [blur];
    });
    const tween = (config: Phaser.Types.Tweens.TweenBuilderConfig) => {
      const made = this.scene.tweens.add(config);
      this.core.hold(() => made.stop());
    };
    tween({ targets: ink.letters, alpha: 0, y: `-=${letters.rise}`, duration: letters.fadeMs, ease: letters.ease });
    if (blurs.length > 0)
      tween({ targets: blurs, strength: letters.blur, duration: letters.fadeMs, ease: letters.ease });
  }

  /** Takes the smoke away at once, and calls off what it was doing to the letters. */
  stop(): void {
    this.core.stop();
  }

  /** Lets go of the smoke without touching it: at a scene's end, it went with the scene. */
  forget(): void {
    this.core.forget();
  }
}
