/**
 * The top-right column, its pure half (FS-56CKV §B): the minimap first when one is shown, then the
 * floor indicator, then the escaped count, each right-aligned on the corner's x. Where a part is
 * not shown the parts under it close up (the floor indicator hidden while the map name names the
 * floor, FS-56CKV §Change: Map name, E9; the scene says so with a null `floorHeight`). The
 * minimap, normal or enlarged, stands in the very corner (FS-56CKV §Change C1, C3); with the
 * overlay up the map mode icon takes the corner, the map name at its left, and the column starts
 * under that row; with no minimap the column starts in the corner (FS-T3DWX §Change: The top-right
 * HUD fills the button's spot, G2–G5; the owner's option A for the overlay). The scene places what
 * this returns.
 * The town and the fields stand their minimap at the same corner (FS-P0HSP §G.35). The map mode
 * icon's place is the corner's too (FS-56CKV §Change: Map mode icon), and so is the map name's
 * (FS-56CKV §Change: Map name).
 */

import type { Point, Rect } from "@/render/iso/projection";
import { anchorAt, type Placement } from "@/render/viewport/anchor";
import { MINIMAP, minimapRect, type MinimapPanel } from "./minimap";
import type { MinimapMode } from "./minimapMode";
import { minimapModeIconPlace, type MinimapModeIconPlace } from "./minimapModeIcon";
import { minimapNamePlace, type MinimapNamePlace } from "./minimapName";

/**
 * The top-right corner (FS-56CKV §Change C1, C3; FS-T3DWX §Change: The top-right HUD fills the
 * button's spot, G2–G5): 10 px in from the right and from the top, the target frame's top inset
 * (FS-48CTQ §E.14). The minimap stands on it in either size, the overlay's map mode icon does, and
 * with no minimap the column's first line does. The run's, the town's and the fields' (FS-P0HSP
 * §G.35).
 */
export const TOP_RIGHT_EDGE: Placement = { anchor: "top-right", dx: -10, dy: 10 };

/**
 * From the corner's top to the column's with the overlay up, under the map mode icon's row: the
 * map name's plate, about 17 px, and the lines' 4 px gap (FS-T3DWX G4, the owner's option A).
 */
const OVERLAY_ROW = 21;

/** The column's corner with the overlay up: under the map mode icon's row, at y 31 (FS-T3DWX G4). */
export const TOP_RIGHT_UNDER_ICON: Placement = { ...TOP_RIGHT_EDGE, dy: TOP_RIGHT_EDGE.dy + OVERLAY_ROW };

/** The floor indicator's and the escaped count's type and padding, and the gap between them (§B.9, §B.10). */
export const TOP_RIGHT_LINE = { fontSize: "12px", padding: { x: 8, y: 3 }, gap: 4 } as const;

/** The minimap the corner lays out: its panel and the mode it is shown in, or the map overlay, which has no panel. */
export type CornerMinimap =
  | (Pick<MinimapPanel, "width" | "height"> & { mode: Exclude<MinimapMode, "overlay"> })
  | { mode: "overlay" };

/** What of a minimap the corner reads: its mode, and its panel, none as the overlay. */
interface ShownMinimap {
  readonly mode: MinimapMode;
  readonly panel: Pick<MinimapPanel, "width" | "height"> | null;
}

/** The corner's view of a minimap: its panel in its mode, the overlay as itself, nothing with none built. */
export function cornerMinimap(minimap: ShownMinimap | undefined): CornerMinimap | null {
  if (!minimap) return null;
  const { mode, panel } = minimap;
  return mode === "overlay" || !panel ? { mode: "overlay" } : { width: panel.width, height: panel.height, mode };
}

/** The logical view the corner is laid in. */
type ViewSize = { width: number; height: number };

export interface TopRightCorner {
  /** Where the minimap's panel stands, or null where none is in the corner. */
  minimap: Rect | null;
  /** Where the map mode icon stands, or null with no minimap (FS-56CKV §Change: Map mode icon, D2–D4). */
  modeIcon: MinimapModeIconPlace | null;
  /** Where the map name stands, or null with no minimap (FS-56CKV §Change: Map name, E3–E6). */
  name: MinimapNamePlace | null;
  /** The top of what stands under the minimap, or the column's top with none: whole logical px. */
  below: number;
  /** The column's right edge. */
  right: number;
}

/**
 * The corner's head (FS-T3DWX §Change: The top-right HUD fills the button's spot): the minimap,
 * normal or enlarged, in the very corner, and what stands under it from its bottom; with the
 * overlay up, the map mode icon in the corner and the column under its row (G4, the owner's option
 * A); with no minimap, the column from the corner (G5).
 */
export function topRightCorner(view: ViewSize, minimap: CornerMinimap | null): TopRightCorner {
  const overlay = minimap?.mode === "overlay";
  const panel = minimap && minimap.mode !== "overlay" ? minimap : null;
  const corner = anchorAt(TOP_RIGHT_EDGE, view);
  const map = panel ? minimapRect(corner.x, corner.y, panel) : null;
  // in the map's bottom-left, or in the corner with the overlay up (FS-56CKV §Change: Map mode icon)
  const modeIcon = minimapModeIconPlace(map, overlay ? corner : null);
  const column = overlay ? anchorAt(TOP_RIGHT_UNDER_ICON, view) : corner;
  return {
    minimap: map,
    modeIcon,
    // in the map's top-right, normal or enlarged, left of the icon in the overlay (§Change: Map name;
    // §Change: The enlarged map keeps its labels inside)
    name: minimapNamePlace(map, minimap?.mode, modeIcon),
    below: map ? map.y + map.height + MINIMAP.gap : Math.round(column.y),
    right: corner.x,
  };
}

export interface TopRightColumnParts {
  /** The logical view the column stands in. */
  view: ViewSize;
  /** The minimap: its panel in the corner, normal or enlarged, or the map overlay, which leaves the corner to the lines (FS-1SEF0 §D.21); null with none built. */
  minimap: CornerMinimap | null;
  /** The floor indicator's height, or null while it is hidden (no label). */
  floorHeight: number | null;
  /** The escaped count's height: the column's last line. */
  escapedHeight: number;
}

export interface TopRightColumn extends Pick<TopRightCorner, "minimap" | "modeIcon" | "name"> {
  /** The floor indicator's top-right (origin 1, 0), where it stands even while hidden. */
  floor: Point;
  /** The escaped count's top-right (origin 1, 0). */
  escaped: Point;
  /** The escaped count's bottom, the column's last line's, which the dev readout stands under (FS-56CKV §C.18). */
  bottom: number;
}

/** Every part's place in the column, each top on a whole logical px. */
export function topRightColumn({ view, minimap, floorHeight, escapedHeight }: TopRightColumnParts): TopRightColumn {
  const { minimap: map, modeIcon, name, below: floorTop, right } = topRightCorner(view, minimap);
  const escapedTop = floorHeight === null ? floorTop : Math.round(floorTop + floorHeight) + TOP_RIGHT_LINE.gap;
  return {
    minimap: map,
    modeIcon,
    name,
    floor: { x: right, y: floorTop },
    escaped: { x: right, y: escapedTop },
    bottom: Math.round(escapedTop + escapedHeight),
  };
}
