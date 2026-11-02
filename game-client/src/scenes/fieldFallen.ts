/**
 * A field's fallen state (FS-X2F2H §Requirements 22, 23, 58): death in a field costs nothing, so
 * the player is shown a short wait and where they will rise, never a result card or loss copy.
 * The server stands them at the entrance 3 s after the fall; the count here is the client's own,
 * started from the state that first reported them fallen, and only ever a picture of that wait.
 * The wait wears the shared countdown (FS-B3NDZ R12): a centred panel with the line, the whole
 * seconds under it, and the bar along its foot draining over the rise's own wait.
 */

import { COUNTDOWN_BAR_H, countdownBarRect } from "@/ui/countdownBar";
import { countdownFraction } from "@/utils/countdown";
import type { Rect } from "@/ui/partyPanelLayout";

/** How long the server keeps a fallen field player down, ms (the server's FieldPlayerRespawnDelay). */
export const FIELD_RISE_MS = 3000;

/** A player the state reports at 0 HP has fallen; one with no health reported has not. */
export function isFallen(player?: { current_health?: number } | null): boolean {
  return player?.current_health !== undefined && player.current_health <= 0;
}

/** The fallen state's line: where they rise. How long is the shared countdown's number (FS-B3NDZ R12). */
export const FALLEN_LINE = "You have fallen. You rise at the road home.";

const FALLEN_W = 420;
const TOP = 12;
/** The line's row, at the 18 px it has always been. */
const LINE_H = 24;
const GAP = 2;
/** The number's row, at the countdown's 18 px. */
const SECONDS_H = 24;
/** Between the number and the bar. */
const BOTTOM = 11;
const FALLEN_H = TOP + LINE_H + GAP + SECONDS_H + BOTTOM + COUNTDOWN_BAR_H;

export interface FallenFrame {
  panel: Rect;
  line: Rect;
  /** The whole seconds left, centred under the line, just above the bar (FS-B3NDZ R9). */
  seconds: Rect;
  /** The countdown bar along the panel's foot, edge to edge (FS-B3NDZ R1). */
  bar: Rect;
}

/** The fallen panel's place: centred on the canvas, the line, the number, the bar along its foot. */
export function fallenFrame(
  canvasWidth: number,
  canvasHeight: number,
): FallenFrame {
  const x = Math.round((canvasWidth - FALLEN_W) / 2);
  const y = Math.round((canvasHeight - FALLEN_H) / 2);
  const panel: Rect = { x, y, width: FALLEN_W, height: FALLEN_H };
  const line: Rect = { x, y: y + TOP, width: FALLEN_W, height: LINE_H };
  return {
    panel,
    line,
    seconds: {
      x,
      y: line.y + LINE_H + GAP,
      width: FALLEN_W,
      height: SECONDS_H,
    },
    bar: countdownBarRect(panel),
  };
}

/** The fallen state's 3-2-1, fed each state's fallen-or-not and read each frame. */
export class FallenCountdown {
  private since?: number;

  /** One state: "fell" or "rose" on the state that changes it, nothing otherwise. */
  observe(fallen: boolean, now: number): "fell" | "rose" | undefined {
    if (fallen && this.since === undefined) {
      this.since = now;
      return "fell";
    }
    if (!fallen && this.since !== undefined) {
      this.since = undefined;
      return "rose";
    }
    return undefined;
  }

  /** The number to show now, 3 down to 1 and held there if the rise is late; none while standing. */
  count(now: number): number | undefined {
    if (this.since === undefined) return undefined;
    const left = FIELD_RISE_MS - (now - this.since);
    return Math.max(1, Math.ceil(left / 1000));
  }

  /** How full the countdown bar is now: 1 at the fall, 0 at the rise and after; none while standing. */
  fraction(now: number): number | undefined {
    if (this.since === undefined) return undefined;
    return countdownFraction(FIELD_RISE_MS - (now - this.since), FIELD_RISE_MS);
  }

  /** Whether the player is down now, by the last state observed. */
  isDown(): boolean {
    return this.since !== undefined;
  }

  /** Forgets any fall: the next visit starts standing. */
  reset(): void {
    this.since = undefined;
  }
}
