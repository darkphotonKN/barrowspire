/**
 * The town's map (FS-P0HSP §B; CONTEXT.md "Minimap"): drawn whole from the first moment, from what
 * a hub state carries and the town's size. Its ground is the town's whole diamond; its edge the
 * walls' line, open at a road gap where each gate leads away (the town has no boundary walls: its
 * edge is the server's movement clamp); each town building a solid footprint in the walls' ink,
 * its doors cut open, nothing of its inside drawn. Pure: the minimap draws what this returns.
 */

import { doorGaps, type DoorGap } from "@/render/world/buildingLooks";
import { housesFrom, type House } from "@/render/world/houses";
import { HUB_STASH_CHEST } from "@/render/world/hubStash";
import type { GateState, NPCState, WallState } from "@/types/gameState";
import { WORLD_MARKS, type MapMarkKind, type MinimapMark, type MinimapPicture } from "./minimap";
import { edgeRuns, footprint, notchDepth, roadGaps, type FootprintDoor, type WorldSize } from "./worldMap";

/** What of a hub state the town's map is built from. */
export interface TownState {
  walls: readonly WallState[];
  gates?: readonly Pick<GateState, "entity_id" | "destination" | "position" | "range">[];
  /** Its residents; only those with a function are marked (§C.14, §C.15). */
  npcs?: readonly Pick<NPCState, "function" | "position">[];
}

/**
 * A function NPC's glyph (§C.14): the Quartermaster's bag; none for the Elder, who only tells a
 * story (Nick, 2026-11-12: "只是講故事的 NPC 不需要在地圖上標"); a lozenge for any other.
 */
const NPC_MARK = new Map<string, MapMarkKind | null>([
  ["storekeeper", "bag"],
  ["storyteller", null],
]);

/** The glyph an NPC with `fn` is marked with, or none: an ambient resident (`""`) or the Elder. */
function npcMark(fn: string): MapMarkKind | null {
  if (fn === "") return null;
  return NPC_MARK.has(fn) ? (NPC_MARK.get(fn) ?? null) : "lozenge";
}

/**
 * The town's marks (§C.14, §C.15), in {@link WORLD_MARKS}' order: a tower at the Spire's gate, a
 * teleport mark at every other gate given (the build's own, `gatesInThisBuild`), a chest at the
 * stash chest, and each function NPC's glyph where they stand. An ambient resident, the Elder, a
 * building, the mailbox, the market and the dressing are not marked.
 */
function townMarks(town: TownState): MinimapMark[] {
  const at = (p: { x: number; y: number }) => ({ x: p.x, y: p.y });
  const marks: MinimapMark[] = [
    ...(town.gates ?? []).map((g) => ({ kind: g.destination === "spire" ? ("tower" as const) : ("teleport" as const), at: at(g.position) })),
    { kind: "chest", at: at(HUB_STASH_CHEST.at) },
    ...(town.npcs ?? []).flatMap((n) => {
      const kind = npcMark(n.function);
      return kind ? [{ kind, at: at(n.position) }] : [];
    }),
  ];
  const order = (k: MapMarkKind) => (WORLD_MARKS as readonly string[]).indexOf(k);
  return marks.map((m, i) => ({ m, i })).sort((a, b) => order(a.m.kind) - order(b.m.kind) || a.i - b.i).map(({ m }) => m);
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

/**
 * What the town's map is built from, as a key, read without building it: its walls, its gates
 * (which open the road gaps and carry the gates' marks), and its marked NPCs, each by its function
 * and place. A resident walking, or the Elder, changes nothing.
 */
function townKey(town: TownState): string {
  let npcs = "";
  for (const n of town.npcs ?? []) if (npcMark(n.function)) npcs += `${n.function}@${n.position.x},${n.position.y};`;
  return [
    town.walls.map((w) => w.entity_id).join(","),
    (town.gates ?? []).map((g) => `${g.destination}@${g.position.x},${g.position.y}/${g.range}`).join(","),
    npcs,
  ].join("|");
}

/** The town's map from a hub state's walls and gates, and the town's size (§B.5–§B.9). */
export function townMap(town: TownState, size: WorldSize): MinimapPicture {
  return buildTownMap(town, size, townKey(town));
}

function buildTownMap(town: TownState, size: WorldSize, key: string): MinimapPicture {
  const houses = housesFrom(town.walls);
  const gaps = doorGaps(town.walls);
  const marks = townMarks(town);
  const buildings = houses.map((house) => ({
    house,
    doors: gaps.filter((g) => g.houseId === house.id).map((g) => doorOf(g, house)),
  }));
  return {
    key,
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
    marks,
  };
}

/**
 * The town's map, built only when what it is built from changes (§A.4, §C.20): a hub state every
 * 33 ms with the same walls, gates and marked NPCs is handed the plan already built, for a compare
 * of the arrays, or of a short key where a broadcast brought them anew; nothing is built.
 */
export class TownPlan {
  private last?: { walls: TownState["walls"]; gates: TownState["gates"]; npcs: TownState["npcs"]; picture: MinimapPicture };

  constructor(private readonly size: WorldSize) {}

  /** The town's map for `town`: the one last built where nothing it is built from changed. */
  of(town: TownState): MinimapPicture {
    const last = this.last;
    if (last && last.walls === town.walls && last.gates === town.gates && last.npcs === town.npcs) return last.picture;
    const key = townKey(town);
    const picture = last?.picture.key === key ? last.picture : buildTownMap(town, this.size, key);
    this.last = { walls: town.walls, gates: town.gates, npcs: town.npcs, picture };
    return picture;
  }
}
