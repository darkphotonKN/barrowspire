/**
 * The fullscreen button's footprint in the canvas's top-right corner, in logical units
 * (FS-ZAJMH R18). The button is DOM over the canvas (never out in the frame's bars) and is drawn
 * at the canvas's CSS scale, so it covers the same logical corner at any fit; the HUD keeps clear
 * of it from here (Nick, 2026-11-05: the button keeps the corner in every scene; the run's
 * top-right HUD steps down).
 */
export const FULLSCREEN_BUTTON = {
  /** From the canvas's top and right edges to the button. */
  inset: 6,
  height: 20,
} as const;

/**
 * How far a top-right HUD widget steps down to clear the button: its inset and height, and a
 * margin under it.
 */
export const FULLSCREEN_BUTTON_CLEARANCE =
  FULLSCREEN_BUTTON.inset + FULLSCREEN_BUTTON.height + 8;
