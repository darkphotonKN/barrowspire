/**
 * A town building with its street door in its east wall (FS-R4MYX §B R6), walled by hand as the
 * server cuts an east door: north, west and south walls whole, the east wall two segments round a
 * centred 80 px gap, every wall 20 thick and carrying the building's house id. A test fixture
 * only, on its own numbers: it never reads the town golden.
 */

import type { WallState } from "@/types/gameState";

/** The servers' town walls: 20 world px thick. */
export const EAST_DOOR_THICK = 20;
/** A run door's width, the town door gap's (FS-MMA2H). */
export const EAST_DOOR_WIDTH = 80;

/** A building `w` × `h` at (`x`, `y`) with a centred door gap in its east wall: five walls. */
export function eastDoorWalls(x: number, y: number, w: number, h: number, houseId: string): WallState[] {
  const [t, door] = [EAST_DOOR_THICK, EAST_DOOR_WIDTH];
  const side = (h - door) / 2;
  return (
    [
      [x, y, w, t], // north
      [x, y, t, h], // west
      [x, y + h - t, w, t], // south, whole
      [x + w - t, y, t, side], // east, north of the gap
      [x + w - t, y + side + door, t, side], // east, south of the gap
    ] as const
  ).map(([wx, wy, width, height]) => ({
    entity_id: `${houseId}:${wx},${wy},${width},${height}`,
    house_id: houseId,
    position: { x: wx, y: wy },
    width,
    height,
  }));
}

/**
 * An east-door building of the tests' own (FS-R4MYX R6): 480 × 340 at (660, 1040), the chapel's
 * first footprint, kept on these numbers when the chapel grew (owner feedback F1) so the east-door
 * drawing tests stay put. It is no town building: its house id is its own. Its east wall's
 * centreline is x 1130 and its gap y 1170–1250, centred on (1130, 1210). The chapel as the server
 * walls it today is `eastDoorWalls` over the golden's footprint.
 */
export const EAST_DOOR_WALLS: readonly WallState[] = eastDoorWalls(660, 1040, 480, 340, "east-door");
