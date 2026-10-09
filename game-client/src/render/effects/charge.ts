/**
 * Warrior charge (FS-KYPQ9 §D.2): a low dust burst at the start point that spreads a little and
 * settles (450 ms), and dust kicked up at the warrior's feet for as long as the charge carries
 * them, left lying along the path they actually ran. No bright streak.
 *
 * Signal, unchanged: the warrior's own right click that sends `CastSkill {skill_id: "dash"}`.
 * The server carries the delver over several ticks (180 px at 450 px/s), so nothing here
 * predicts or marks where the charge lands: the scene hands the drawn position to
 * {@link Charge.follow} each frame, and ends it after {@link CHARGE_MS}.
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey } from "./runtime";

/**
 * How long the feet kick dust: the server's charge (180 px at 450 px/s, 400 ms) plus the eased
 * position catching up with its last tick.
 */
export const CHARGE_MS = 470;

/** A charge playing: the dust at the feet follows the drawn body until it ends. */
export interface Charge {
  /** The warrior's drawn world position this frame. */
  follow(at: Point): void;
  /** The charge is over: no more dust is kicked, and what was kicked settles. */
  end(): void;
}

/** Plays the charge from `from` toward `toward`, both world positions. */
export function playCharge(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  from: Point,
  toward: Point,
): Charge {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const len = Math.hypot(dx, dy);
  const direction = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  fx.play(owner, "chargeDust", from, { direction });
  const feet = fx.play(owner, "chargeTrail", from, { direction });
  return {
    follow: (at) => feet?.moveTo(at),
    end: () => feet?.stop(),
  };
}
