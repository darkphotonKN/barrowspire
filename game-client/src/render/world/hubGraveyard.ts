/**
 * The graveyard along the outside of the chapel's south wall, and the wayside cross by its door
 * (FS-R4MYX §F R27–R29, §I R41, as §Change: The chapel moves to the far left and gains a bell
 * tower lays them, T17–T22): dressing, placed by data and drawn like the town's other dressing,
 * with no collision. Every piece clears the keep-out rule K1–K8 (the bell tower's wall included),
 * stands inside the strip the low wall bounds, keeps clear of the mourners the server stands
 * among the graves (`hubGraveyard.test.ts`), and lies where neither the chapel's roof nor its bell
 * tower is drawn over it (R39, T23, `hubCover.test.ts`): south of the south eave, in front of
 * both.
 *
 * Graves lie in seven north–south lines of four slots, oldest west, each stone at its grave's west
 * end facing east; the fresh earth lies in the two newest lines, by the gap in the wall's east
 * side, toward the path. No light, no sound (R33): the graveyard is lit by the town's ambient
 * alone. The bell hangs in the tower now: the bell frame that stood by the door is gone (T17).
 *
 * Pure data and maths, no Phaser.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point } from "@/render/iso/projection";
import { tileHash } from "./ground";
import { fenceSegments, type FenceRun, type PropSpot } from "./hubKeepOut";

/**
 * The ground the low wall bounds (T19, T20): a strip as long as the chapel's south wall
 * (x 220–840), y 1790–2170, a 50 px walkway between its north run and the wall's outer face. Twice
 * as deep as first built (190): the owner found it narrow (A5).
 */
export const GRAVEYARD_ENCLOSURE = { x: 220, y: 1790, width: 620, height: 380 } as const;

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
/** How far east of its line's stones a mound is centred, and its posy laid. */
const MOUND_EAST = 25;
const FLOWERS_EAST = 18;

/** The stone lines' x, west to east: A the oldest, G the newest, by the gap. */
export const GRAVEYARD_LINES = [290, 365, 440, 515, 590, 665, 740] as const;
const [A, B, C, D, E, F, G] = GRAVEYARD_LINES;
/** The slots' y down each line, north to south: loose over the strip's depth, not quite evenly. */
export const GRAVEYARD_SLOTS = [1850, 1940, 2025, 2115] as const;
const [S1, S2, S3, S4] = GRAVEYARD_SLOTS;

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

/** The fresh mounds: two in line F, and the Keener's at G2. */
const MOUND_F1 = mound(F, S1);
const MOUND_F3 = mound(F, S3);
const MOUND_G2 = mound(G, S2);

/** A tree's trunk, for the keep-out rule: the crown overhangs, the trunk stands. */
const TRUNK = 14;
/** A stone cross's footprint, within 36 × 36. */
const CROSS_R = 18;

/**
 * The graveyard (R28's counts, T19, T20): seven lines of four grave slots, one left empty for a
 * dead tree; 24 headstones (10 intact, 9 weathered, 5 broken, the broken ones in the three old
 * lines), 3 fresh mounds in the two newest, flowers at 6 graves (4 fresh, 2 withered), 2 stone
 * crosses and a dead tree at the old west end, a dead tree in line D and one in the north-east
 * corner. The Veteran stands at B3's withered flowers, the Keener at the mound G2, the Widower at
 * G4's fresh flowers.
 */
