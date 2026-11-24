/**
 * The graveyard screen-left of the chapel, and the belfry and the wayside cross by its door
 * (FS-R4MYX §F R27–R30, §I R41):
 * dressing, placed by data and drawn like the town's other dressing, with no collision. Every
 * piece clears the keep-out rule K1–K8, stands inside the enclosure the low wall bounds, keeps
 * clear of the mourners the server stands among the graves (`hubGraveyard.test.ts`), and lies
 * where no town building's roof is drawn over it (R39, `hubCover.test.ts`): far enough west and
 * south of the chapel that the owner sees every stone (owner feedback F3).
 *
 * Graves lie in four north–south rows, oldest west, each stone at its grave's west end facing
 * east; the fresh earth lies in the newest rows, by the gap in the south-east corner, toward the
 * path. No light, no sound (R33): the graveyard is lit by the town's ambient alone.
 *
 * Pure data and maths, no Phaser.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point } from "@/render/iso/projection";
import { tileHash } from "./ground";
import { fenceSegments, type FenceRun, type PropSpot } from "./hubKeepOut";

/** The ground the low wall bounds: x 40–580, y 1020–1520 (R28), about twice the first one's. */
export const GRAVEYARD_ENCLOSURE = { x: 40, y: 1020, width: 540, height: 500 } as const;

/** A graveyard piece: a prop spot that may sort by another point than its own (flowers on a mound). */
export interface GraveyardPiece extends PropSpot {
  /** Where it sorts, when not its own footprint: what it lies on. */
  depthAt?: Point;
  /** The sub-layer over what it lies on. */
  layer?: number;
}

/** The headstone sheet's animations, by the stone's state. */
type StoneState = "intact" | "weathered" | "broken";

/** A headstone's frame within its state, as the bake orders them (models/chapel.js HEADSTONES). */
const ROUNDED = 0;
const GOTHIC = 1;
const CRACKED = 0;
const LEANING = 1;
const CHIPPED = 2;
const STUMP = 0;
const SNAPPED = 1;

/** A headstone's footprint: half its 26 px width. */
const STONE_R = 13;
/** A posy's footprint, within 16 × 16. */
const FLOWERS_R = 8;
/** A fresh mound, 50 × 28 along x: the square that holds it. */
const MOUND_R = 25;
/** How far east of its row's stone line a mound is centred, and its posy laid. */
const MOUND_EAST = 25;
const FLOWERS_EAST = 18;

/** The rows' stone lines: A the oldest, D the newest, by the gap. */
const A = 140;
const B = 240;
const C = 340;
const D = 440;

const stone = (x: number, y: number, state: StoneState, index: number): GraveyardPiece => ({
  sheet: "headstone",
  at: { x, y },
  r: STONE_R,
  animation: state,
  index,
});

const mound = (x: number, y: number): GraveyardPiece => ({
  sheet: "grave_mound",
  at: { x: x + MOUND_EAST, y },
  r: MOUND_R,
});

/** A posy laid east of a grave's head; on a mound it sorts over the mound's earth. */
const flowers = (x: number, y: number, state: "fresh" | "withered", on?: GraveyardPiece): GraveyardPiece => ({
  sheet: "grave_flowers",
  at: { x: x + FLOWERS_EAST, y },
  r: FLOWERS_R,
  animation: state,
  ...(on && { depthAt: on.at, layer: 1 }),
});

/** The fresh mounds: one in row C, two in row D, the Keener's at D5. */
const MOUND_C4 = mound(C, 1260);
const MOUND_D4 = mound(D, 1260);
const MOUND_D5 = mound(D, 1320);

/** A tree's trunk, for the keep-out rule: the crown overhangs, the trunk stands. */
const TRUNK = 14;
/** A stone cross's footprint, within 36 × 36. */
const CROSS_R = 18;

/**
 * The graveyard (R28): four rows of seven grave slots, y 1080 to 1440 a step of 60, one left
 * empty; 24 headstones (10 intact, 9 weathered, 5 broken, the broken ones in the two old rows),
 * 3 fresh mounds, flowers at 6 graves (4 fresh, 2 withered), 2 stone crosses and 3 dead trees
 * along the old west side and the north wall. The Veteran stands at B6's withered flowers, the
 * Widower at D3's fresh ones, the Keener at the mound D5.
 */
