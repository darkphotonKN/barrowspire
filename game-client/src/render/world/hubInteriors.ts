/**
 * The town buildings' interiors (FS-B0H2D §C R15, §E R19–R26): which broadcast walls are
 * furnishings and what prop each one is, which is the Inn's partition, the indoor dressing and the
 * fixed residents' facing. Who the roof hides is the one hide rule in `indoors.ts` (FS-9PN7X §C.1).
 *
 * The furnishings and the fixed residents are server facts, copied here from
 * game-server/game-service/internal/game/hub_map.go (hubBuildings' Furnishings,
 * hubFixedResidents) the way hubKeepOut.ts copies the town's footprints (R23). Both sides are
 * held to one checked-in golden, `hubTown.golden.json` (see hubTownGolden.ts): hub_map.go by
 * internal/game/hub_town_golden_test.go, these copies by `hubInteriors.test.ts`. A server change
 * goes red in Go until the golden is rewritten (`-update`), then red here until this follows. The
 * scene draws whatever walls arrive: a furnishing with no entry here still stands, as a
 * placeholder block, and `placeholderWarning` says so in the console (R19).
 *
 * Pure data and maths, no Phaser.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Facing8 } from "@/render/iso/facing";
import type { Point, Rect } from "@/render/iso/projection";
import type { WallState } from "@/types/gameState";
import { housesFrom, onOutline, type House } from "./houses";
import type { PropSpot } from "./hubKeepOut";
import { TIMBER_WALLS, unlitSheets, type WallSheets } from "./walls";

/**
 * Whether a wall is a furnishing of its house: it touches none of the house's four outer edges
 * (FS-B0H2D R12, R19). A building wall always lies along one, the south wall's two segments
 * either side of the door gap included, and a partition reaches two of them end on.
 */
export function isFurnishing(wall: WallState, house: House): boolean {
  const { x, y } = wall.position;
  return (
    x > house.x &&
    y > house.y &&
    x + wall.width < house.x + house.width &&
    y + wall.height < house.y + house.height
  );
}

/**
 * Whether a wall is part of a partition dividing its house in two (the Inn's great hall from its
 * taproom): it reaches the house's outer edges, so it is no furnishing, but end on, across the
 * house, so it is not on the outline (`onOutline`) either. Never a cut-away outer wall, never
 * furniture: it is drawn as interior masonry while the player is inside (hub_map.go hubPartition).
 */
export function isPartition(wall: WallState, house: House): boolean {
  return !isFurnishing(wall, house) && !onOutline(wall, house);
}

/**
 * The broadcast walls split: the building walls drawn as wall pieces (each house's outline), its
 * partitions drawn as interior masonry, and the furnishings drawn as furniture (R19). The houses
 * are the ones `housesFrom` builds; a wall with no house is a building wall.
 */
export function splitFurnishings(walls: readonly WallState[]): {
  building: WallState[];
  partitions: WallState[];
  furnishings: WallState[];
} {
  const houses = new Map(housesFrom(walls).map((h) => [h.id, h]));
  const building: WallState[] = [];
  const partitions: WallState[] = [];
  const furnishings: WallState[] = [];
  for (const wall of walls) {
    const house = wall.house_id ? houses.get(wall.house_id) : undefined;
    if (house && isFurnishing(wall, house)) furnishings.push(wall);
    else if (house && isPartition(wall, house)) partitions.push(wall);
    else building.push(wall);
  }
  return { building, partitions, furnishings };
}

/**
 * A partition segment as drawn: inside the walls only. The server runs it from the footprint's
 * edge, through the outer wall it meets, so each end reaching an edge is trimmed back by the
 * wall's own thickness to that wall's inner face; the end at the door gap stands as it is.
 */
export function partitionInside(wall: WallState, house: House): WallState {
  const { x, y } = wall.position;
  const alongY = wall.height > wall.width;
  const thick = alongY ? wall.width : wall.height;
  const [start, length, lo, hi] = alongY
    ? [y, wall.height, house.y, house.y + house.height]
    : [x, wall.width, house.x, house.x + house.width];
  const from = start === lo ? start + thick : start;
  const to = start + length === hi ? start + length - thick : start + length;
  return alongY
    ? { ...wall, position: { x, y: from }, height: to - from }
    : { ...wall, position: { x: from, y }, width: to - from };
}

