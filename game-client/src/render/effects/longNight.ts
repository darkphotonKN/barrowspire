/**
 * The Long Night's look (FS-X2CMM §I R47): a dark ring at the warrior's feet, pitch edged in umbra,
 * breathing slowly while every monster near takes the warrior as its target (R31). On the floor, under
 * everything that stands; it fades in as it starts and out over its last second.
 *
 * One of the book's looks, each in its own file so it can be swapped; `src/render/world/bookStates.ts`
 * places it. Pure: no Phaser.
 */

import type { BodyClock, LookBrush, StateLook } from "@/render/world/bookLook";
import { groundEllipse, presence, wave } from "@/render/world/bookLook";
import { palette } from "@/utils/canvasPalette";

/** The Long Night's numbers. v1, to tune at the gallery. */
export const LONG_NIGHT = {
  /** The ring's radius on the floor, world px, and its widths, screen px. */
  radius: 26,
  width: 5,
  edgeWidth: 1.5,
  breath: { swing: 0.25, periodMs: 1600 },
  inMs: 250,
  outSeconds: 1,
} as const;

function paintRing(g: LookBrush, clock: BodyClock): void {
  const shown = presence(clock, LONG_NIGHT.inMs, LONG_NIGHT.outSeconds);
  const glow = shown * (1 - LONG_NIGHT.breath.swing * (0.5 + 0.5 * wave(clock, LONG_NIGHT.breath.periodMs)));
  const ring = groundEllipse(LONG_NIGHT.radius);
  g.lineStyle(LONG_NIGHT.width, palette.bookEffect.longNight, 0.75 * glow);
  g.strokeEllipse(0, 0, ring.width, ring.height);
  g.lineStyle(LONG_NIGHT.edgeWidth, palette.bookEffect.longNightEdge, 0.8 * glow);
  g.strokeEllipse(0, 0, ring.width + LONG_NIGHT.width, ring.height + LONG_NIGHT.width / 2);
}

export const LONG_NIGHT_LOOK: StateLook = { layers: { ground: paintRing } };
