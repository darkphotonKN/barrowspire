/**
 * Where the hub's props and dressing stand, and the ground they must keep off (FS-KYPQ9 §A.3–§A.5).
 *
 * Dressing is decoration only (CONTEXT.md "Dressing"): nothing stops a player or a resident
 * walking through it, so placement is what keeps it believable. Every spot here clears the
 * keep-out rule, K1–K8, which `hubKeepOut.test.ts` checks at review. The scene still refuses a
 * prop inside a building at draw time (`blocked()`), because the walls are the server's.
 *
 * Pure data and maths, no Phaser.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { WORLD_PX_PER_TILE, type Point, type Rect } from "@/render/iso/projection";
import type { WallState } from "@/types/gameState";

/** The hub's size in world px (K7). */
export const HUB_SIZE = { width: 2000, height: 1000 } as const;

/**
 * Screen px of dark beyond the projected diamond the camera may show at the map edge: the
 * camera's reach is `projectedBounds(HUB_SIZE, HUB_CAMERA_MARGIN)`. The Spire's facade is baked
 * tall enough that this reach cuts its tower off (FS-0XMCP R16), so the two are checked together.
 */
export const HUB_CAMERA_MARGIN = 64;

/** The hearth's brazier: client scenery, at the middle of the gathering ground. */
export const HUB_HEARTH: [number, number] = [1000, 640];

type PathRect = [number, number, number, number];

/** Where a gate leads (FS-0XMCP R1): the server's `GateDestination`. */
export type GateDestination = "spire" | "forest" | "meadows";

/**
 * The gates' approaches (FS-0XMCP R19): trodden ground from the hearth's paths to each gate, so
 * the hub reads as a crossroads. The first rect of each runs through its gate to the map's edge,
 * and on past it where the ground goes on beyond (the trail and the road); the ground plan lays
 * only what lies on an apron or inside the map. A tile is dirt when its centre lies in a rect.
 *
 * Nudged from the FS starting paths to clear the keep-out rule (recorded in I-0XMCP-2):
 * - north lane `[950, 100, 100, 400]` runs on to the edge, y 0, to meet the Spire's steps;
 * - west trail `[60, 390, 600, 50]` + `[620, 390, 60, 300]` would have crossed the cart, the
 *   washing line, the sacks and a market stall; it turns south down the west house's east side
 *   instead, `[470, 390, 40, 320]`, and joins the west arm along `[480, 680, 230, 30]`;
 * - east road `[1380, 340, 570, 50]` runs on to the edge and beyond; its drop
 *   `[1340, 390, 60, 300]` is unchanged.
 */
export const HUB_APPROACHES: Record<GateDestination, PathRect[]> = {
  spire: [[950, 0, 100, 500]],
  forest: [
    [-200, 390, 710, 50],
    [470, 390, 40, 320],
    [480, 680, 230, 30],
  ],
  meadows: [
    [1380, 340, 820, 50],
    [1340, 390, 60, 300],
  ],
};

/**
 * Trodden ground, joining the spawn to the people worth walking to, then the gates' approaches:
 * [x, y, w, h].
 */
export const HUB_PATHS: PathRect[] = [
  [940, 500, 130, 320],
  [700, 660, 360, 70],
  [1000, 660, 380, 70],
  ...Object.values(HUB_APPROACHES).flat(),
];

/**
 * K3–K6: read-only facts copied from the server. The spawn and the function NPCs' places come
 * from game-server/game-service/common/constants/game.go (HubSpawnX/Y, NPCInteractRange) and
 * game-server/game-service/internal/game/hub_map.go (hubNPCs at the spawn ± (140, -120)); the
 * residents' wander regions from hub_map.go (hubResidents), as top-left x, y and w × h, the way
 * WanderSystem.choose reads them. A server change to any of them needs this updated; the
 * keep-out vitest is where that drift is caught.
 */