export type FurnishingKind = "long_table" | "hall_hearth" | "counter" | "table" | "forge";

/** A furnishing as drawn: its server rect, the baked sheet and frame standing on it. */
export interface Furnishing {
  kind: FurnishingKind;
  rect: Rect;
  sheet: string;
  /** The sheet's animation for this rect: the counter's and long table's axis, the Inn table's size. */
  animation?: string;
  /** Tall enough to hide a player: fades over them like any occluder. */
  tall: boolean;
}

/**
 * The furnishings, from hub_map.go in its order: the Inn's long table (running north–south down
 * the great hall) and the hearth built into the great hall's north wall at its head, then the
 * taproom's counter (running north–south, its front to the west) and two tables, then the
 * smithy's forge. Each prop is baked to its rect (tools/bake/page/models/interior.js, hall.js),
 * so it covers what a player collides with and no more; one with no sheet yet stands as the
 * placeholder block (R19).
 */
export const HUB_FURNISHINGS: Furnishing[] = [
  { kind: "long_table", rect: { x: 352, y: 175, width: 50, height: 240 }, sheet: "long_table", animation: "y", tall: false },
  { kind: "hall_hearth", rect: { x: 300, y: 70, width: 144, height: 48 }, sheet: "hall_hearth", tall: true },
  { kind: "counter", rect: { x: 715, y: 190, width: 25, height: 140 }, sheet: "counter", animation: "y", tall: true },
  { kind: "table", rect: { x: 600, y: 130, width: 30, height: 40 }, sheet: "inn_table", animation: "narrow", tall: false },
  { kind: "table", rect: { x: 600, y: 300, width: 45, height: 40 }, sheet: "inn_table", animation: "wide", tall: false },
  { kind: "forge", rect: { x: 1595, y: 120, width: 70, height: 35 }, sheet: "forge", tall: true },
];

/**
 * The Inn's footprint (hub_map.go hubBuildings), held to the golden by `hubInteriors.test.ts`:
 * how the scene knows which house is the Inn, the walls naming no building.
 */
export const HUB_INN: Rect = { x: 230, y: 50, width: 640, height: 440 };

/** Whether a house is the Inn: its footprint is the Inn's, exactly. */
export function isInn(house: House): boolean {
  return (
    house.x === HUB_INN.x &&
    house.y === HUB_INN.y &&
    house.width === HUB_INN.width &&
    house.height === HUB_INN.height
  );
}

/** The Inn's floor: planks, where the flagstone of the other houses would be. */
export const INN_FLOOR = "ground_plank_floor";

/**
 * The Inn's walls: timber like the town's, with no torch and no lit window inside, so its great
 * hall and taproom are lit by their hearth, candelabra and lanterns alone, the corners left in
 * shadow.
 */
const INN_WALLS = unlitSheets(TIMBER_WALLS);

/** How a town building is built: the sheets its walls are cut in, and its own floor if it has one. */
export interface TownHouseLook {
  sheets: WallSheets;
  /** The floor sheet under it; absent, the town's flagstone. */
  floor?: string;
}

/**
 * A town building's look, the scene asks per house: the Inn's unlit timber and plank floor, and
 * plain timber on flagstone for every other house.
 */
export function townHouseLook(house: House): TownHouseLook {
  return isInn(house) ? { sheets: INN_WALLS, floor: INN_FLOOR } : { sheets: TIMBER_WALLS };
}

/** The mirror's entry for a furnishing wall, by its exact rect; undefined when it has none. */
export function furnishingOf(wall: WallState): Furnishing | undefined {
  return HUB_FURNISHINGS.find(
    ({ rect }) =>
      rect.x === wall.position.x &&
      rect.y === wall.position.y &&
      rect.width === wall.width &&
      rect.height === wall.height,
  );
}

/**
 * A warning for each furnishing wall that falls back to the placeholder block because the mirror
 * has no entry for its rect (R19): once per rect, however often its room is drawn. The returned
 * function is what the scene calls on a miss; `warn` is console.warn unless a test passes its own.
 */
