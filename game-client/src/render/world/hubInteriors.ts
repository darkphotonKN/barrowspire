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
import { WORLD_PX_PER_TILE, type Point, type Rect } from "@/render/iso/projection";
import type { WallState } from "@/types/gameState";
import { housesFrom, onOutline, type House } from "./houses";
import type { PropSpot } from "./hubKeepOut";
import { CHAPEL_WALLS, TIMBER_WALLS, unlitSheets, type FixedKinds, type VariantTable, type WallSheets } from "./walls";

/**
 * Whether a wall is a furnishing of its house: it touches none of the house's four outer edges
 * (FS-B0H2D R12, R19). A building wall always lies along one, the two segments either side of a
 * door gap included (the south wall's, or the east wall's for an east door, FS-R4MYX R6), and a
 * partition reaches two of them end on.
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

export type FurnishingKind = "long_table" | "hall_hearth" | "counter" | "table" | "forge" | "pew" | "altar";

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

/** A chapel pew: 20 × 100, long along y, low enough to see over (FS-R4MYX R12, owner feedback F1). */
function pew(x: number, y: number): Furnishing {
  return { kind: "pew", rect: { x, y, width: 20, height: 100 }, sheet: "pew", tall: false };
}

/**
 * The furnishings, from hub_map.go in its order: the Inn's long table (running north–south down
 * the great hall) and the hearth built into the great hall's north wall at its head, then the
 * taproom's counter (running north–south, its front to the west) and two tables, then the
 * smithy's forge, then the chapel's six pews (long along y, backs to the east: three north of the
 * aisle, three south) and its altar (FS-R4MYX R12). Each prop is baked to its rect (tools/bake/page/models/interior.js, hall.js, chapel.js),
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
  pew(1310, 1170),
  pew(1380, 1170),
  pew(1450, 1170),
  pew(1310, 1370),
  pew(1380, 1370),
  pew(1450, 1370),
  // `chapel_altar`, never `altar`: that sheet is the run's Altar of Consecration
  { kind: "altar", rect: { x: 1120, y: 1280, width: 30, height: 80 }, sheet: "chapel_altar", tall: false },
];

/**
 * The Inn's footprint (hub_map.go hubBuildings), held to the golden by `hubInteriors.test.ts`:
 * how the scene knows which house is the Inn, the walls naming no building.
 */
export const HUB_INN: Rect = { x: 230, y: 50, width: 640, height: 440 };

/**
 * The chapel's footprint (hub_map.go hubBuildings; FS-R4MYX R2–R4), held to the golden by
 * `hubInteriors.test.ts`: how the scene knows which house is the chapel, as `HUB_INN` the Inn.
 */
export const HUB_CHAPEL: Rect = { x: 960, y: 1100, width: 620, height: 440 };

/** Whether a house stands on exactly this footprint. */
const standsOn = (house: House, at: Rect): boolean =>
  house.x === at.x && house.y === at.y && house.width === at.width && house.height === at.height;

/** Whether a house is the Inn: its footprint is the Inn's, exactly. */
export function isInn(house: House): boolean {
  return standsOn(house, HUB_INN);
}

/** Whether a house is the chapel: its footprint is the chapel's, exactly. */
export function isChapel(house: House): boolean {
  return standsOn(house, HUB_CHAPEL);
}

/** The Inn's floor: planks, where the flagstone of the other houses would be. */
export const INN_FLOOR = "ground_plank_floor";

/**
 * The Inn's walls: timber like the town's, with no torch and no lit window inside, so its great
 * hall and taproom are lit by their hearth, candelabra and lanterns alone, the corners left in
 * shadow.
 */
const INN_WALLS = unlitSheets(TIMBER_WALLS);

/**
 * The roof a town building wears: the set its pieces are drawn from (`planRoof`'s prefix) and
 * whether a chimney stands on it (FS-KYPQ9 §A.6).
 */
export interface RoofSet {
  /** Before every roof sheet name: `""` for the town's `roof_` set, `"chapel_"` for the chapel's slate. */
  prefix: string;
  chimney: boolean;
}

/** The town's shingle roof with its chimney: what a house wears unless its look names another. */
export const TOWN_ROOF: RoofSet = { prefix: "", chimney: true };

/**
 * How a town building is built: the sheets its walls are cut in, its roof set, and its own floor
 * if it has one.
 */
export interface TownHouseLook {
  sheets: WallSheets;
  /** The floor sheet under it; absent, the town's flagstone. */
  floor?: string;
  /** Its roof: `TOWN_ROOF`, or the set its own look names. */
  roof: RoofSet;
  /** The kinds its walls fix by where each piece stands (FS-R4MYX W1); absent, every piece's kind is hashed. */
  fixed?: FixedKinds;
}