export const HUB_KEEP_OUT = {
  /** K3: arrivals land here. */
  spawn: { at: { x: 1000, y: 800 }, clearance: 60 },
  /** K4: where a player stands to talk to a function NPC (NPCInteractRange). */
  npcs: {
    at: [
      { x: 860, y: 680 },
      { x: 1140, y: 680 },
    ],
    clearance: 80,
  },
  /** K5: the hearth's gathering ground. */
  hearth: { at: { x: HUB_HEARTH[0], y: HUB_HEARTH[1] }, clearance: 80 },
  /** K6: the residents' quarters. */
  wander: [
    { name: "Cottar", x: 560, y: 560, width: 180, height: 200 },
    { name: "Herbwife", x: 1260, y: 540, width: 240, height: 220 },
    { name: "Woodcutter", x: 700, y: 820, width: 300, height: 140 },
    { name: "Bellringer", x: 1180, y: 820, width: 280, height: 140 },
  ],
  /**
   * K8: the gates (FS-0XMCP R2, R4), from hub_map.go (hubGates) and their range (GateRange,
   * the Warden's NPCInteractRange). Their approaches are HUB_APPROACHES.
   */
  gates: {
    at: [
      { destination: "spire", x: 1000, y: 50 },
      { destination: "forest", x: 40, y: 400 },
      { destination: "meadows", x: 1960, y: 360 },
    ],
    range: 80,
  },
} as const;

/** One prop on one footprint. `r` is the half-width of its square, for `blocked()` and K1–K7. */
export interface PropSpot {
  sheet: string;
  at: Point;
  r: number;
  /** Variant frame (awning, sacks), by index so every client sees the same hub. */
  index?: number;
  /** The sheet's animation, where it has one per axis (a flower box along a wall). */
  animation?: string;
  /** Tall enough to hide a player: joins the occluders and fades over them. */
  tall?: boolean;
}

/** A post-and-rail fence along one world axis, from `at` for `length` world px. */
export interface FenceRun {
  at: Point;
  length: number;
  axis: "x" | "y";
  r: number;
}

/** The well (§A.4). Tall: its hoist and roof stand over a player behind it. */
export const HUB_WELL: PropSpot = { sheet: "well", at: { x: 820, y: 460 }, r: 22, tall: true };

/**
 * Market stalls (§A.4); the awning variant is the index: oxblood, arcaneDeep, barrowBrown. Two
 * moved out of the Herbwife's and the Bellringer's quarters; the third stands in the south-west
 * yard, where the fixed camera sees it (west of a house is behind its roof).
 */
export const HUB_STALLS: PropSpot[] = [
  { sheet: "market_stall", at: { x: 1220, y: 460 }, r: 40, index: 0, tall: true },
  { sheet: "market_stall", at: { x: 700, y: 500 }, r: 40, index: 1, tall: true },
  { sheet: "market_stall", at: { x: 630, y: 950 }, r: 40, index: 2, tall: true },
];

/**
 * Carts (§A.4): the second is the hay cart, moved out of the Bellringer's quarter into the fenced
 * south-west yard.
 */
export const HUB_CARTS: PropSpot[] = [
  { sheet: "cart", at: { x: 540, y: 430 }, r: 26 },
  { sheet: "hay_cart", at: { x: 400, y: 880 }, r: 26 },
];

/**
 * Crates (§A.4): the third moved off the west fence run's end post, the last two out of the
 * Woodcutter's quarter, all where the fixed camera sees them.
 */
export const HUB_CRATES: PropSpot[] = [
  { sheet: "crate", at: { x: 1300, y: 470 }, r: 14 },
  { sheet: "crate", at: { x: 1320, y: 505 }, r: 14 },
  { sheet: "crate", at: { x: 530, y: 730 }, r: 14 },
  { sheet: "crate", at: { x: 1050, y: 910 }, r: 14 },
  { sheet: "crate_stack", at: { x: 1110, y: 935 }, r: 14 },
];

/**
 * Fence runs (§A.4): the second moved east, its west end having stood behind the east house, then
 * cut short of the Meadows gate's range (FS-0XMCP K8), so its end stands beside the east road; the
 * third moved out of the Woodcutter's quarter.
 */
