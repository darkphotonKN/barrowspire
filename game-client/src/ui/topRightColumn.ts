/**
 * The run's top-right column, its pure half (FS-56CKV §B): from the column's corner
 * (`anchorAt(TOP_RIGHT_HUD)`, under the fullscreen button), the minimap first when one is shown,
 * then the floor indicator, then the escaped count, each right-aligned on the corner's x. Where a
 * part is not shown the parts under it close up. The scene places what this returns.
 */

import type { Point, Rect } from "@/render/iso/projection";
import { MINIMAP, minimapRect } from "./minimap";

/** The floor indicator's and the escaped count's type and padding, and the gap between them (§B.9, §B.10). */
export const TOP_RIGHT_LINE = { fontSize: "12px", padding: { x: 8, y: 3 }, gap: 4 } as const;

export interface TopRightColumnParts {
  /** The column's top-right corner. */
  corner: Point;
  /** Whether a minimap is shown: built for this floor and not hidden with M. */
  minimap: boolean;
  /** The floor indicator's height, or null while it is hidden (no label). */
  floorHeight: number | null;
  /** The escaped count's height: the column's last line. */
  escapedHeight: number;
}

export interface TopRightColumn {
  /** Where the minimap stands, shown or not: always the column's top. */
  minimap: Rect;
  /** The floor indicator's top-right (origin 1, 0), where it stands even while hidden. */
  floor: Point;
  /** The escaped count's top-right (origin 1, 0). */
  escaped: Point;
  /** The escaped count's bottom, the column's last line's, which the dev readout stands under (FS-56CKV §C.18). */
  bottom: number;
}

/** Every part's place in the column, each top on a whole logical px. */
export function topRightColumn({ corner, minimap, floorHeight, escapedHeight }: TopRightColumnParts): TopRightColumn {
  const map = minimapRect(corner.x, corner.y);
  const floorTop = minimap ? map.y + map.height + MINIMAP.gap : map.y;
  const escapedTop = floorHeight === null ? floorTop : Math.round(floorTop + floorHeight) + TOP_RIGHT_LINE.gap;
  return {
    minimap: map,
    floor: { x: corner.x, y: floorTop },
    escaped: { x: corner.x, y: escapedTop },
    bottom: Math.round(escapedTop + escapedHeight),
  };
}
