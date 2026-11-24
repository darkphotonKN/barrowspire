/**
 * Tracker's Eye's look (FS-X2CMM §I R47): a faint ochre ring on the floor about the archer, light and
 * finding's pigment, quiet and still but for a slow breath. Under everything that stands.
 *
 * One of the book's looks, each in its own file so it can be swapped; `src/render/world/bookStates.ts`
 * places it. Pure: no Phaser.
 */

import type { BodyClock, LookBrush, StateLook } from "@/render/world/bookLook";
import { groundEllipse, presence, wave } from "@/render/world/bookLook";
import { palette } from "@/utils/canvasPalette";

/** Tracker's Eye's numbers. v1, to tune at the gallery. */
export const TRACKERS_EYE = {
  /** The ring's radius on the floor, world px; its width, screen px; its faint alpha. */
  radius: 30,
  width: 1.5,
  alpha: 0.45,
  breath: { swing: 0.3, periodMs: 3000 },
  inMs: 300,
  outSeconds: 1,
} as const;

function paintRing(g: LookBrush, clock: BodyClock): void {
  const shown = presence(clock, TRACKERS_EYE.inMs, TRACKERS_EYE.outSeconds);
  const glow = 1 - TRACKERS_EYE.breath.swing * (0.5 + 0.5 * wave(clock, TRACKERS_EYE.breath.periodMs));
  const ring = groundEllipse(TRACKERS_EYE.radius);
  g.lineStyle(TRACKERS_EYE.width, palette.bookEffect.trackersEye, TRACKERS_EYE.alpha * glow * shown);
  g.strokeEllipse(0, 0, ring.width, ring.height);
}

export const TRACKERS_EYE_LOOK: StateLook = { layers: { ground: paintRing } };