export const HUB_FENCES: FenceRun[] = [
  { at: { x: 300, y: 760 }, length: 220, axis: "x", r: 20 },
  { at: { x: 1740, y: 300 }, length: 130, axis: "x", r: 20 },
  { at: { x: 240, y: 950 }, length: 240, axis: "x", r: 20 },
];

/** Sacks variants: grain, then market goods. */
const GRAIN = 0;
const GOODS = 1;

/**
 * New dressing (§A.5). Lit props (lamp posts, braziers) light the ground through their manifest
 * light. Wall-hugging rows (flower boxes) stand just outside eave clearance, laid along the wall they
 * stand against, and only on faces the camera sees (south and east). Nothing stands west or north
 * of a house, where its roof would hide it.
 */
export const HUB_DRESSING: PropSpot[] = [
  { sheet: "lamp_post", at: { x: 925, y: 760 }, r: 12, tall: true },
  { sheet: "lamp_post", at: { x: 1085, y: 760 }, r: 12, tall: true },
  { sheet: "brazier", at: { x: 1080, y: 440 }, r: 16, tall: true },
  { sheet: "brazier", at: { x: 530, y: 600 }, r: 16, tall: true },
  { sheet: "water_trough", at: { x: 750, y: 450 }, r: 20 },
  { sheet: "water_trough", at: { x: 310, y: 840 }, r: 20 },
  { sheet: "woodpile", at: { x: 660, y: 880 }, r: 24 },
  { sheet: "sacks", at: { x: 620, y: 490 }, r: 12, index: GRAIN },
  { sheet: "sacks", at: { x: 1150, y: 460 }, r: 12, index: GRAIN },
  { sheet: "sacks", at: { x: 600, y: 840 }, r: 12, index: GOODS },
  { sheet: "signpost", at: { x: 1085, y: 520 }, r: 10, tall: true },
  { sheet: "signpost", at: { x: 1050, y: 880 }, r: 10, tall: true },
  { sheet: "flower_box", at: { x: 880, y: 402 }, r: 10, animation: "x" },
  { sheet: "flower_box", at: { x: 1230, y: 402 }, r: 10, animation: "x" },
  { sheet: "flower_box", at: { x: 1290, y: 402 }, r: 10, animation: "x" },
  { sheet: "flower_box", at: { x: 1822, y: 460 }, r: 10, animation: "y" },
  { sheet: "barrel", at: { x: 575, y: 475 }, r: 12 },
  { sheet: "barrel", at: { x: 610, y: 810 }, r: 12 },
  { sheet: "barrel", at: { x: 340, y: 800 }, r: 12 },
];

/**
 * The washing line along the north-west house's south face: its footprint is its two posts, and
 * the line with its cloth sorts by the span's midpoint. The `washing_line` sheet spans exactly
 * the posts' 80 world px along x.
 */
export const HUB_WASHING_LINE: { posts: [PropSpot, PropSpot]; line: PropSpot } = {
  posts: [
    { sheet: "washing_post", at: { x: 640, y: 405 }, r: 8, tall: true },
    { sheet: "washing_post", at: { x: 720, y: 405 }, r: 8, tall: true },
  ],
  line: { sheet: "washing_line", at: { x: 680, y: 405 }, r: 0, tall: true },
};

/** A tree's trunk, for the keep-out rule: the crown overhangs, the trunk stands. */
const TRUNK = 14;
const tree = (sheet: "tree_pine" | "tree_oak", x: number, y: number, index: number): PropSpot => ({
  sheet,
  at: { x, y },
  r: TRUNK,
  index,
  tall: true,
});

/**
 * The gates' dressing inside the hub (FS-0XMCP R18): a signpost beside each field gate, just
 * outside its range, and the first trees of the forest at the west trail's mouth. Trees stand at
 * their trunk's foot; `index` is the sheet's variant.
 */
