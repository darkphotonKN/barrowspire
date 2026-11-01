/**
 * The town buildings' interiors (FS-B0H2D §C R15, §E R19–R26): which broadcast walls are
 * furnishings and what prop each one is, the indoor dressing and the fixed residents' facing. Who
 * the roof hides is the one hide rule in `indoors.ts` (FS-9PN7X §C.1).
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
import { housesFrom, type House } from "./houses";
import type { PropSpot } from "./hubKeepOut";

/**
 * Whether a wall is a furnishing of its house: it touches none of the house's four outer edges
 * (FS-B0H2D R12, R19). A building wall always lies along one, the south wall's two segments
 * either side of the door gap included.
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
 * The broadcast walls split: the building walls drawn as wall pieces, and the furnishings drawn
 * as furniture (R19). The houses are the ones `housesFrom` builds; a wall with no house is a
 * building wall.
 */
export function splitFurnishings(walls: readonly WallState[]): {
  building: WallState[];
  furnishings: WallState[];
} {
  const houses = new Map(housesFrom(walls).map((h) => [h.id, h]));
  const building: WallState[] = [];
  const furnishings: WallState[] = [];
  for (const wall of walls) {
    const house = wall.house_id ? houses.get(wall.house_id) : undefined;
    (house && isFurnishing(wall, house) ? furnishings : building).push(wall);
  }
  return { building, furnishings };
}

export type FurnishingKind = "counter" | "table" | "forge";

/** A furnishing as drawn: its server rect, the baked sheet and frame standing on it. */
export interface Furnishing {
  kind: FurnishingKind;
  rect: Rect;
  sheet: string;
  /** The sheet's animation for this rect: the counter's axis, the Inn table's size. */
  animation?: string;
  /** Tall enough to hide a player: fades over them like any occluder. */
  tall: boolean;
}

/**
 * The furnishings, from hub_map.go in its order: the Inn's counter (running north–south, its
 * front to the west) and three tables, then the smithy's forge. Each prop is baked to its rect
 * (tools/bake/page/models/interior.js), so it covers what a player collides with and no more.
 */
export const HUB_FURNISHINGS: Furnishing[] = [
  { kind: "counter", rect: { x: 715, y: 190, width: 25, height: 140 }, sheet: "counter", animation: "y", tall: true },
  { kind: "table", rect: { x: 540, y: 185, width: 30, height: 40 }, sheet: "inn_table", animation: "narrow", tall: false },
  { kind: "table", rect: { x: 540, y: 285, width: 30, height: 40 }, sheet: "inn_table", animation: "narrow", tall: false },
  { kind: "table", rect: { x: 620, y: 240, width: 45, height: 40 }, sheet: "inn_table", animation: "wide", tall: false },
  { kind: "forge", rect: { x: 225, y: 120, width: 70, height: 35 }, sheet: "forge", tall: true },
];

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

/**
 * Indoor dressing (R15): no collision, never interactable, each inside its house's inner area,
 * off every furnishing and off its door's threshold (a gap-wide strip 80 px in). The hearth and
 * shelves face south only, so they stand against a north wall. A patron stands at a stool beside
 * their table (R26).
 */
export const HUB_INDOOR_DRESSING: IndoorSpot[] = [
  // the Inn (470, 110, 400 × 300): its hearth on the north wall between the tables and the
  // counter, two stools to a table, barrels at the counter's back
  { sheet: "inn_hearth", at: { x: 610, y: 148 }, r: 48, size: [96, 36], tall: true },
  stool(522, 205, 0),
  stool(584, 197, 1),
  stool(522, 305, 1),
  stool(584, 323, 0),
  stool(667, 215, 0),
  stool(642, 298, 1),
  barrel(826, 160),
  barrel(826, 366),
  // the Quartermaster's store (1130, 150, 300 × 240): shelves on the back wall either side of
  // him, stock in the front corners
  shelf(1200, 170, 0),
  shelf(1360, 170, 1),
  crate(1174, 346),
  barrel(1174, 304),
  crate(1388, 344),
  // the smithy (110, 50, 300 × 240): the anvil beside the forge, crates and a barrel in the corners
  { sheet: "anvil", at: { x: 330, y: 140 }, r: 24, size: [48, 30] },
  crate(158, 96),
  crate(364, 242),
  barrel(156, 242),
];

/**
 * The fixed residents (hub_map.go hubFixedResidents): where they stand, the facing the client
 * keeps for them by name (R25), and the furnishing they face, by its index in HUB_FURNISHINGS.
 * A fixed resident never moves, so their facing cannot come from movement.
 */
export const HUB_FIXED_RESIDENTS: { name: string; at: Point; facing: Facing8; faces: number }[] = [
  { name: "Alewife", at: { x: 765, y: 260 }, facing: "w", faces: 0 },
  { name: "Drover", at: { x: 590, y: 220 }, facing: "w", faces: 1 },
  { name: "Gravedigger", at: { x: 590, y: 300 }, facing: "w", faces: 2 },
  { name: "Pilgrim", at: { x: 643, y: 220 }, facing: "s", faces: 3 },
  { name: "Smith", at: { x: 260, y: 175 }, facing: "n", faces: 4 },
];

/** A fixed resident's facing by name; undefined for anyone else, who keeps the default. */
export function residentFacing(name: string): Facing8 | undefined {
  return HUB_FIXED_RESIDENTS.find((r) => r.name === name)?.facing;
}
