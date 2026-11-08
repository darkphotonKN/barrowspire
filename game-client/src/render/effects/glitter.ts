/**
 * Item glitter (FS-QE2QW §C): the quiet loop of small glints on a Fabled item's icon, for as long
 * as the icon is shown. It marks what the item is, where a shimmer marks a moment, and shares only
 * the shimmer's glint: {@link drawGlint} and {@link GLINT} live here and `ShimmerFx` calls them.
 * It casts no light and has no feet glow and no scatter over a body (R14).
 *
 *   const stop = startGlitter(scene, art, layer, { side, shown: () => icon.alpha >= 1 });
 *   stop(); // the icon is gone: the timer, the live glints' tweens and objects with it
 *
 * Each glint is released at the end of its own life, so an open bag accumulates nothing (R18).
 * The caller owns the layer and keeps it on the icon. Tokens only (ADR-0013).
 */

import type Phaser from "phaser";
import { BARROW_HEX } from "@/utils/theme";
import type { EffectsScene, FxArt } from "./runtime";
import type { Token } from "./table";

/**
 * One glint's own numbers (FS-KZC92 R7, R9), shared by every glint: a shimmer's scatter and head
 * glints, and an icon's glitter. From the approved prototype `sparkle`.
 */
export const GLINT = {
  rise: { from: 4, to: 10 },
  turn: 0.5,
  size: { from: 0.45, to: 0.85 },
  /** A glint grows from this share of its size to its size, and never shrinks (R9). */
  growFrom: 0.6,
  /** The core mote's scale against its glint's: a small hot point, not a second disc. */
  core: 0.55,
} as const;

/** The two colours a glint is drawn in. A shimmer's `Look` is one, with a light besides. */
export interface GlintLook {
  glint: Token;
  centre: Token;
}

/** One glint's draw: where in its layer, when, and how it winks (FS-KZC92 R7, R9). */
export interface GlintDraw {
  x: number;
  /** Height over the layer's origin: the glint stands at `-h` and rises from there. */
  h: number;
  start: number;
  life: number;
  rise: number;
  turn: number;
  size: number;
}

/** What one glint made: the owner stops the tweens and destroys the parts when it is done. */
export interface DrawnGlint {
  parts: { destroy(): void }[];
  tweens: { stop(): unknown }[];
}

/** A baked fx frame, centred on its anchor and tinted one token. */
export function fxImage(
  scene: Pick<EffectsScene, "add">,
  art: FxArt,
  sheet: string,
  tint: Token,
): Phaser.GameObjects.Image {
  const r = art.resolve(sheet);
  const img = r.placeholder
    ? scene.add.image(0, 0, r.texture)
    : scene.add.image(0, 0, r.texture, r.frame);
  return img.setOrigin(r.anchor.x, r.anchor.y).setTint(BARROW_HEX[tint]);
}

/**
 * One glint in a layer (FS-KZC92 R7, R9, R22): a baked glint tinted the look's `glint`, its
 * `centre` mote as a hot core, both burning additively. It winks: alpha up over the first half of
 * its life and back over the second, a sharp peak so it reads as a twinkle and not a fade. Its
 * scale only grows, never yoyos.
 */
export function drawGlint(
  scene: Pick<EffectsScene, "add" | "tweens">,
  art: FxArt,
  layer: { add(child: unknown): unknown },
  look: GlintLook,
  d: GlintDraw,
): DrawnGlint {
  const g = GLINT;
  const body = fxImage(scene, art, "fx_glint", look.glint).setBlendMode("ADD");
  const core = fxImage(scene, art, "fx_mote", look.centre)
    .setBlendMode("ADD")
    .setScale(g.core);
  const glint = scene.add
    .container(0, 0)
    .setPosition(d.x, -d.h)
    .setAlpha(0)
    .setScale(g.growFrom * d.size);
  glint.add([body, core]);
  layer.add(glint);
  return {
    parts: [body, core, glint],
    tweens: [
      scene.tweens.add({
        targets: glint,
        alpha: { from: 0, to: 1 },
        delay: d.start,
        duration: d.life / 2,
        yoyo: true,
        ease: "Quad.easeIn",
      }),
      scene.tweens.add({
        targets: glint,
        y: { from: -d.h, to: -d.h - d.rise },
        rotation: { from: 0, to: d.turn },
        scale: { from: g.growFrom * d.size, to: d.size },
        delay: d.start,
        duration: d.life,
        ease: "Linear",
      }),
    ],
  };
}