export function placeholderWarning(
  warn: (message: string) => void = (message) => console.warn(message),
): (wall: WallState) => void {
  const told = new Set<string>();
  return (wall) => {
    const { x, y } = wall.position;
    const rect = `(${x}, ${y}) ${wall.width} × ${wall.height}`;
    if (told.has(rect)) return;
    told.add(rect);
    warn(
      `Hub furnishing at ${rect} has no HUB_FURNISHINGS entry, so it is drawn as a placeholder block: ` +
        "hubInteriors.ts is behind hub_map.go (check hubTown.golden.json).",
    );
  };
}

/** One piece of indoor dressing: a prop spot with its world footprint, `size` = [w, h] centred on `at`. */
export interface IndoorSpot extends PropSpot {
  size: [number, number];
  /**
   * Laid flat on the floor (a rug): drawn on the floor decal layer under everything standing,
   * never sorted by its footprint, which would draw it over whatever stands on it nearer the back.
   */
  flat?: boolean;
}

const stool = (x: number, y: number, index: number): IndoorSpot => ({
  sheet: "stool",
  at: { x, y },
  r: 12,
  size: [24, 24],
  index,
});
const crate = (x: number, y: number): IndoorSpot => ({ sheet: "crate", at: { x, y }, r: 15, size: [30, 30] });
const barrel = (x: number, y: number): IndoorSpot => ({ sheet: "barrel", at: { x, y }, r: 13, size: [26, 26] });
/** Shelves face south only: their back stands on a north wall's inner face. */
const shelf = (x: number, northFace: number, index: number): IndoorSpot => ({
  sheet: "shelf",
  at: { x, y: northFace + 12 },
  r: 36,
  size: [72, 24],
  index,
  tall: true,
});
/** A hall chair at the long table, facing it (`e` on its west side, `w` on its east). */
const chair = (x: number, y: number, facing: "e" | "w"): IndoorSpot => ({
  sheet: "hall_chair",
  at: { x, y },
  r: 14,
  size: [28, 27],
  animation: facing,
  tall: true,
});
/** A standing candelabra: five candles, one of the great hall's lights. */
const candelabra = (x: number, y: number): IndoorSpot => ({
  sheet: "candelabra",
  at: { x, y },
  r: 15,
  size: [30, 30],
  tall: true,
});
/**
 * A lantern, one of the taproom's lights: `wall_s` hung 13 px off a north wall's inner face,
 * `wall_e` 13 px off a west wall's, `post` on a post standing at the origin. Wall-hung only on a
 * full-height back wall (ADR-0036): the partition is drawn low, so a bracket on it would float.
 */
const lantern = (x: number, y: number, mount: "wall_s" | "wall_e" | "post"): IndoorSpot => ({
  sheet: "lantern",
  at: { x, y },
  r: 8,
  size: [16, 16],
  animation: mount,
  tall: mount === "post",
});
/** A dark oil painting hung on a wall face: `s` on a north wall, `e` on a west wall. */
const painting = (x: number, y: number, facing: "s" | "e", index: number): IndoorSpot => ({
  sheet: "painting",
  at: { x, y },
  r: 2,
  size: facing === "s" ? [40, 4] : [4, 40],
  animation: facing,
  index,
});
const plant = (x: number, y: number, index: number): IndoorSpot => ({
  sheet: "potted_plant",
  at: { x, y },
  r: 13,
  size: [26, 26],
  index,
});
/** A chest with its back on a wall: `s` against a north wall, `e` against a west wall. */
const chest = (x: number, y: number, facing: "s" | "e", index: number): IndoorSpot => {
  const [w, d] = index === 0 ? [57, 29] : [50, 28];
  return {
    sheet: "hall_chest",
    at: { x, y },
    r: 14,
    size: facing === "s" ? [w, d] : [d, w],
    animation: facing,
    index,
  };
};
/** A keg on its cradle (index 0) or three on a rack (index 1), head and tap to the south. */
const keg = (x: number, y: number, index: number): IndoorSpot => ({
  sheet: "keg",
  at: { x, y },
  r: 17,
  size: index === 0 ? [34, 34] : [54, 36],
  animation: "s",
  index,
});

