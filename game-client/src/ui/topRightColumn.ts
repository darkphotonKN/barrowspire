/**
 * The top-right column, its pure half (FS-56CKV §B): the minimap first when one is shown, then the
 * floor indicator, then the escaped count, each right-aligned on the corner's x. Where a part is
 * not shown the parts under it close up. The normal minimap stands at the very top of the corner
 * with the fullscreen button at its left; enlarged, in the overlay and with no minimap the button
 * keeps the corner and the column starts under it (FS-56CKV §Change: Minimap at the top,
 * fullscreen button beside it). The scene places what this returns, the button's place included.
 * The town and the fields stand their minimap at the same corner (FS-P0HSP §G.35).
 */

import type { Point, Rect } from "@/render/iso/projection";
import { anchorAt, type Placement } from "@/render/viewport/anchor";
import {
  FULLSCREEN_BUTTON_CLEARANCE,
  FULLSCREEN_CORNER,
  type FullscreenButtonSpot,
} from "@/render/viewport/fullscreenButton";
import { MINIMAP, minimapRect, type MinimapPanel } from "./minimap";
import type { MinimapMode } from "./minimapMode";

/**
 * The column's corner where the normal minimap holds the very top (FS-56CKV §Change C1): 10 px in
 * from the right and from the top, the target frame's top inset (FS-48CTQ §E.14).
 */
export const TOP_RIGHT_EDGE: Placement = { anchor: "top-right", dx: -10, dy: 10 };

/**
 * The column's corner under the fullscreen button in its corner (FS-ZAJMH R12, R18; its order
 * FS-56CKV §B, `topRightColumn`), stepped down clear of the button (Nick, 2026-11-05): where the
 * enlarged minimap stands, and the lines with no minimap in the corner. The run's, the town's and
 * the fields' (FS-P0HSP §G.35).
 */
export const TOP_RIGHT_HUD: Placement = {
  ...TOP_RIGHT_EDGE,
  dy: TOP_RIGHT_EDGE.dy + FULLSCREEN_BUTTON_CLEARANCE,
};

/** The floor indicator's and the escaped count's type and padding, and the gap between them (§B.9, §B.10). */
export const TOP_RIGHT_LINE = { fontSize: "12px", padding: { x: 8, y: 3 }, gap: 4 } as const;

/** The minimap's panel shown in the corner, and the mode it is shown in. */
export interface CornerMinimap extends Pick<MinimapPanel, "width" | "height"> {
  mode: MinimapMode;
}

/** The logical view the corner is laid in. */
type ViewSize = { width: number; height: number };

export interface TopRightCorner {
  /** Where the minimap's panel stands, or null where none is in the corner. */
  minimap: Rect | null;
  /** Where the fullscreen button stands (FS-56CKV §Change C2–C4). */
  button: FullscreenButtonSpot;
  /** The top of what stands under the minimap, or the column's top with none: whole logical px. */
  below: number;
  /** The column's right edge. */
  right: number;
}

/**
 * The corner's head (FS-56CKV §Change C1–C4): the normal minimap at the very top with the button
 * `MINIMAP.gap` px to its left, top-aligned; otherwise the button in its corner and the enlarged
 * minimap, or nothing, under it.
 */
export function topRightCorner(view: ViewSize, minimap: CornerMinimap | null): TopRightCorner {
  const beside = minimap?.mode === "normal";
  const corner = anchorAt(beside ? TOP_RIGHT_EDGE : TOP_RIGHT_HUD, view);
  const map = minimap ? minimapRect(corner.x, corner.y, minimap) : null;
  return {
    minimap: map,
    button: beside && map ? { top: map.y, right: view.width - (map.x - MINIMAP.gap) } : FULLSCREEN_CORNER,
    below: map ? map.y + map.height + MINIMAP.gap : Math.round(corner.y),
    right: corner.x,
  };
}

export interface TopRightColumnParts {
  /** The logical view the column stands in. */
  view: ViewSize;
  /** The minimap's panel in the corner, normal or enlarged, or null where none is: no minimap built, or the map overlay (FS-1SEF0 §D.21). */
  minimap: CornerMinimap | null;
  /** The floor indicator's height, or null while it is hidden (no label). */
  floorHeight: number | null;
  /** The escaped count's height: the column's last line. */
  escapedHeight: number;
}

export interface TopRightColumn extends Pick<TopRightCorner, "minimap" | "button"> {
  /** The floor indicator's top-right (origin 1, 0), where it stands even while hidden. */
  floor: Point;
  /** The escaped count's top-right (origin 1, 0). */
  escaped: Point;
  /** The escaped count's bottom, the column's last line's, which the dev readout stands under (FS-56CKV §C.18). */
  bottom: number;
}

/** Every part's place in the column, each top on a whole logical px, and the fullscreen button's. */
export function topRightColumn({ view, minimap, floorHeight, escapedHeight }: TopRightColumnParts): TopRightColumn {
  const { minimap: map, button, below: floorTop, right } = topRightCorner(view, minimap);
  const escapedTop = floorHeight === null ? floorTop : Math.round(floorTop + floorHeight) + TOP_RIGHT_LINE.gap;
  return {
    minimap: map,
    button,
    floor: { x: right, y: floorTop },
    escaped: { x: right, y: escapedTop },
    bottom: Math.round(escapedTop + escapedHeight),
  };
}