/** A Fabled icon's glints: its rarity colour round a pale hot centre (R14). */
const FABLED_LOOK: GlintLook = { glint: "rarityFabled", centre: "vellum" };

/** The glitter's numbers (R15, R16). `share` and `iconSide` are starting values. */
const GLITTER = {
  gapMs: { from: 600, to: 900 },
  maxLive: 2,
  /** The granted shimmer's glint life. */
  lifeMs: { from: 260, to: 360 },
  /** Size and rise are `GLINT`'s × this × the icon's side ÷ `iconSide`. */
  share: 0.55,
  iconSide: 64,
} as const;

/** The baked `fx_glint`'s side, in px at scale 1: what a glint's scale is a share of. */
const GLINT_FRAME = 32;

export interface GlitterOptions {
  /** The icon's drawn side: the glints are sized to it and stay inside it (R16, R17). */
  side: number;
  /** Whether a glint due now may wink: false while the icon is fading or faint (R23). */
  shown(): boolean;
  /** `Math.random` unless a caller pins it. */
  random?: () => number;
}

/** A glint on its way, and the timer that releases it. */
interface LiveGlint {
  drawn: DrawnGlint;
  timer: { remove(dispatchCallback?: boolean): void };
}

/** Runs one icon's glitter into `layer`, centred on the icon. Returns the stop. */
export function startGlitter(
  scene: EffectsScene,
  art: FxArt,
  layer: { add(child: unknown): unknown },
  { side, shown, random = Math.random }: GlitterOptions,
): () => void {
  const g = GLITTER;
  const rand = (r: { from: number; to: number }) =>
    r.from + (r.to - r.from) * random();
  const ratio = (g.share * side) / g.iconSide;
  const live = new Set<LiveGlint>();

  const retire = (one: LiveGlint) => {
    live.delete(one);
    one.timer.remove(false);
    for (const t of one.drawn.tweens) t.stop();
    for (const p of one.drawn.parts) p.destroy();
  };

  const wink = () => {
    const size = rand(GLINT.size) * ratio;
    const rise = rand(GLINT.rise) * ratio;
    // inset by its own half-size and rise, so nothing of it leaves the icon's square (R17)
    const room = Math.max(0, side / 2 - (GLINT_FRAME * size) / 2);
    const life = rand(g.lifeMs);
    const one: LiveGlint = {
      drawn: drawGlint(scene, art, layer, FABLED_LOOK, {
        x: (random() * 2 - 1) * room,
        h: (random() * 2 - 1) * Math.max(0, room - rise / 2) - rise / 2,
        start: 0,
        life,
        rise,
        turn: (random() * 2 - 1) * GLINT.turn,
        size,
      }),
      timer: scene.time.delayedCall(life, () => retire(one)),
    };
    live.add(one);
  };

  let timer: { remove(dispatchCallback?: boolean): void };
  const next = (ms: number) => {
    timer = scene.time.delayedCall(ms, () => {
      if (shown() && live.size < g.maxLive) wink();
      next(rand(g.gapMs));
    });
  };
  // a random point in the first gap, so a bag of Fabled items does not pulse in unison (R15)
  next(random() * rand(g.gapMs));

  return () => {
    timer.remove(false);
    for (const one of [...live]) retire(one);
  };
}
