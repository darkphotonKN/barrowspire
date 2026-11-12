/**
 * The run's top-right column, its pure half (FS-56CKV §B): from the column's corner
 * (`anchorAt(TOP_RIGHT_HUD)`, under the fullscreen button), the minimap first when one is shown,
 * then the floor indicator, then the escaped count, each right-aligned on the corner's x. Where a
 * part is not shown the parts under it close up. The scene places what this returns. The town and
 * the fields stand their minimap at the same corner (FS-P0HSP §G.35).
 */

import type { Point, Rect } from "@/render/iso/projection";
import type { Placement } from "@/render/viewport/anchor";
import { FULLSCREEN_BUTTON_CLEARANCE } from "@/render/viewport/fullscreenButton";
import { MINIMAP, minimapRect, type MinimapPanel } from "./minimap";

/**
 * The top-right column's corner (FS-ZAJMH R12; its order FS-56CKV §B, `topRightColumn`), stepped down
 * clear of the fullscreen button that keeps the frame's corner (R18; Nick, 2026-11-05). The run's,
 * the town's and the fields' (FS-P0HSP §G.35).
 */
export const TOP_RIGHT_HUD: Placement = {
  anchor: "top-right",
  dx: -10,
  dy: 10 + FULLSCREEN_BUTTON_CLEARANCE,
};

/** The floor indicator's and the escaped count's type and padding, and the gap between them (§B.9, §B.10). */
export const TOP_RIGHT_LINE = { fontSize: "12px", padding: { x: 8, y: 3 }, gap: 4 } as const;

export interface TopRightColumnParts {
  /** The column's top-right corner. */
  corner: Point;
  /** The minimap's panel in the corner, normal or enlarged, or null where none is: no minimap built, or the map overlay (FS-1SEF0 §D.21). */
  minimap: Pick<MinimapPanel, "width" | "height"> | null;
  /** The floor indicator's height, or null while it is hidden (no label). */
  floorHeight: number | null;
  /** The escaped count's height: the column's last line. */
  escapedHeight: number;
}

export interface TopRightColumn {
  /** Where the minimap's panel stands, at the column's top; null where none is in the corner. */
  minimap: Rect | null;
  /** The floor indicator's top-right (origin 1, 0), where it stands even while hidden. */
  floor: Point;
  /** The escaped count's top-right (origin 1, 0). */
  escaped: Point;
  /** The escaped count's bottom, the column's last line's, which the dev readout stands under (FS-56CKV §C.18). */
  bottom: number;
}

/** Every part's place in the column, each top on a whole logical px. */
export function topRightColumn({ corner, minimap, floorHeight, escapedHeight }: TopRightColumnParts): TopRightColumn {
  const map = minimap ? minimapRect(corner.x, corner.y, minimap) : null;
  const floorTop = map ? map.y + map.height + MINIMAP.gap : Math.round(corner.y);
  const escapedTop = floorHeight === null ? floorTop : Math.round(floorTop + floorHeight) + TOP_RIGHT_LINE.gap;
  return {
    minimap: map,
    floor: { x: corner.x, y: floorTop },
    escaped: { x: corner.x, y: escapedTop },
    bottom: Math.round(escapedTop + escapedHeight),
  };
}
