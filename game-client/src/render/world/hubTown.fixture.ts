/**
 * The town's outer walls as game-server/game-service/internal/game/hub_map.go walls them
 * (addHubBuilding): 20 thick, the south wall cut in two around a door gap a run door wide
 * (FS-MMA2H R9). A test fixture only: the scene takes its walls from the server.
 *
 * The golden records each building's rect, partitions and furnishings but not its south wall, so
 * what is here is kept by hand: the gap's width (hub_map.go `hubDoorWidth`) and how far each gap
 * stands east of its wall's centre (`DoorShift`). Only the Inn's is off centre, flush against its
 * partition's east face (ADR-0073). `buildingLooks.test.ts` pins where each gap stands.
 */
import type { TownBuilding } from "./hubTownGolden";

/** hub_map.go `hubWallThickness`. */
export const TOWN_WALL_THICK = 20;
/** hub_map.go `hubDoorWidth`: a town door gap, and the gap in the Inn's partition. */
export const TOWN_DOOR = 80;
/** hub_map.go `DoorShift`, by building name: world px east of the south wall's centre. */
const DOOR_SHIFT: Readonly<Record<string, number>> = { Inn: 15 };

/** A door gap as the span along its south wall's line, and the y of its sill (the wall's outer face). */
export interface TownDoorGap {
  x0: number;
  x1: number;
  sill: number;
}

export function townDoorGap(b: TownBuilding): TownDoorGap {
  const x0 = b.x + (b.w - TOWN_DOOR) / 2 + (DOOR_SHIFT[b.name] ?? 0);
  return { x0, x1: x0 + TOWN_DOOR, sill: b.y + b.h };
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