export const HUB_GATE_DRESSING: PropSpot[] = [
  { sheet: "signpost", at: { x: 140, y: 470 }, r: 10, tall: true },
  { sheet: "signpost", at: { x: 1860, y: 420 }, r: 10, tall: true },
  tree("tree_pine", 100, 300, 0),
  tree("tree_pine", 70, 530, 1),
  tree("tree_oak", 90, 640, 1),
];

/**
 * Dressing drawn beyond the map's edge (FS-0XMCP R11, R18, D12), where nobody walks: the forest
 * thickening into the dark past the west trail's mouth. Each clears the gates' ranges and the
 * trail running on past the edge (K8); none needs collision.
 */
export const HUB_BEYOND_EDGE: PropSpot[] = [
  tree("tree_pine", -40, 330, 1),
  tree("tree_oak", -60, 480, 0),
  tree("tree_pine", -100, 350, 0),
  tree("tree_pine", -110, 490, 1),
  tree("tree_oak", -150, 300, 1),
  tree("tree_pine", -170, 520, 0),
  tree("tree_pine", -190, 360, 1),
  tree("tree_pine", -210, 470, 0),
  tree("tree_oak", -250, 410, 0),
];

/**
 * Fences beyond the east edge (FS-0XMCP R18): post and rail either side of the road as it leaves
 * for the meadows, past the gate's range; the hub's own run along the road's north side ends
 * short of the gate, so the road opens between them.
 */
export const HUB_BEYOND_EDGE_FENCES: FenceRun[] = [
  { at: { x: 2060, y: 300 }, length: 140, axis: "x", r: 20 },
  { at: { x: 2060, y: 420 }, length: 140, axis: "x", r: 20 },
];

/**
 * Ground past the edge at each gate (FS-0XMCP R18): fading out over `fade` world px from where it
 * leaves the map (`from`, on the edge at the gate) into the dark, within its rect. The trail runs
 * west into the trees, the road east onto lighter ground (HubScene lights it), and the lane north
 * under the Spire's steps. The ground plan carries HUB_PATHS through them.
 */
export const HUB_APRONS = [
  { x: -280, y: 150, width: 280, height: 530, from: { x: 0, y: 415 }, fade: 270 },
  { x: 2000, y: -40, width: 400, height: 810, from: { x: 2000, y: 365 }, fade: 400 },
  { x: 700, y: -300, width: 600, height: 300, from: { x: 1000, y: 0 }, fade: 300 },
] as const;

/**
 * The Spire's entrance (FS-0XMCP R15–R17): one baked prop beyond the north edge, its origin the
 * foot of the great door's threshold, centred on the Spire gate. Its steps run down to the edge.
 * It is the gate's own building, so the keep-out rule does not apply to it; it sorts behind
 * everything in the hub (HubScene), since nothing walkable lies north of it.
 */
export const HUB_SPIRE_FACADE: PropSpot = { sheet: "spire_facade", at: { x: 1000, y: -60 }, r: 0 };

/** A footprint: the square `± r` swept from `from` to `to` (one point for a single prop). */
export interface Footprint {
  from: Point;
  to: Point;
  r: number;
}

export const spotFootprint = (s: PropSpot): Footprint => ({ from: s.at, to: s.at, r: s.r });

/** The whole run, not just its start (§A.3): a fence clears only if every segment clears. */
export function fenceFootprint(run: FenceRun): Footprint {
  return { from: run.at, to: endOf(run), r: run.r };
}

const endOf = (run: FenceRun): Point =>
  run.axis === "x"
    ? { x: run.at.x + run.length, y: run.at.y }
    : { x: run.at.x, y: run.at.y + run.length };

const rectOf = (fp: Footprint): Rect => {
  const x = Math.min(fp.from.x, fp.to.x) - fp.r;
  const y = Math.min(fp.from.y, fp.to.y) - fp.r;
  return {
    x,
    y,
    width: Math.abs(fp.to.x - fp.from.x) + 2 * fp.r,
    height: Math.abs(fp.to.y - fp.from.y) + 2 * fp.r,
  };
};

