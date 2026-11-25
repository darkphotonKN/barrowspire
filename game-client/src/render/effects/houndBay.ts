/**
 * The hound's bay (FS-X2CMM §J R49): while the archer's hound bays at a shut secret door, or at a seal piece or
 * tripwire whose ambush still waits, a mark at what it bays at: rings of its call rippling out over the floor
 * from that point, in the hound's own verdigris (beasts' pigment), and a small still spot at their heart. It
 * plays once per bay and is gone when its ripple ends; the server bays again on its own clock. It points at a
 * door or a tripwire not yet detected: that hint is what baying is for. Lies on the floor under everything
 * that stands, and is never a light (nothing to act on).
 *
 * Painted by `src/render/creatures/hounds.ts` at the point the hound's `bay` names. Pure: no Phaser.
 */

import type { LookBrush } from "@/render/world/bookLook";
import { groundEllipse } from "@/render/world/bookLook";
import { palette } from "@/utils/canvasPalette";

/** The bay's numbers. v1, to tune at the gallery. */
export const HOUND_BAY = {
  /** One bay's ripple, ms: as long as the server shows a bay (1.5 s). */
  ms: 1500,
  /** The rings: how many ripple out, how far the last reaches (world px), its width and its first alpha. */
  rings: 3,
  reach: 60,
  width: 1.5,
  alpha: 0.7,
  /** The spot at their heart, world px, and its alpha. */
  spot: 8,
  spotAlpha: 0.35,
} as const;

/** The slice of a brush the bay paints with. */
export type BayBrush = Pick<LookBrush, "clear" | "lineStyle" | "strokeEllipse" | "fillStyle" | "fillEllipse">;

/**
 * Paints one frame of a bay `sinceMs` into it, about the point it bays at: each ring starting a little after
 * the last, growing out and fading as it goes; nothing once the ripple is done. With `reduced` motion, one
 * still ring and the spot, fading over the bay.
 */
export function paintHoundBay(g: BayBrush, sinceMs: number, reduced = false): void {
  g.clear();
  const { ms, rings, reach, width, alpha, spot, spotAlpha } = HOUND_BAY;
  if (sinceMs < 0 || sinceMs >= ms) return;
  const left = 1 - sinceMs / ms;
  const ink = palette.bookEffect.houndBay;
  const heart = groundEllipse(spot);
  g.fillStyle(ink, spotAlpha * left);
  g.fillEllipse(0, 0, heart.width, heart.height);
  if (reduced) {
    const ring = groundEllipse(reach / 2);
    g.lineStyle(width, ink, alpha * left);
    g.strokeEllipse(0, 0, ring.width, ring.height);
    return;
  }
  // each ring runs over the bay's first two thirds, the next a sixth behind
  const run = ms / 2;
  const stagger = (ms - run) / Math.max(rings - 1, 1);
  for (let i = 0; i < rings; i++) {
    const t = (sinceMs - i * stagger) / run;
    if (t <= 0 || t >= 1) continue;
    const ring = groundEllipse(spot + (reach - spot) * (1 - (1 - t) * (1 - t)));
    g.lineStyle(width, ink, alpha * (1 - t));
    g.strokeEllipse(0, 0, ring.width, ring.height);
  }
}
