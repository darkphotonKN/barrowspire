/**
 * Forest dressing (FS-3QHQZ §Requirements 28, CONTEXT.md "Dressing"): ferns, toadstools, stumps,
 * fallen logs and a few bone piles strewn along the trails' verges, where the trodden ground
 * meets the stands. Decoration only: never interactable, never in physics, never in a message.
 *
 * The keep-out is the run dressing's own (`runDressing.ts`), computed from the Forest's broadcast:
 * its walls, its road home's reach, its chests, and the map's edge. Every piece is drawn to a
 * verge, just outside a wall's keep-out off a stand's side, with the far side's stand across the
 * trail from it, so the walking line down a trail and the middle of a clearing stay clear. A candidate that breaks a rule is dropped, never nudged; every choice is a
 * hash of the seed, so every client strews the same forest.
 *
 * Pure data and maths, no Phaser.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point, Rect } from "@/render/iso/projection";
import { placedKind, type ClientGameState } from "@/types/gameState";
import { tileHash } from "./ground";
import { dressingBreaches, type DressingStatics } from "./runDressing";

/** How a forest leans its verges: how much, and of what. */
export interface VergeLean {
  /** How many pieces to strew, at most. */
  count: number;
  /** Share of each baked sheet, cumulative, in percent. */
  weights: readonly (readonly [number, string])[];
}

/** One verge piece: a baked sheet and variant, on a footprint. Never tall. */
export interface VergePiece {
  sheet: string;
  index: number;
  at: Point;
  r: number;
  tall: false;
}

/** A piece's footprint, half the side of its square in world px; an unknown sheet takes the default. */
const FOOTPRINT: Record<string, number> = {
  fern: 14,
  toadstools: 10,
  stump: 14,
  fallen_log: 16,
  bone_pile: 12,
};
const DEFAULT_FOOTPRINT = 12;
/** A wall's keep-out (the run dressing's `KEEP_OUT.wall`): a piece's footprint stays this far off. */
const WALL_CLEAR = 24;
/** How far past a wall's keep-out a verge runs: the band a piece's footprint edge lands in. */
const VERGE_BAND = 20;
/**
 * The furthest a piece's centre stands from the nearest wall, world px: inside its verge. A
 * clearing's middle and a trail's walking line lie further out.
 */
export const VERGE_DEPTH = WALL_CLEAR + VERGE_BAND + 2 * 16 + 1;
/**
 * How far from a side's ends a piece is drawn: off a stand's side, never round its corner, where
 * the open ground widens into a clearing or a junction.
 */
const CORNER_CLEAR = 40;
/**
 * How far across its trail a verge looks for the stand on the far side, world px: a trail is three
 * 80 px cells wide (FS-KSD6K §Requirements 2), so a verge's far side is a stand within this. Open
 * ground past it is a clearing or a junction, whose middle stays clear.
 */
const TRAIL_ACROSS = 240;
/** Clear ground kept between two pieces, so the verges scatter rather than heap. */
const GAP = 30;
/**
 * How many places a forest tries; most land on a side that faces another stand or the edge. Enough
 * for the 3 120 x 2 000 Forest's verge count to place (FS-KSD6K §Requirements 17).
 */
const CANDIDATES = 3000;

const rectOf = (e: {
  position: Point;
  width: number;
  height: number;
}): Rect => ({
  x: e.position.x,
  y: e.position.y,
  width: e.width,
  height: e.height,
});

/**
 * The keep-out the Forest's broadcast sets: its walls, its road home's reach (as a door, with
 * its approach), its chests and sacks (FS-1D6BX R14), and the map edge. A drop pile is not in
 * it: dressing never blocks.
 */
