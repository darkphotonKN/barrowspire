/**
 * The top-right column, its pure half (FS-56CKV §B): the minimap first when one is shown, then the
 * floor indicator, then the escaped count, each right-aligned on the corner's x. Where a part is
 * not shown the parts under it close up. The minimap, normal or enlarged, stands at the very top
 * of the corner with the fullscreen button at its left; in the overlay and with no minimap the
 * button keeps the corner and the column starts under it (FS-56CKV §Change: Minimap at the top,
 * fullscreen button beside it, as amended 2026-11-12). The scene places what this returns, the
 * button's place included.
 * The town and the fields stand their minimap at the same corner (FS-P0HSP §G.35). The map mode
 * icon's place is the corner's too (FS-56CKV §Change: Map mode icon), and so is the map name's
 * (FS-56CKV §Change: Map name).
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
import { minimapModeIconPlace, type MinimapModeIconPlace } from "./minimapModeIcon";
import { minimapNamePlace, type MinimapNamePlace } from "./minimapName";

/**
 * The column's corner where the minimap, normal or enlarged, holds the very top (FS-56CKV §Change
 * C1, C3): 10 px in from the right and from the top, the target frame's top inset (FS-48CTQ §E.14).
 */
export const TOP_RIGHT_EDGE: Placement = { anchor: "top-right", dx: -10, dy: 10 };

/**
 * The column's corner under the fullscreen button in its corner (FS-ZAJMH R12, R18; its order
 * FS-56CKV §B, `topRightColumn`), stepped down clear of the button (Nick, 2026-11-05): where the
 * lines stand with no minimap in the corner (no map, or the overlay). The run's, the town's and
 * the fields' (FS-P0HSP §G.35).
 */
export const TOP_RIGHT_HUD: Placement = {
  ...TOP_RIGHT_EDGE,
  dy: TOP_RIGHT_EDGE.dy + FULLSCREEN_BUTTON_CLEARANCE,
};

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
  /** Where the fullscreen button stands (FS-56CKV §Change C2–C4). */
  button: FullscreenButtonSpot;
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
 * The corner's head (FS-56CKV §Change C1–C4): the minimap, normal or enlarged, at the very top with
 * the button `MINIMAP.gap` px to its left, top-aligned; otherwise the button in its corner and
 * nothing under it (Nick, 2026-11-12: "1.5倍地圖時全螢幕按鈕一樣要在地圖左側").
 */
export function topRightCorner(view: ViewSize, minimap: CornerMinimap | null): TopRightCorner {
  const panel = minimap && minimap.mode !== "overlay" ? minimap : null;
  const corner = anchorAt(panel ? TOP_RIGHT_EDGE : TOP_RIGHT_HUD, view);
  const map = panel ? minimapRect(corner.x, corner.y, panel) : null;
  const button = map ? { top: map.y, right: view.width - (map.x - MINIMAP.gap) } : FULLSCREEN_CORNER;
  // in the map's bottom-left, or beside the button with the overlay up (FS-56CKV §Change: Map mode icon)
  const modeIcon = minimapModeIconPlace(map, minimap?.mode === "overlay", button, view);
  return {
    minimap: map,
    button,
    modeIcon,
    // in the normal map's top-right, left of the button enlarged, left of the icon in the overlay (§Change: Map name)
    name: minimapNamePlace(map, minimap?.mode, button, modeIcon, view),
    below: map ? map.y + map.height + MINIMAP.gap : Math.round(corner.y),
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

export interface TopRightColumn extends Pick<TopRightCorner, "minimap" | "button" | "modeIcon" | "name"> {
  /** The floor indicator's top-right (origin 1, 0), where it stands even while hidden. */
  floor: Point;
  /** The escaped count's top-right (origin 1, 0). */
  escaped: Point;
  /** The escaped count's bottom, the column's last line's, which the dev readout stands under (FS-56CKV §C.18). */
  bottom: number;
}

/** Every part's place in the column, each top on a whole logical px, and the fullscreen button's. */
export function topRightColumn({ view, minimap, floorHeight, escapedHeight }: TopRightColumnParts): TopRightColumn {
  const { minimap: map, button, modeIcon, name, below: floorTop, right } = topRightCorner(view, minimap);
  const escapedTop = floorHeight === null ? floorTop : Math.round(floorTop + floorHeight) + TOP_RIGHT_LINE.gap;
  return {
    minimap: map,
    button,
    modeIcon,
    name,
    floor: { x: right, y: floorTop },
    escaped: { x: right, y: escapedTop },
    bottom: Math.round(escapedTop + escapedHeight),
  };
}
