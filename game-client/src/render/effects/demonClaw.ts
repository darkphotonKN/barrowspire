/**
 * A demon's fire claw (FS-VHGE7 §D R32): a flame swept along the swipe in the demon's facing, at
 * its claw's height, with embers flung forward off it, and one brief ember flash pooled on the
 * ground beneath. A hostile's attack effect, so it is drawn from the ember family only (guideline
 * "Enemy design language"): never amber, which means *interactable*. Over in the table's
 * ≤ 250 ms. No shake.
 *
 * Signal: a shown demon's `action` turning to `claw` in a state broadcast, once per turn
 * (`MonsterRoster`, R33). The claw has no wind-up, so this flame is how it is read as it lands.
 */

import { worldToScreen, type Point } from "@/render/iso/projection";
import { alongAim } from "./projectile";
import type { EffectsRuntime, OwnerKey } from "./runtime";

/** Screen px along the facing from the demon's feet to where its claw sweeps. *Starting value.* */
export const CLAW_REACH = 28;

/**
 * Screen px above the demon's feet to its claw: a boss stands about twice a player's height, so
 * about half again a player's hand (`HAND_LIFT` 42). *Starting value.*
 */
export const CLAW_LIFT = 64;

/**
 * Plays the claw from the demon drawn at `at` (world px), swiping along `facing` (a world vector,
 * the server's). With no facing it plays at the demon itself, upright.
 */
export function playDemonClaw(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  at: Point,
  facing: Point,
): void {
  if (facing.x === 0 && facing.y === 0) {
    fx.play(owner, "demonClaw", at, { lift: CLAW_LIFT });
    return;
  }
  const screen = worldToScreen(facing.x, facing.y);
  fx.play(
    owner,
    "demonClaw",
    alongAim(at, { x: at.x + facing.x, y: at.y + facing.y }, CLAW_REACH),
    {
      rotation: Math.atan2(screen.y, screen.x),
      direction: facing,
      lift: CLAW_LIFT,
    },
  );
}
