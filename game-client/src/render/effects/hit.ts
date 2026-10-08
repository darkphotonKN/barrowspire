/**
 * Hit feedback (FS-KYPQ9 §G.1): a struck character darkens part of the way toward `oxblood` and
 * eases back to untinted, off the table's `hit` entry. It replaces the flat
 * `setTint(palette.damage)` fill.
 *
 *   const hits = new HitFeedback(scene);
 *   hits.play(sprite);  // an HP drop on the delver or a rival
 *   hits.clearAll();    // resetRun, scene SHUTDOWN
 *
 * Only the drawn character's tint changes: never its position, the camera, `standAt` or
 * `markerBase`, so the name plate and HP bar hold still. A new hit restarts the tint rather than
 * stacking one on another. The tween dies with the sprite and always ends untinted, so it never
 * sticks on a corpse (a hit during the death transition).
 *
 * Phaser is reached only through {@link HitScene}, so this is tested without a canvas.
 */

import type Phaser from "phaser";
import { BARROW_HEX } from "@/utils/theme";
import { EFFECTS } from "./table";

/** The slice of a Phaser scene the tint is eased with. */
export interface HitScene {
  tweens: Pick<Phaser.Tweens.TweenManager, "addCounter">;
}

/** A drawn character: a sprite that takes a multiply tint and says when it is destroyed. */
export interface Tintable {
  readonly active: boolean;
  setTint(color: number): unknown;
  clearTint(): unknown;
  once(event: "destroy", fn: () => void): unknown;
  off(event: "destroy", fn: () => void): unknown;
}

const rgb = (r: number, g: number, b: number) => r * 65536 + g * 256 + b;
const channels = (c: number) => [
  Math.floor(c / 65536) % 256,
  Math.floor(c / 256) % 256,
  c % 256,
];

/**
 * The multiply identity: a white tint leaves the baked art as it is. It is "untinted", not a
 * palette colour (FS-KYPQ9 §0.7), and is built from channels so no colour literal is written.
 */
export const UNTINTED = rgb(255, 255, 255);

/** A tint `t` of the way (0..1) from untinted toward `color`, per channel. */
export function tintToward(color: number, t: number): number {
  const [r, g, b] = channels(color);
  const mix = (c: number) => Math.round(255 + (c - 255) * t);
  return rgb(mix(r), mix(g), mix(b));
}

interface Running {
  tween: { stop(): unknown };
  onDestroy: () => void;
}

export class HitFeedback {
  private readonly running = new Map<Tintable, Running>();

  constructor(private readonly scene: HitScene) {}

  /** Tints the struck character toward oxblood and eases it back over the hit's duration. */
  play(target: Tintable): void {
    if (!target.active) return;
    this.stop(target, false);
    const { timing, ease, tint } = EFFECTS.hit;
    const color = BARROW_HEX[tint.color];

    const onDestroy = () => this.stop(target, false);
    target.once("destroy", onDestroy);
    target.setTint(tintToward(color, tint.peak));
    const tween = this.scene.tweens.addCounter({
      from: tint.peak,
      to: 0,
      duration: timing.durationMs,
      ease,
      onUpdate: (tw: Phaser.Tweens.Tween) => {
        if (target.active)
          target.setTint(tintToward(color, tw.getValue() ?? 0));
      },
      onComplete: () => this.stop(target, true),
    });
    this.running.set(target, { tween, onDestroy });
  }

  /** Stops every tint, leaving each living character untinted (resetRun, SHUTDOWN). */
  clearAll(): void {
    for (const target of [...this.running.keys()]) this.stop(target, true);
  }

  /** How many characters are tinted now. */
  playing(): number {
    return this.running.size;
  }

  private stop(target: Tintable, untint: boolean): void {
    const run = this.running.get(target);
    if (!run) return;
    this.running.delete(target);
    run.tween.stop();
    target.off("destroy", run.onDestroy);
    if (untint && target.active) target.clearTint();
  }
}