/** Edges inclusive, as `blocked()` tests them. */
const overlaps = (a: Rect, b: Rect) =>
  a.x + a.width >= b.x && a.x <= b.x + b.width && a.y + a.height >= b.y && a.y <= b.y + b.height;

/** Distance from `p` to the nearest point of the segment from `a` to `b`. */
function distanceTo(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export type KeepOutRule = "K1" | "K2" | "K3" | "K4" | "K5" | "K6" | "K7" | "K8";

/**
 * The keep-out rules a footprint breaks (§A.3), empty when it clears. K1 is `blocked()`'s test:
 * the square against each wall grown by the roof's eave. K3–K5 measure from the footprint's
 * centre line, K2, K6 and K7 test its square. K8 (FS-0XMCP R20) does both: a gate's range from
 * the centre line, its approach against the square.
 */
export function keepOutBreaches(fp: Footprint, walls: readonly WallState[], eave: number): KeepOutRule[] {
  const square = rectOf(fp);
  const near = (p: Point, clearance: number) => distanceTo(p, fp.from, fp.to) <= clearance + fp.r;
  const out: KeepOutRule[] = [];
  const k1 = walls.some((w) =>
    overlaps(square, {
      x: w.position.x - eave,
      y: w.position.y - eave,
      width: w.width + 2 * eave,
      height: w.height + 2 * eave,
    }),
  );
  if (k1) out.push("K1");
  if (HUB_PATHS.some(([x, y, width, height]) => overlaps(square, { x, y, width, height }))) out.push("K2");
  if (near(HUB_KEEP_OUT.spawn.at, HUB_KEEP_OUT.spawn.clearance)) out.push("K3");
  if (HUB_KEEP_OUT.npcs.at.some((p) => near(p, HUB_KEEP_OUT.npcs.clearance))) out.push("K4");
  if (near(HUB_KEEP_OUT.hearth.at, HUB_KEEP_OUT.hearth.clearance)) out.push("K5");
  if (HUB_KEEP_OUT.wander.some((region) => overlaps(square, region))) out.push("K6");
  const inside =
    square.x >= 0 &&
    square.y >= 0 &&
    square.x + square.width <= HUB_SIZE.width &&
    square.y + square.height <= HUB_SIZE.height;
  if (!inside) out.push("K7");
  const { gates } = HUB_KEEP_OUT;
  const onApproach = Object.values(HUB_APPROACHES).some((rects) =>
    rects.some(([x, y, width, height]) => overlaps(square, { x, y, width, height })),
  );
  if (onApproach || gates.at.some((g) => near(g, gates.range))) out.push("K8");
  return out;
}

/** One tile of fence, sorted by the back corner of what it keeps, like a wall piece. */
export interface FenceSegment {
  sheet: "fence_x" | "fence_y";
  axis: "x" | "y";
  /** The centre of a whole tile of fence (the sheet's origin). */
  at: Point;
  /** How much of the tile is fence, 0..1; below 1 the segment is trimmed at its far end. */
  keep: number;
  depthAt: Point;
}

const T = WORLD_PX_PER_TILE;
const EPSILON = 1e-6;

/**
 * Cuts a fence run into one-tile segments along its axis, the way walls are cut into pieces
 * (walls.ts `cutWall`): the last is trimmed, and a `fence_post` stands at each end.
 */
export function fenceSegments(run: FenceRun): { segments: FenceSegment[]; posts: [Point, Point] } {
  const whole = Math.floor(run.length / T + EPSILON);
  const rest = run.length / T - whole;
  const count = rest > EPSILON ? whole + 1 : whole;
  const along = (d: number): Point =>
    run.axis === "x" ? { x: run.at.x + d, y: run.at.y } : { x: run.at.x, y: run.at.y + d };
  const segments: FenceSegment[] = [];
  for (let k = 0; k < count; k++)
    segments.push({
      sheet: run.axis === "x" ? "fence_x" : "fence_y",
      axis: run.axis,
      at: along((k + 0.5) * T),
      keep: k < whole ? 1 : rest,
      depthAt: along(k * T),
    });
  return { segments, posts: [run.at, endOf(run)] };
}
