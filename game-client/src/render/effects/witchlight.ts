/**
 * The witchlight's look (FS-X2CMM §I R47): a soft warm globe that bobs and drifts a little around its
 * point, high over the floor, with a light pool on the light-map. The server holds it still (R21); its drift
 * is drawn, from its own seeded clock, so every viewer's globe moves alike. Light-and-finding ochre lifted
 * toward bone, never amber (nothing to act on, guideline "Gameplay accent"). It fades in as it is lit and
 * out over its last seconds.
 *
 * One of the book's looks, each in its own file so it can be swapped; `src/render/world/bookEffects.ts`
 * places it. Pure: no Phaser.
 */

import type { EffectLook, LookBrush, LookClock } from "@/render/world/bookLook";
import { presence, wave } from "@/render/world/bookLook";
import { palette } from "@/utils/canvasPalette";

/** The witchlight's numbers. v1, to tune at the gallery. */
export const WITCHLIGHT = {
  /** Screen px the globe hangs over its point. */
  lift: 34,
  /** Its bob up and down, px and period. */
  bob: { px: 3, periodMs: 2600 },
  /** Its drift about its point, px and period on each axis. */
  drift: { x: 5, y: 2, periodXMs: 4100, periodYMs: 3300 },
  /** Fades in over this, and out over its last seconds. */
  inMs: 400,
  outSeconds: 1.5,
  /** The globe's rings, px: its soft edge, its body and its hot core. */
  globe: { edge: 8, body: 5.5, core: 2.5 },
  /** Its halo over the light-map, px. */
  halo: { outer: 18, inner: 9 },
  /** Its pool: wide and soft, steadier than a torch (it is no flame). */
  pool: { radius: 230, intensity: 0.75, flicker: 0.06 },
} as const;

/** Where the globe hangs this frame, about its point on the floor, screen px. */
export function witchlightDrift(clock: LookClock): { dx: number; dy: number } {
  const { bob, drift, lift } = WITCHLIGHT;
  return {
    dx: drift.x * wave(clock, drift.periodXMs, 0.25),
    dy: -lift + bob.px * wave(clock, bob.periodMs) + drift.y * wave(clock, drift.periodYMs, 0.5),
  };
}

function paintGlobe(g: LookBrush, clock: LookClock): void {
  const { dx, dy } = witchlightDrift(clock);
  const shown = presence(clock, WITCHLIGHT.inMs, WITCHLIGHT.outSeconds);
  const { edge, body, core } = WITCHLIGHT.globe;
  g.fillStyle(palette.bookEffect.witchlight, 0.35 * shown);
  g.fillCircle(dx, dy, edge);
  g.fillStyle(palette.bookEffect.witchlight, 0.8 * shown);
  g.fillCircle(dx, dy, body);
  g.fillStyle(palette.bookEffect.witchlightCore, shown);
  g.fillCircle(dx, dy, core);
}

function paintHalo(g: LookBrush, clock: LookClock): void {
  const { dx, dy } = witchlightDrift(clock);
  const shown = presence(clock, WITCHLIGHT.inMs, WITCHLIGHT.outSeconds);
  g.fillStyle(palette.bookEffect.witchlight, 0.18 * shown);
  g.fillCircle(dx, dy, WITCHLIGHT.halo.outer);
  g.fillStyle(palette.bookEffect.witchlightCore, 0.3 * shown);
  g.fillCircle(dx, dy, WITCHLIGHT.halo.inner);
}

export const WITCHLIGHT_LOOK: EffectLook = {
  layers: { body: paintGlobe, halo: paintHalo },
  light: {
    ...WITCHLIGHT.pool,
    color: palette.bookEffect.witchlightLight,
    at: (clock) => ({ ...witchlightDrift(clock), strength: presence(clock, WITCHLIGHT.inMs, WITCHLIGHT.outSeconds) }),
  },
};