/**
 * Indoor dressing (R15): no collision, never interactable, each inside its house's inner area,
 * off every furnishing and the partition, and off its door's threshold (a gap-wide strip 80 px
 * in). Shelves and wall-hung pieces stand on the wall face they back onto. A patron stands at a
 * chair or stool beside the table they keep to (R26).
 */
export const HUB_INDOOR_DRESSING: IndoorSpot[] = [
  // the Inn's great hall (inner 250–505 × 70–470, west of the partition): five chairs a side at
  // the long table, 48 px apart as the table's places are baked, a candelabra at its foot and one
  // in the west aisle, dark paintings on the walls, plants in two corners, and a runner down the
  // east aisle from the partition's door
  chair(336, 199, "e"),
  chair(336, 247, "e"),
  chair(336, 295, "e"),
  chair(336, 343, "e"),
  chair(336, 391, "e"),
  chair(418, 199, "w"),
  chair(418, 247, "w"),
  chair(418, 295, "w"),
  chair(418, 343, "w"),
  chair(418, 391, "w"),
  candelabra(377, 442),
  candelabra(285, 295),
  painting(275, 72, "s", 1),
  painting(252, 200, "e", 0),
  painting(252, 400, "e", 2),
  plant(272, 448, 0),
  plant(485, 92, 1),
  { sheet: "rug", at: { x: 468, y: 270 }, r: 36, size: [72, 120], animation: "y", index: 1, flat: true },
  // the Inn's taproom (inner 525–850 × 70–470, east of the partition, the street door in its
  // south-west corner): stools at both tables and along the bar, kegs racked behind it on the north
  // wall and one at its foot, a chest on the north wall and one backed onto the partition, and
  // three lanterns: one on the north wall, one on a post between the door and the partition's
  // door, one on a post at the bar's foot
  stool(582, 150, 0),
  stool(648, 150, 1),
  stool(582, 320, 1),
  stool(663, 320, 0),
  stool(697, 215, 0),
  stool(697, 305, 1),
  keg(800, 90, 1),
  keg(752, 89, 0),
  keg(815, 420, 0),
  chest(558, 86, "s", 0),
  chest(541, 180, "e", 1),
  lantern(680, 83, "wall_s"),
  lantern(555, 345, "post"),
  lantern(727, 360, "post"),
  // the Quartermaster's store (1130, 150, 300 × 240): shelves on the back wall either side of
  // him, stock in the front corners
  shelf(1200, 170, 0),
  shelf(1360, 170, 1),
  crate(1174, 346),
  barrel(1174, 304),
  crate(1388, 344),
  // the smithy (1480, 50, 300 × 240): the anvil beside the forge, crates and a barrel in the corners
  { sheet: "anvil", at: { x: 1700, y: 140 }, r: 24, size: [48, 30] },
  crate(1528, 96),
  crate(1734, 242),
  barrel(1526, 242),
];

/**
 * The fixed residents (hub_map.go hubFixedResidents): where they stand, the facing the client
 * keeps for them by name (R25), and the kind of furnishing they face, one of a kind in town. A
 * fixed resident never moves, so their facing cannot come from movement.
 */
export const HUB_FIXED_RESIDENTS: { name: string; at: Point; facing: Facing8; faces: FurnishingKind }[] = [
  { name: "Alewife", at: { x: 765, y: 260 }, facing: "w", faces: "counter" },
  { name: "Drover", at: { x: 418, y: 223 }, facing: "w", faces: "long_table" },
  { name: "Gravedigger", at: { x: 418, y: 319 }, facing: "w", faces: "long_table" },
  { name: "Pilgrim", at: { x: 336, y: 271 }, facing: "e", faces: "long_table" },
  { name: "Smith", at: { x: 1630, y: 175 }, facing: "n", faces: "forge" },
];

/** A fixed resident's facing by name; undefined for anyone else, who keeps the default. */
export function residentFacing(name: string): Facing8 | undefined {
  return HUB_FIXED_RESIDENTS.find((r) => r.name === name)?.facing;
}