export const HUB_GRAVEYARD: GraveyardPiece[] = [
  // row A, the oldest
  stone(A, 1080, "broken", STUMP),
  stone(A, 1140, "weathered", LEANING),
  stone(A, 1200, "intact", ROUNDED),
  stone(A, 1260, "broken", SNAPPED),
  stone(A, 1320, "weathered", CRACKED),
  stone(A, 1380, "intact", GOTHIC),
  stone(A, 1440, "weathered", CHIPPED),
  // row B
  stone(B, 1080, "intact", GOTHIC),
  stone(B, 1140, "broken", STUMP),
  stone(B, 1200, "weathered", CRACKED),
  stone(B, 1260, "intact", ROUNDED),
  stone(B, 1320, "broken", SNAPPED),
  stone(B, 1380, "weathered", LEANING),
  flowers(B, 1380, "withered"),
  stone(B, 1440, "broken", STUMP),
  // row C
  stone(C, 1080, "intact", ROUNDED),
  stone(C, 1140, "weathered", CHIPPED),
  flowers(C, 1140, "withered"),
  stone(C, 1200, "intact", GOTHIC),
  MOUND_C4,
  stone(C, 1320, "weathered", LEANING),
  stone(C, 1380, "intact", ROUNDED),
  flowers(C, 1380, "fresh"),
  // row D, the newest, by the gap
  stone(D, 1080, "intact", GOTHIC),
  stone(D, 1140, "weathered", CRACKED),
  stone(D, 1200, "intact", ROUNDED),
  flowers(D, 1200, "fresh"),
  MOUND_D4,
  flowers(D, 1260, "fresh", MOUND_D4),
  MOUND_D5,
  stone(D, 1380, "intact", GOTHIC),
  flowers(D, 1380, "fresh"),
  stone(D, 1440, "weathered", CHIPPED),
  // the old west side: two crosses, a dead tree in each west corner and one by the north wall
  { sheet: "stone_cross", at: { x: 85, y: 1170 }, r: CROSS_R, tall: true },
  { sheet: "stone_cross", at: { x: 85, y: 1380 }, r: CROSS_R, tall: true },
  { sheet: "tree_dead", at: { x: 80, y: 1060 }, r: TRUNK, index: 0, tall: true },
  { sheet: "tree_dead_snag", at: { x: 80, y: 1480 }, r: TRUNK, index: 1, tall: true },
  { sheet: "tree_dead", at: { x: 290, y: 1050 }, r: TRUNK, index: 1, tall: true },
];

/** The low wall's footprint across its line. */
const WALL_R = 8;

/**
 * The low broken wall's runs (R29): collapsed between the north parts (x 280–330) and between the
 * west parts (y 1250–1300), and open at the south-east corner (x 490–580 on the south side), the
 * gap facing the path.
 */
export const HUB_GRAVEYARD_WALL_RUNS: FenceRun[] = [
  { at: { x: 40, y: 1020 }, length: 240, axis: "x", r: WALL_R },
  { at: { x: 330, y: 1020 }, length: 250, axis: "x", r: WALL_R },
  { at: { x: 40, y: 1020 }, length: 230, axis: "y", r: WALL_R },
  { at: { x: 40, y: 1300 }, length: 220, axis: "y", r: WALL_R },
  { at: { x: 40, y: 1520 }, length: 450, axis: "x", r: WALL_R },
  { at: { x: 580, y: 1020 }, length: 500, axis: "y", r: WALL_R },
];

/** One tile of the low wall: the sheet's animation is its axis, its frame whole or crumbled. */
export interface GraveyardWallPiece extends GraveyardPiece {
  sheet: "graveyard_wall";
  /** The axis the tile runs along, which is also the sheet's animation: one field, never two. */
  animation: "x" | "y";
  /** WALL_STATES' index: 0 whole, 1 crumbled. */
  index: number;
  /** How much of the tile is wall, 0..1; below 1 the piece is trimmed at its far end. */
  keep: number;
  /** It sorts by its tile's back corner, like a wall piece or a fence segment. */
  depthAt: Point;
}

const WHOLE = 0;
const CRUMBLED = 1;
/** About one tile in this many is crumbled. */
const CRUMBLE_ONE_IN = 3;
const WALL_SEED = 2911;

/**
 * Cuts a wall run into one-tile pieces as a fence is cut (`fenceSegments`), the last trimmed, each
 * whole or crumbled by a hash of its tile, so every client sees the same wall.
 */
export function graveyardWallPieces(run: FenceRun): GraveyardWallPiece[] {
  return fenceSegments(run).segments.map((s) => ({
    sheet: "graveyard_wall",
    at: s.at,
    r: run.r,
    animation: s.axis,
    index: tileHash(Math.round(s.at.x), Math.round(s.at.y), WALL_SEED) % CRUMBLE_ONE_IN === 0 ? CRUMBLED : WHOLE,
    keep: s.keep,
    depthAt: s.depthAt,
  }));
}

/** Every run of the low wall, cut into its pieces. */
export const HUB_GRAVEYARD_WALL: GraveyardWallPiece[] = HUB_GRAVEYARD_WALL_RUNS.flatMap(graveyardWallPieces);

/**
 * The belfry (R30): by the chapel's door, north of the door spur, between the east wall's eave and
 * the chapel lane. Tall: it fades over a player behind it.
 */
export const HUB_BELFRY: PropSpot = { sheet: "belfry", at: { x: 1635, y: 1220 }, r: 20, tall: true };

/**
 * The wayside cross (R41): a tall stone calvary on a stepped base by the chapel's door and path,
 * south of the door spur, between the east wall's eave and the chapel lane, opposite the belfry,
 * and far enough south that on screen it stands clear of the doorway, its head and its jambs
 * (at (1635, 1410) its arms hid the opening's left half). Outdoor dressing like the belfry: tall,
 * so it fades over a player behind it; no light.
 */
export const HUB_WAYSIDE_CROSS: PropSpot = { sheet: "wayside_cross", at: { x: 1635, y: 1480 }, r: 20, tall: true };
