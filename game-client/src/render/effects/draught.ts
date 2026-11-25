/**
 * The draught's look (FS-X2CMM §I R47): a small stoppered flask on the floor, its glass slate, its liquid
 * the health potion's oxblood (it heals: guideline "Healing is not green"), a brass stopper, standing in
 * the faint amber pool every interactable stands in (`interactablePool`), since a player drinks it with
 * the interact key (R27). Still: it waits to be drunk.
 *
 * One of the book's looks, each in its own file so it can be swapped; `src/render/world/bookEffects.ts`
 * places it. Pure: no Phaser.
 */

import type { EffectLook, LookBrush, LookClock } from "@/render/world/bookLook";
import { presence } from "@/render/world/bookLook";
import { interactablePool } from "@/render/world/floorLights";
import { palette } from "@/utils/canvasPalette";

/** The flask's numbers, screen px over its point. v1, to tune at the gallery. */
export const DRAUGHT = {
  /** Its round belly's radius and centre height. */
  belly: { radius: 5, y: -6 },
  /** Its neck and stopper. */
  neck: { width: 3, height: 5, y: -15 },
  stopper: { width: 5, height: 3, y: -18 },
  /** Its pool sits a little up the flask, as a chest's does. */
  poolLift: 6,
  inMs: 250,
} as const;

function paintFlask(g: LookBrush, clock: LookClock): void {
  const shown = presence(clock, DRAUGHT.inMs, 0);
  const { belly, neck, stopper } = DRAUGHT;
  // its shadow on the floor
  g.fillStyle(palette.bookEffect.afloatShadow, 0.35 * shown);
  g.fillEllipse(0, 0, belly.radius * 2.6, belly.radius);
  g.fillStyle(palette.bookEffect.draughtGlass, 0.7 * shown);
  g.fillCircle(0, belly.y, belly.radius);
  g.fillRect(-neck.width / 2, neck.y, neck.width, neck.height);
  g.fillStyle(palette.bookEffect.draughtLiquid, shown);
  g.fillCircle(0, belly.y + 1, belly.radius - 1.5);
  g.fillStyle(palette.bookEffect.draughtShine, 0.8 * shown);
  g.fillCircle(-1.5, belly.y - 1, 1.2);
  g.fillStyle(palette.bookEffect.draughtStopper, shown);
  g.fillRect(-stopper.width / 2, stopper.y, stopper.width, stopper.height);
}

const POOL = interactablePool({ x: 0, y: 0 }, 0);

export const DRAUGHT_LOOK: EffectLook = {
  layers: { body: paintFlask },
  light: {
    radius: POOL.radius,
    color: POOL.color,
    intensity: POOL.intensity,
    flicker: POOL.flicker,
    at: (clock) => ({ dx: 0, dy: -DRAUGHT.poolLift, strength: presence(clock, DRAUGHT.inMs, 0) }),
  },
};
