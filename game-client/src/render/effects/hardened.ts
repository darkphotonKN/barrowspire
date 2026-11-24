/**
 * Hardened's look (FS-X2CMM §I R47): a dull bronze sheen over the warrior, a faint shell from the shins to
 * just over the crown, breathing slowly, with a dull line of light sliding up it. Drawn in front of the
 * body, under the light-map, and never tinting the body itself (the hit's flash owns the tint). Brass, the
 * bronze of the HUD's frame, dimmed: it marks what the body became, not a moment.
 *
 * One of the book's looks, each in its own file so it can be swapped; `src/render/world/bookStates.ts`
 * places it. Pure: no Phaser.
 */

import type { BodyClock, LookBrush, StateLook } from "@/render/world/bookLook";
import { wave } from "@/render/world/bookLook";
import { palette } from "@/utils/canvasPalette";

/** Hardened's numbers, screen px. v1, to tune at the gallery. */
export const HARDENED = {
  /** The shell's half-width, its foot as a share of the crown, its top over the crown. */
  halfWidth: 20,
  shins: 0.1,
  overCrown: 4,
  /** Its fill and rim, and their slow breath. */
  fill: 0.12,
  rim: 0.3,
  breath: { swing: 0.3, periodMs: 2400 },
  /** The sliding sheen: its period up the shell. */
  sheenMs: 2000,
  inMs: 300,
} as const;

function paintSheen(g: LookBrush, clock: BodyClock): void {
  const { halfWidth, shins, overCrown, fill, rim, breath, sheenMs } = HARDENED;
  const shown = Math.min(1, clock.ageMs / HARDENED.inMs);
  const foot = -clock.crown * shins;
  const top = -clock.crown - overCrown;
  const height = foot - top;
  const mid = (foot + top) / 2;
  const glow = shown * (1 - breath.swing * (0.5 + 0.5 * wave(clock, breath.periodMs)));
  g.fillStyle(palette.bookEffect.hardened, fill * glow);
  g.fillEllipse(0, mid, halfWidth * 2, height);
  g.lineStyle(1, palette.bookEffect.hardened, rim * glow);
  g.strokeEllipse(0, mid, halfWidth * 2, height);
  if (clock.reduced) return;
  // a dull line of light sliding up the shell, narrowing with it toward its ends
  const k = (clock.ageMs / sheenMs + clock.seed) % 1;
  const y = foot - k * height;
  const across = halfWidth * Math.sqrt(Math.max(0, 1 - ((y - mid) / (height / 2)) ** 2));
  g.lineStyle(1.5, palette.bookEffect.hardened, 0.35 * glow);
  g.lineBetween(-across, y, across, y);
}

export const HARDENED_LOOK: StateLook = { layers: { front: paintSheen } };