export const HUB_GRAVEYARD: GraveyardPiece[] = [
  // line A, the oldest
  stone(A, S1, "broken", STUMP),
  stone(A, S2, "weathered", LEANING),
  stone(A, S3, "intact", ROUNDED),
  stone(A, S4, "broken", SNAPPED),
  // line B
  stone(B, S1, "intact", GOTHIC),
  stone(B, S2, "broken", STUMP),
  stone(B, S3, "weathered", CRACKED),
  flowers(B, S3, "withered"),
  stone(B, S4, "weathered", CHIPPED),
  // line C
  stone(C, S1, "broken", SNAPPED),
  stone(C, S2, "intact", ROUNDED),
  stone(C, S3, "weathered", LEANING),
  stone(C, S4, "broken", STUMP),
  // line D, its first slot empty: a dead tree stands there
  stone(D, S2, "intact", GOTHIC),
  stone(D, S3, "weathered", CRACKED),
  flowers(D, S3, "withered"),
  stone(D, S4, "weathered", CHIPPED),
  // line E
  stone(E, S1, "intact", ROUNDED),
  stone(E, S2, "weathered", LEANING),
  stone(E, S3, "intact", GOTHIC),
  flowers(E, S3, "fresh"),
  stone(E, S4, "weathered", CRACKED),
  // line F
  MOUND_F1,
  stone(F, S2, "intact", ROUNDED),
  flowers(F, S2, "fresh"),
  MOUND_F3,
  stone(F, S4, "intact", GOTHIC),
  // line G, the newest, by the gap
  stone(G, S1, "intact", ROUNDED),
  MOUND_G2,
  flowers(G, S2, "fresh", MOUND_G2),
  stone(G, S3, "weathered", CHIPPED),
  stone(G, S4, "intact", GOTHIC),
  flowers(G, S4, "fresh"),
  // the old west end: two crosses with a dead tree between them; a dead tree in line D's empty
  // slot and one in the north-east corner
  { sheet: "stone_cross", at: { x: 250, y: 1880 }, r: CROSS_R, tall: true },
  { sheet: "stone_cross", at: { x: 250, y: 2080 }, r: CROSS_R, tall: true },
  { sheet: "tree_dead", at: { x: 808, y: 1816 }, r: TRUNK, index: 0, tall: true },
  { sheet: "tree_dead_snag", at: { x: 250, y: 1980 }, r: TRUNK, index: 1, tall: true },
  { sheet: "tree_dead", at: { x: D, y: S1 }, r: TRUNK, index: 1, tall: true },
];

/** The low wall's footprint across its line. */
const WALL_R = 8;

/**
 * The one gap in the low wall (T19, T20): its east side stands open between y 1840 and 1920,
 * facing the path. The graveyard spur runs into it (hubKeepOut.ts HUB_GRAVEYARD_SPUR).
 */
export const GRAVEYARD_GAP = { x: 840, from: 1840, to: 1920 } as const;

/**
 * The low broken wall's runs (R29, T20): collapsed between the north parts (x 460–520) and
 * between the west parts (y 1960–2000), whole along the south, and open in its east side at
 * `GRAVEYARD_GAP`.
 */
export const HUB_GRAVEYARD_WALL_RUNS: FenceRun[] = [
  { at: { x: 220, y: 1790 }, length: 240, axis: "x", r: WALL_R },
  { at: { x: 520, y: 1790 }, length: 320, axis: "x", r: WALL_R },
  { at: { x: 220, y: 1790 }, length: 170, axis: "y", r: WALL_R },
  { at: { x: 220, y: 2000 }, length: 170, axis: "y", r: WALL_R },
  { at: { x: 220, y: 2170 }, length: 620, axis: "x", r: WALL_R },
  { at: { x: 840, y: 1790 }, length: GRAVEYARD_GAP.from - 1790, axis: "y", r: WALL_R },
  { at: { x: 840, y: GRAVEYARD_GAP.to }, length: 2170 - GRAVEYARD_GAP.to, axis: "y", r: WALL_R },
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
 * The wayside cross (R41, T18): a tall stone calvary on a stepped base by the chapel's door and
 * path, south of the door spur, between the east wall's eave and the chapel lane, and far enough
 * south that on screen it stands clear of the doorway, its head and its jambs. It keeps its place
 * relative to the door: (675, 380) from the chapel's corner, as built. Outdoor dressing: tall, so
 * it fades over a player behind it; no light.
 */
export const HUB_WAYSIDE_CROSS: PropSpot = { sheet: "wayside_cross", at: { x: 895, y: 1680 }, r: 20, tall: true };
