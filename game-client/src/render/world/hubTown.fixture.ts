/**
 * The town's outer walls as game-server/game-service/internal/game/hub_map.go walls them
 * (addHubBuilding): 20 thick, the wall on the building's door face (FS-R4MYX §B R6: south, or
 * east for the chapel) cut in two around a door gap a run door wide (FS-MMA2H R9). A test fixture
 * only: the scene takes its walls from the server.
 *
 * Each gap and face is the golden's (`doorGap`, `doorFace`, written by the server's golden test),
 * never a number kept here: where the server moves, widens or turns a gap, these walls follow,
 * and whatever the client keeps by hand (HUB_DOOR_SPURS, the indoor dressing) is checked against
 * the moved gap.
 */
import type { DoorFace, TownBuilding } from "./hubTownGolden";

/** hub_map.go `hubWallThickness`. */
export const TOWN_WALL_THICK = 20;

/**
 * A door gap as the span along its wall's line (`from`–`to`: an x span in a south wall, a y span
 * in an east wall) and its sill, the wall's outer face (a y for a south door, an x for an east one).
 */
export interface TownDoorGap {
  face: DoorFace;
  from: number;
  to: number;
  sill: number;
}

export function townDoorGap(b: TownBuilding): TownDoorGap {
  const { x, y, w, h } = b.doorGap;
  return b.doorFace === "east"
    ? { face: "east", from: y, to: y + h, sill: x + w }
    : { face: "south", from: x, to: x + w, sill: y + h };
}

/**
 * A strip as wide as a door's gap, `depth` deep from its sill (FS-R4MYX §B R10): `outside`,
 * beyond the sill (south of a south door, east of an east one); `inside`, inward from it. As
 * [x, y, w, h]. The outdoor threshold, the indoor threshold and a door spur are each one.
 */
export function townDoorStrip(
  gap: TownDoorGap,
  depth: number,
  side: "outside" | "inside",
): [number, number, number, number] {
  const start = side === "outside" ? gap.sill : gap.sill - depth;
  const span = gap.to - gap.from;
  return gap.face === "east" ? [start, gap.from, depth, span] : [gap.from, start, span, depth];
}

/**
 * A building's five outer walls as [x, y, w, h]: north and west, the whole one of its south and
 * east walls, then the door face's two segments either side of the gap.
 */
export function townOutline(b: TownBuilding): [number, number, number, number][] {
  const t = TOWN_WALL_THICK;
  const { from, to } = townDoorGap(b);
  const [south, east] = [b.y + b.h - t, b.x + b.w - t];
  const [north, west]: [number, number, number, number][] = [
    [b.x, b.y, b.w, t],
    [b.x, b.y, t, b.h],
  ];
  return b.doorFace === "east"
    ? [north, west, [b.x, south, b.w, t], [east, b.y, t, from - b.y], [east, to, t, b.y + b.h - to]]
    : [north, west, [east, b.y, t, b.h], [b.x, south, from - b.x, t], [to, south, b.x + b.w - to, t]];
}
