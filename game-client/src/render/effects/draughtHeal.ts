/**
 * The draught's heal (FS-X2CMM §I R47, the state `draught` while a drunk draught heals, R27): a faint rise
 * of small motes up the body, in the health channel's lifted oxblood, as the potion's heal is coloured
 * (guideline "Healing is not green"). A quiet loop for as long as the heal runs, not a shimmer: no light,
 * no glints, drawn in front of the body under the light-map.
 *
 * One of the book's looks, each in its own file so it can be swapped; `src/render/world/bookStates.ts`
 * places it. Pure: no Phaser.
 */

import type { BodyClock, LookBrush, StateLook } from "@/render/world/bookLook";
import { presence } from "@/render/world/bookLook";
import { palette } from "@/utils/canvasPalette";

/** The heal's numbers, screen px. v1, to tune at the gallery. */
export const DRAUGHT_HEAL = {
  /** Motes alive at once, each rising over `riseMs` from the shins to the crown. */
  motes: 4,
  riseMs: 1400,
  /** How far either side of the body's line a mote rises, and its size. */
  halfWidth: 12,
  size: 1.5,
  alpha: 0.55,
  /** Under reduced motion: still motes at a lower alpha. */
  stillAlpha: 0.3,
  inMs: 250,
  outSeconds: 0.5,
} as const;

function paintRise(g: LookBrush, clock: BodyClock): void {
  const { motes, riseMs, halfWidth, size, alpha, stillAlpha } = DRAUGHT_HEAL;
  const shown = presence(clock, DRAUGHT_HEAL.inMs, DRAUGHT_HEAL.outSeconds);
  for (let i = 0; i < motes; i++) {
    const k = clock.reduced ? (i + 0.5) / motes : (clock.ageMs / riseMs + clock.seed + i / motes) % 1;
    // each mote keeps its own side of the body, swaying a little as it rises
    const side = ((i * 0.618 + clock.seed) % 1) * 2 - 1;
    const x = halfWidth * side + (clock.reduced ? 0 : 2 * Math.sin(k * 2 * Math.PI + i));
    const y = -clock.crown * (0.1 + 0.9 * k);
    // in over the first fifth of its rise, out over the rest
    const fade = clock.reduced ? stillAlpha : alpha * Math.min(1, k / 0.2) * (1 - k);
    g.fillStyle(palette.bookEffect.draughtHeal, fade * shown);
    g.fillCircle(x, y, size);
  }
}

export const DRAUGHT_HEAL_LOOK: StateLook = { layers: { front: paintRise } };