const INN_LOOK: TownHouseLook = { sheets: INN_WALLS, floor: INN_FLOOR, roof: TOWN_ROOF };
const TOWN_LOOK: TownHouseLook = { sheets: TIMBER_WALLS, roof: TOWN_ROOF };
// CHAPEL_LOOK stands after HUB_INDOOR_DRESSING: the kinds its walls fix read the hung dressing

/**
 * A town building's look, the scene asks per house: the Inn's unlit timber and plank floor, the
 * chapel's own material and slate roof on flagstone, and plain timber on flagstone for every
 * other house.
 */
export function townHouseLook(house: House): TownHouseLook {
  if (isInn(house)) return INN_LOOK;
  if (isChapel(house)) return CHAPEL_LOOK;
  return TOWN_LOOK;
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
/**
 * The chapel's old wooden crucifix, hung on a west wall's inner face, facing east (FS-R4MYX W9,
 * W12): 2 px off the face as a painting hangs, its 40 px along the wall.
 */
const crucifix = (x: number, y: number): IndoorSpot => ({
  sheet: "chapel_crucifix",
  at: { x, y },
  r: 2,
  size: [4, 40],
  animation: "e",
});
/** A faded fresco on a west wall's inner face, facing east: index 0 the saint, 1 the dead rising (W10, W12). */
const mural = (x: number, y: number, index: number): IndoorSpot => ({
  sheet: "chapel_mural",
  at: { x, y },
  r: 2,
  size: [4, 64],
  animation: "e",
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
 * off the partition and off its door's threshold (a gap-wide strip 80 px in on its door face), and
 * off every furnishing unless it lies flat: a rug or the chapel's dais is floor, and a furnishing
 * may stand on it (FS-R4MYX R14). Shelves and wall-hung pieces stand on the wall face they back onto. A patron stands at a
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
  // the chapel (960, 1100, 620 × 440, its door east; FS-R4MYX R14): the altar's stone dais laid
  // flat at the west end, the lectern by its north-east corner, and a candelabra either side of
  // the altar, the room's only lights (R15); the Confessor stands on the floor east of the dais.
  // Behind him on the west wall, on the aisle's line, the crucifix, with a fresco either side of
  // it, the saint to the north and the dead rising to the south (W12); none of them lit (W14)
  { sheet: "dais", at: { x: 1105, y: 1320 }, r: 65, size: [130, 200], flat: true },
  { sheet: "lectern", at: { x: 1190, y: 1250 }, r: 10, size: [20, 20] },
  candelabra(1135, 1250),
  candelabra(1135, 1390),
  crucifix(982, 1320),
  mural(982, 1210, 0),
  mural(982, 1430, 1),
];

/**
 * The x of each of the nave's six bays (FS-R4MYX §Change: the chapel's windows match inside and
 * out, W3, W4): a lancet on the south wall's outward face and one at the same x on the north
 * wall's inner face, so the windows face each other across the nave. The pieces stand at
 * 980 + 40k; the six mirror about the wall's middle (x 1270) to within half a tile, and none stands
 * on the corner post's piece (980) or the trimmed one (1580) (W2).
 */
export const CHAPEL_NAVE_LANCETS: readonly number[] = [1060, 1140, 1220, 1300, 1380, 1460];

/**
 * The y of the east wall's lancets, one each side of the door gap (1280–1360) and mirrored about
 * its centre to within half a tile (W5): clear of the post pieces (1120, 1380) and the trimmed
 * ones (1280, 1540), and as far as that leaves from the belfry (1635, 1220) and the wayside cross
 * (1635, 1480) on screen, which stand in front of the pieces at about y 1160 and 1420.
 */
export const CHAPEL_EAST_LANCETS: readonly number[] = [1200, 1460];

const T = WORLD_PX_PER_TILE;
/** The chapel's west wall's inner face: what its hung dressing stands on. */
const CHAPEL_WEST_FACE = HUB_CHAPEL.x + 20;

/**
 * The y of the west wall's pieces behind its hung dressing (W6), from `HUB_INDOOR_DRESSING`: each
 * piece (one tile of the west wall from the chapel's north edge, as the wall is cut) whose 40 px
 * along the wall overlaps the footprint of something standing on the wall's inner face in the
 * chapel, the crucifix and the murals. They are plain, so no pilaster shows through a hung piece.
 */
export const CHAPEL_WEST_BEHIND_HUNG: readonly number[] = (() => {
  const hung = HUB_INDOOR_DRESSING.filter(
    (s) => s.at.x - s.size[0] / 2 <= CHAPEL_WEST_FACE && s.at.y > HUB_CHAPEL.y && s.at.y < HUB_CHAPEL.y + HUB_CHAPEL.height,
  );
  const pieces = Array.from({ length: Math.ceil(HUB_CHAPEL.height / T) }, (_, k) => HUB_CHAPEL.y + (k + 0.5) * T);
  return pieces.filter((y) => hung.some((s) => y - T / 2 < s.at.y + s.size[1] / 2 && s.at.y - s.size[1] / 2 < y + T / 2));
})();

const PLAIN_ONLY: VariantTable = [[100, "plain"]];

/**
 * The kinds the chapel's walls fix (W1–W7), as data: its bays on the south outward face, lancet
 * and buttress alternating, a buttress outside the first and last lancet and every other piece
 * plain; a lancet on the north inner face at each south lancet's x, its other pieces plain or
 * pillar as hashed; a lancet each side of the door on the east outward face, the rest plain; and
 * plain on the west inner face behind the hung dressing, no lancet anywhere on it. The cut-away
 * south and east fronts are named nowhere, so they keep their plain-or-pillar table and never
 * carry a lancet (W7).
 */
function chapelFixedKinds(): FixedKinds {
  const named = (at: readonly number[], kind: string) => at.map((x) => [x, kind] as const);
  const buttresses = [...new Set(CHAPEL_NAVE_LANCETS.flatMap((x) => [x - T, x + T]))];
  return {
    outward: {
      south: {
        at: Object.fromEntries([...named(buttresses, "buttress"), ...named(CHAPEL_NAVE_LANCETS, "lancet")]),
        rest: PLAIN_ONLY,
      },
      east: { at: Object.fromEntries(named(CHAPEL_EAST_LANCETS, "lancet")), rest: PLAIN_ONLY },
    },
    back: {
      north: { at: Object.fromEntries(named(CHAPEL_NAVE_LANCETS, "lancet")) },
      west: { at: Object.fromEntries(named(CHAPEL_WEST_BEHIND_HUNG, "plain")) },
    },
  };
}

/**
 * The chapel (FS-R4MYX R23, R42): its own whitewashed walls (`CHAPEL_WALLS`, unlit and capless) on
 * the town's flagstone, under its own slate roof with no chimney (a church has no hearth to vent).
 * Its age is baked into the sheets, never tinted over them (owner feedback F6: a tint greyed the
 * white walls). Its walls fix their bays and the plain wall behind the hung dressing (W1–W7).
 */
const CHAPEL_LOOK: TownHouseLook = {
  sheets: CHAPEL_WALLS,
  roof: { prefix: "chapel_", chimney: false },
  fixed: chapelFixedKinds(),
};

/**
 * What a fixed resident faces (FS-R4MYX R26): a furnishing of a kind, a grave in the graveyard
 * (hubGraveyard.ts), which is dressing, not a furnishing, or their building's street door.
 */
export type FacedThing = FurnishingKind | "grave" | "door";

/**
 * The fixed residents (hub_map.go hubFixedResidents): where they stand, the facing the client
 * keeps for them by name (R25), and what they face: a furnishing kind that is one of its kind in
 * town, a grave, or the door. A fixed resident never moves, so their facing cannot come from
 * movement. The chapel's Confessor stands in front of the dais and faces east down the aisle to
 * the door, its worshippers west to the altar and the graveyard's mourners west to their graves
 * (FS-R4MYX R17, R26).
 */
export const HUB_FIXED_RESIDENTS: { name: string; at: Point; facing: Facing8; faces: FacedThing }[] = [
  { name: "Alewife", at: { x: 765, y: 260 }, facing: "w", faces: "counter" },
  { name: "Drover", at: { x: 418, y: 223 }, facing: "w", faces: "long_table" },
  { name: "Gravedigger", at: { x: 418, y: 319 }, facing: "w", faces: "long_table" },
  { name: "Pilgrim", at: { x: 336, y: 271 }, facing: "e", faces: "long_table" },
  { name: "Smith", at: { x: 1630, y: 175 }, facing: "n", faces: "forge" },
  { name: "Confessor", at: { x: 1205, y: 1320 }, facing: "e", faces: "door" },
  { name: "Penitent", at: { x: 1355, y: 1255 }, facing: "w", faces: "altar" },
  { name: "Chandler", at: { x: 1425, y: 1255 }, facing: "w", faces: "altar" },
  { name: "Goodwife", at: { x: 1285, y: 1385 }, facing: "w", faces: "altar" },
  { name: "Ploughman", at: { x: 1355, y: 1385 }, facing: "w", faces: "altar" },
  { name: "Keener", at: { x: 520, y: 1320 }, facing: "w", faces: "grave" },
  { name: "Widower", at: { x: 500, y: 1200 }, facing: "w", faces: "grave" },
  { name: "Veteran", at: { x: 300, y: 1380 }, facing: "w", faces: "grave" },
];

/** A fixed resident's facing by name; undefined for anyone else, who keeps the default. */
export function residentFacing(name: string): Facing8 | undefined {
  return HUB_FIXED_RESIDENTS.find((r) => r.name === name)?.facing;
}
