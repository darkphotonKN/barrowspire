/**
 * Occlusion fade (FS-2325V §C.5): a tall thing drawn over the delver fades so they are never lost
 * behind it, and restores when clear. "Over" means both: its sprite overlaps the delver's, and its
 * footprint sorts nearer the viewer. Pure; the scene supplies bounds and depths.
 */

import type { Rect } from "@/render/iso";

/** The alpha an occluder fades to. */
export const FADED_ALPHA = 0.4;

export interface Sorted {
  /** Screen-space bounds of the sprite as drawn. */
  bounds: Rect;
  /** The scene depth it sorts at (its footprint's `worldDepth`). */
  depth: number;
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

export function occludes(occluder: Sorted, subject: Sorted): boolean {
  return (
    occluder.depth > subject.depth && overlaps(occluder.bounds, subject.bounds)
  );
}

/** Time for a fade to close most of the way, in ms. */
const FADE_MS = 120;
/** Close enough to snap: no endless sub-pixel tweening. */
const SETTLE = 0.01;

/** One frame of easing an alpha toward its target, frame-rate independent. */
export function stepAlpha(
  current: number,
  target: number,
  dtMs: number,
): number {
  const next = target + (current - target) * Math.exp(-dtMs / FADE_MS);
  return Math.abs(next - target) < SETTLE ? target : next;
}
