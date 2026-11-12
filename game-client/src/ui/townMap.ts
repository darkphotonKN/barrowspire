/**
 * The town's map (FS-P0HSP §B; CONTEXT.md "Minimap"): drawn whole from the first moment, from what
 * a hub state carries and the town's size. Its ground is the town's whole diamond; its edge the
 * walls' line, open at a road gap where each gate leads away (the town has no boundary walls: its
 * edge is the server's movement clamp); each town building a solid footprint in the walls' ink,
 * its doors cut open, nothing of its inside drawn. Pure: the minimap draws what this returns.
 */

import { doorGaps, type DoorGap } from "@/render/world/buildingLooks";
import { housesFrom, type House } from "@/render/world/houses";
import type { GateState, WallState } from "@/types/gameState";
import type { MinimapPicture } from "./minimap";
import { edgeRuns, footprint, notchDepth, roadGaps, type FootprintDoor, type WorldSize } from "./worldMap";

/** What of a hub state the town's map is built from. */
export interface TownState {
  walls: readonly WallState[];
  gates?: readonly Pick<GateState, "entity_id" | "destination" | "position" | "range">[];
}

const EPSILON = 1e-6;

/** The side of its building a door gap is cut in, its span along that side, and the wall's thickness there. */
function doorOf(gap: DoorGap, house: House): FootprintDoor & { thickness: number } {
  const { x, y } = gap.position;
  if (gap.width >= gap.height) {
    const side = Math.abs(y - house.y) <= EPSILON ? "north" : "south";
    return { side, from: x, to: x + gap.width, thickness: gap.height };
  }
  const side = Math.abs(x - house.x) <= EPSILON ? "west" : "east";
  return { side, from: y, to: y + gap.height, thickness: gap.width };
}

/** What the town's map draws, as a key: its walls and the gates it opens and marks. */
function townKey(town: TownState): string {
  return [
    town.walls.map((w) => w.entity_id).join(","),
    (town.gates ?? []).map((g) => `${g.destination}@${g.position.x},${g.position.y}/${g.range}`).join(","),
  ].join("|");
}

/** The town's map from a hub state's walls and gates, and the town's size (§B.5–§B.9). */
export function townMap(town: TownState, size: WorldSize): MinimapPicture {
  const houses = housesFrom(town.walls);
  const gaps = doorGaps(town.walls);
  const buildings = houses.map((house) => ({
    house,
    doors: gaps.filter((g) => g.houseId === house.id).map((g) => doorOf(g, house)),
  }));
  return {
    key: townKey(town),
    ground: [
      [
        { x: 0, y: 0 },
        { x: size.width, y: 0 },
        { x: size.width, y: size.height },
        { x: 0, y: size.height },
      ],
    ],
    // every building's footprint, its doors as deep as the wall or as reads on the map (§B.9)
    solids: (k) =>
      buildings.map(({ house, doors }) =>
        footprint(house, doors, Math.max(0, ...doors.map((d) => notchDepth(d.thickness, k)))),
      ),
    lines: edgeRuns(size, roadGaps(size, town.gates ?? [])),
    marks: [],
  };
}
