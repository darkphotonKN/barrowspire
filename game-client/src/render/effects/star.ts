/**
 * The four-pointed star of pale light the Mercenary's drawn effects share (FS-MAMHR §G.34,
 * §G.35): the stance tell's glint and the parry flash (`parry.ts`), and the armed tell's running
 * glint (`riposte.ts`). One outline, so the three read as the same steel catching the light.
 */

import type { Point } from "@/render/iso/projection";

/** A four-pointed star around `at`, clockwise from the top arm: long arms `r`, waist `r / 4`. */
export function fourPointStar(at: Point, r: number): Point[] {
  const w = r / 4;
  return [
    { x: at.x, y: at.y - r },
    { x: at.x + w, y: at.y - w },
    { x: at.x + r, y: at.y },
    { x: at.x + w, y: at.y + w },
    { x: at.x, y: at.y + r },
    { x: at.x - w, y: at.y + w },
    { x: at.x - r, y: at.y },
    { x: at.x - w, y: at.y - w },
  ];
}
