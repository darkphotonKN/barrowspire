/**
 * The cooldown sweep's pure half (FS-Q18Q3 §D R18, R19): how much of a square a running cooldown still
 * covers, and the wedge that covers it. The server's `CooldownState` sets it; between states it runs down
 * with the real time since that state was heard (the open bar's rule, FS-MQYEX R22), never below 0, and the
 * next state corrects it. The client never times a cooldown itself. `AbilityBar` draws what this returns.
 */

import type { CooldownState } from "@/types/gameState";
import type { Point } from "./xpBarLayout";
import type { Rect } from "./hudCornerLayout";

/**
 * The fraction of the square still swept, 0 to 1: `remaining / total` as heard at `heardAt`, run down by
 * the time to `now` (both on one clock, in ms). None (an older server, or a held bar), `{0, 0}`, a `total`
 * of 0 or a number that is not one sweeps nothing (R19).
 */
export function cooldownSwept(
  cooldown: CooldownState | null | undefined,
  heardAt: number,
  now: number,
): number {
  if (!cooldown || !(cooldown.total > 0) || !(cooldown.remaining > 0)) return 0;
  const since = Math.max(0, now - heardAt) / 1000;
  return Math.min(
    1,
    Math.max(0, (cooldown.remaining - since) / cooldown.total),
  );
}

/**
 * What of a Phaser Graphics a sweep draws with: its wedge's points are plain ones, as Phaser reads them. The
 * ability bar's squares and the roll pip (FS-7P736 R16) each keep one.
 */
export interface SweepGraphics {
  clear(): SweepGraphics;
  fillStyle(color: number, alpha?: number): unknown;
  fillPoints(points: Point[], closeShape?: boolean): unknown;
  destroy(): void;
}

/** Below this, an angle is the same angle: a corner the hand stands on is not stood again. */
const EPSILON = 1e-9;

/**
 * The wedge covering `fraction` of `well` (R18): from the hand, where the clear part ends, clockwise round
 * to 12 o'clock, as a closed polygon from the well's centre along its edge. Empty at 0.
 */
export function sweepPolygon(well: Rect, fraction: number): Point[] {
  const f = Math.min(1, fraction);
  if (!(f > 0)) return [];
  const [hw, hh] = [well.width / 2, well.height / 2];
  const centre = { x: well.x + hw, y: well.y + hh };
  // angles clockwise from 12 o'clock; the corners in that order, from the top-right
  const tr = Math.atan2(hw, hh);
  const corners = [tr, Math.PI - tr, Math.PI + tr, 2 * Math.PI - tr];
  const edgeAt = (angle: number): Point => {
    const [dx, dy] = [Math.sin(angle), -Math.cos(angle)];
    const t = Math.min(
      Math.abs(dx) > EPSILON ? hw / Math.abs(dx) : Infinity,
      Math.abs(dy) > EPSILON ? hh / Math.abs(dy) : Infinity,
    );
    return { x: centre.x + dx * t, y: centre.y + dy * t };
  };
  const hand = (1 - f) * 2 * Math.PI;
  return [
    centre,
    edgeAt(hand),
    ...corners.filter((a) => a > hand + EPSILON).map(edgeAt),
    edgeAt(2 * Math.PI),
  ];
}
