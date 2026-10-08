/**
 * Warrior charge (FS-KYPQ9 §D.2): a low dust burst at the start point that spreads a little and
 * settles (450 ms), and a faint dust drag along the charge line (350 ms). No bright streak.
 *
 * Signal, unchanged: the warrior's own right click that sends `CastSkill {skill_id: "dash"}`.
 * The server moves the delver, so nothing here predicts or marks where the charge lands: both
 * play at the start point, kicked back along the heading.
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey } from "./runtime";

/** Plays the charge from `from` toward `toward`, both world positions. */
export function playCharge(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  from: Point,
  toward: Point,
): void {
  const dx = toward.x - from.x;
  const dy = toward.y - from.y;
  const len = Math.hypot(dx, dy);
  const direction = len > 0 ? { x: dx / len, y: dy / len } : { x: 1, y: 0 };
  fx.play(owner, "chargeDust", from, { direction });
  fx.play(owner, "chargeTrail", from, { direction });
}
