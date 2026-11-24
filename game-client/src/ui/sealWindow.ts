/**
 * The Braziers seal's window on the HUD (FS-5FZ4J §J R53): while `seal.window_ends_in` is set, the
 * shared countdown (FS-B3NDZ): a panel with its line, the whole seconds under it and the bar along
 * its foot, draining from the window's first sight to its end. The server sizes the window at the
 * first lighting and sends only what is left, so the length is the first value seen. When it ends
 * unbroken, the gutter line is `SealWatch`'s.
 *
 * Pure: the clock and the frame are tested without a canvas; `SealWindowHud` draws them on the UI
 * scene, where every screen-fixed piece stands (ADR-0086).
 */

import type { SealState } from "@/types/gameState";
import { countdownFraction } from "@/utils/countdown";
import { COUNTDOWN_BAR_H, countdownBarRect } from "./countdownBar";
import type { Rect } from "./partyPanelLayout";

/** The window's countdown as the HUD shows it: the whole seconds left, and how full the bar is. */
export interface SealWindowView {
  seconds: number;
  fraction: number;
}

/** The panel's line. */
export const SEAL_WINDOW_LINE = "The braziers burn.";

/** Each broadcast's seal read into the countdown, or none while no window runs. */
export class SealWindowClock {
  private length?: number;

  see(seal: SealState | undefined): SealWindowView | null {
    const left = seal?.window_ends_in;
    if (left === undefined) {
      this.length = undefined;
      return null;
    }
    this.length ??= left;
    return { seconds: Math.max(0, Math.ceil(left)), fraction: countdownFraction(left, this.length) };
  }

  /** Forget the window: the next one seen starts afresh. */
  reset(): void {
    this.length = undefined;
  }
}

const WIDTH = 260;
/** Under the run's notices (at 100), clear of their two lines. */
const TOP_Y = 146;
const PAD_TOP = 8;
const LINE_H = 20;
const GAP = 2;
const SECONDS_H = 24;
const PAD_BOTTOM = 6;
const HEIGHT = PAD_TOP + LINE_H + GAP + SECONDS_H + PAD_BOTTOM + COUNTDOWN_BAR_H;

/** The panel's place on a view `viewWidth` wide: the line, the seconds under it, the bar along its foot. */
export function sealWindowFrame(viewWidth: number): { panel: Rect; line: Rect; seconds: Rect; bar: Rect } {
  const x = Math.round((viewWidth - WIDTH) / 2);
  const panel = { x, y: TOP_Y, width: WIDTH, height: HEIGHT };
  const line = { x, y: TOP_Y + PAD_TOP, width: WIDTH, height: LINE_H };
  return {
    panel,
    line,
    seconds: { x, y: line.y + LINE_H + GAP, width: WIDTH, height: SECONDS_H },
    bar: countdownBarRect(panel),
  };
}