export function forestStatics(
  state: Pick<ClientGameState, "walls" | "gates" | "containers">,
  width: number,
  height: number,
): DressingStatics {
  return {
    width,
    height,
    walls: (state.walls ?? []).map(rectOf),
    doors: (state.gates ?? []).map((g) => ({
      x: g.position.x - g.range,
      y: g.position.y - g.range,
      width: 2 * g.range,
      height: 2 * g.range,
    })),
    interactables: (state.containers ?? [])
      .filter((c) => placedKind(c) !== "drop_pile")
      .map((c) => ({ x: c.position.x, y: c.position.y })),
  };
}

/**
 * A point `along` the rect's perimeter (clockwise from its top-left), the way out of it there,
 * and how far the point lies from its side's nearer end.
 */
function onPerimeter(
  r: Rect,
  along: number,
): { at: Point; out: Point; fromEnd: number } {
  const end = (s: number, side: number) => Math.min(s, side - s);
  let s = along;
  if (s < r.width)
    return {
      at: { x: r.x + s, y: r.y },
      out: { x: 0, y: -1 },
      fromEnd: end(s, r.width),
    };
  s -= r.width;
  if (s < r.height)
    return {
      at: { x: r.x + r.width, y: r.y + s },
      out: { x: 1, y: 0 },
      fromEnd: end(s, r.height),
    };
  s -= r.height;
  if (s < r.width)
    return {
      at: { x: r.x + r.width - s, y: r.y + r.height },
      out: { x: 0, y: 1 },
      fromEnd: end(s, r.width),
    };
  s -= r.width;
  return {
    at: { x: r.x, y: r.y + r.height - s },
    out: { x: -1, y: 0 },
    fromEnd: end(s, r.height),
  };
}

const within = (p: Point, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** Whether nobody walks at `p`: inside a stand, or off the map. */
const closed = (p: Point, statics: DressingStatics) =>
  p.x < 0 ||
  p.y < 0 ||
  p.x > statics.width ||
  p.y > statics.height ||
  statics.walls.some((w) => within(p, w));

/** The forest's verges: up to the lean's count of pieces, each clear of the keep-out. */
export function planVerges(
  lean: VergeLean,
  seed: number,
  statics: DressingStatics,
): VergePiece[] {
  const walls = statics.walls;
  const perimeters = walls.map((w) => 2 * (w.width + w.height));
  const total = perimeters.reduce((a, b) => a + b, 0);
  const placed: VergePiece[] = [];
  if (total <= 0) return placed;

  for (let k = 0; k < CANDIDATES && placed.length < lean.count; k++) {
    const pick = tileHash(k, 5, seed);
    const sheet = lean.weights.find(([cut]) => pick % 100 < cut)?.[1];
    if (!sheet) continue;
    const r = FOOTPRINT[sheet] ?? DEFAULT_FOOTPRINT;

    // a spot on some stand's perimeter, chosen by length so long stands carry more
    let s = (tileHash(k, 6, seed) / 0x1_0000_0000) * total;
    let i = 0;
    while (i < walls.length - 1 && s >= perimeters[i]) s -= perimeters[i++];
    const { at: edge, out, fromEnd } = onPerimeter(walls[i], s);
    if (fromEnd < CORNER_CLEAR) continue;
    const away =
      WALL_CLEAR + r + 1 + ((tileHash(k, 7, seed) & 0xff) / 0xff) * VERGE_BAND;
    const at = {
      x: Math.round(edge.x + out.x * away),
      y: Math.round(edge.y + out.y * away),
    };

    if (dressingBreaches({ from: at, to: at, r }, statics).length > 0) continue;
    const across = {
      x: at.x + out.x * TRAIL_ACROSS,
      y: at.y + out.y * TRAIL_ACROSS,
    };
    if (!closed(across, statics)) continue;
    if (
      placed.some(
        (p) => Math.hypot(p.at.x - at.x, p.at.y - at.y) <= p.r + r + GAP,
      )
    )
      continue;
    placed.push({ sheet, index: pick >>> 8, at, r, tall: false });
  }
  return placed;
}
