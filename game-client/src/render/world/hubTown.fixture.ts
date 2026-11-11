/**
 * The town's outer walls as game-server/game-service/internal/game/hub_map.go walls them
 * (addHubBuilding): 20 thick, the south wall cut in two around a door gap a run door wide
 * (FS-MMA2H R9). A test fixture only: the scene takes its walls from the server.
 *
 * Each gap is the golden's (`doorGap`, written by the server's golden test), never a number kept
 * here: where the server moves or widens a gap, these walls follow, and whatever the client
 * keeps by hand (HUB_DOOR_SPURS, the indoor dressing) is checked against the moved gap.
 */
import type { TownBuilding } from "./hubTownGolden";

/** hub_map.go `hubWallThickness`. */
export const TOWN_WALL_THICK = 20;

/** A door gap as the span along its south wall's line, and the y of its sill (the wall's outer face). */
export interface TownDoorGap {
  x0: number;
  x1: number;
  sill: number;
}

export function townDoorGap(b: TownBuilding): TownDoorGap {
  const { x, y, w, h } = b.doorGap;
  return { x0: x, x1: x + w, sill: y + h };
}

/** A building's five outer walls as [x, y, w, h]: north, west, east, then the south wall's two segments. */
export function townOutline(b: TownBuilding): [number, number, number, number][] {
  const { x0, x1 } = townDoorGap(b);
  const south = b.y + b.h - TOWN_WALL_THICK;
  return [
    [b.x, b.y, b.w, TOWN_WALL_THICK],
    [b.x, b.y, TOWN_WALL_THICK, b.h],
    [b.x + b.w - TOWN_WALL_THICK, b.y, TOWN_WALL_THICK, b.h],
    [b.x, south, x0 - b.x, TOWN_WALL_THICK],
    [x1, south, b.x + b.w - x1, TOWN_WALL_THICK],
  ];
}
