/**
 * The open bar (FS-MQYEX §D): how far along the player's own timed open is, drawn in the world
 * over the shut container they stand at. It borrows the countdown's bar (`drawCountdownBar`) so
 * the canvas keeps one bar look, but it is not a countdown: it fills from the left, carries no
 * number, and sits over a thing in the world, not along a panel's foot (the design guideline,
 * UI Chrome → Open bar).
 *
 * The server counts the timed open; this only draws what a state said. Between states the fill
 * may run on with real time so it reads smooth, never past full, and the next state corrects it.
 * A full bar opens nothing: the container opens on the state that shows it open.
 *
 * Phaser-free: it draws through the slice of a graphics object `drawCountdownBar` asks for.
 */

import type { TimedOpenState } from "@/types/gameState";
import { COUNTDOWN_BAR_H, drawCountdownBar } from "./countdownBar";
import type { Rect } from "./partyPanelLayout";

/** The bar's size, and how far its foot stands above the container's sprite (R24; tunable, D15). */
export const OPEN_BAR = { width: 44, height: COUNTDOWN_BAR_H, gap: 10 } as const;

/** The bar over a container: centred on its sprite's bounds, its foot `gap` above their top (R24). */
export function openBarRect(sprite: Rect): Rect {
  return {
    x: sprite.x + sprite.width / 2 - OPEN_BAR.width / 2,
    y: sprite.y - OPEN_BAR.gap - OPEN_BAR.height,
    width: OPEN_BAR.width,
    height: OPEN_BAR.height,
  };
}

/**
 * How full the bar is, 0 to 1: the state's `elapsed / duration`, run on by the real time since
 * that state arrived (R22). Never past full, never behind the state, and empty for a timed open
 * that makes no sense (no duration), so a bad state never shows a finished bar.
 */
export function openBarFraction(open: TimedOpenState, sinceStateMs = 0): number {
  if (!(open.duration > 0) || !Number.isFinite(open.elapsed)) return 0;
  const since = sinceStateMs > 0 ? sinceStateMs / 1000 : 0;
  return Math.min(1, Math.max(0, (open.elapsed + since) / open.duration));
}

/** The open bar over a container's sprite, `fraction` full, in the countdown bar's look (R24). */
export function drawOpenBar(
  g: Parameters<typeof drawCountdownBar>[0],
  sprite: Rect,
  fraction: number,
): void {
  drawCountdownBar(g, openBarRect(sprite), fraction);
}
