/**
 * Whether a town building is drawn over something standing outdoors behind it (FS-R4MYX §I R39:
 * the owner's "npc不要被擋在房子下").
 *
 * A building's *bulk* is what the camera sees of it from outside: its roof as `planRoof` lays it
 * (the footprint grown by the eave, cut into one-tile pieces), each piece's surface climbing one
 * `ROOF_RISE` from its eave-side edge to its ridge-side edge, its eave row standing on the back
 * walls' tops (`BAKE.WALL_BACK`), and over the ridge row an allowance for what stands above the
 * roof's line there, by the roof the building wears: the ridge piece, the gable apex (the chapel's
 * carries its stone cross), and a chimney stack where the roof has one. The walls stand under the
 * roof's eave and add nothing the roof does not cover; the gables stand in the end walls' planes
 * under the roof's line (`hubCover.test.ts` holds every gable piece's drawn pixels to the bulk).
 *
 * A point P is *hidden* when some bulk point F on its screen column (F.x − F.y = P.x − P.y)
 * sorts in front of it (F.x + F.y > P.x + P.y) and is drawn up to P's screen height:
 * `worldToScreen(F).y − h(F) ≤ worldToScreen(P).y`. A body is tested at its point and
 * `NPC_BODY_HALF` either side along screen x. Ground east or south of the eaves is in front of the
 * building and never hidden; the hidden ground lies north and west of it, in its columns.
 *
 * Pure maths over the projection and the bake's heights, no drawing. The scene does not read it:
 * the tests hold the town's outdoor people and its graveyard to it (hubCover.test.ts).
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { TILE_HEIGHT, TILE_WIDTH, WORLD_PX_PER_TILE, type Point, type Rect } from "@/render/iso/projection";
import { BAKE } from "./bake";
import type { RoofSet } from "./hubInteriors";
import { planRoof } from "./roofs";

const T = WORLD_PX_PER_TILE;
/** Screen px a world px along the screen column (+1, +1) moves down the screen: 2 · HALF_H. */
const DOWN_PER_STEP = TILE_HEIGHT / WORLD_PX_PER_TILE;
/** World px a screen px along screen x moves a point, along (+½, −½) per axis: 1 / (2 · HALF_W). */
const WORLD_PER_SCREEN_X = WORLD_PX_PER_TILE / TILE_WIDTH;

/**
 * Half a person's drawn body along screen x, in screen px: a quarter of a tile's width at least
 * (R39). A person is hidden when the bulk covers their feet's point or either side of it.
 */
export const NPC_BODY_HALF = 16;

/**
 * How far above the ridge's lift the art over a roof's ridge row reaches, in screen px, by roof
 * set (`RoofSet.prefix`): the ridge piece, and the gable piece against the ridge, whose apex frame
 * carries what crowns the gable (the chapel's stone cross, FS-R4MYX R42). Named for the tests that
 * run without the art; `hubCover.test.ts` derives each from that set's manifest frames (their
 * tops, rounded up) and fails when the art and the number part.
 */
export const RIDGE_ALLOWANCE: Readonly<Record<string, number>> = { "": 24, chapel_: 73 };

/**
 * How far above the ridge's lift a chimney's frame reaches, in screen px, on a roof that wears
 * one (`RoofSet.chimney`): it stands in the camera-facing row against the ridge
 * (`planChimney`). `hubCover.test.ts` derives it from the `chimney` sheet's frame top.
 */
export const CHIMNEY_ALLOWANCE = 62;

/** How far above its ridge's lift a roof's ridge row is drawn: its set's allowance, or its chimney's. */
export function ridgeAllowance(roof: RoofSet): number {
  const crest = RIDGE_ALLOWANCE[roof.prefix];
  if (crest === undefined) throw new Error(`hubCover: no RIDGE_ALLOWANCE for the roof set "${roof.prefix}"`);
  return roof.chimney ? Math.max(crest, CHIMNEY_ALLOWANCE) : crest;
}

/**
 * How far a slope piece's frame reaches above its surface's back corner, in screen px: the
 * shingles' thickness and the bake's padding. `hubCover.test.ts` holds it to the manifest's
 * `roof_slope` frame.
 */
export const ROOF_OVERDRAW = 10;

/** One roof tile of the bulk: its square and the height drawn over each point of it. */
interface BulkTile {
  square: Rect;
  /** Screen px of height at a world point of the square. */
  heightAt: (p: Point) => number;
}

/** A building's bulk: the roof tiles it is drawn with, seen from outside. */
export interface Bulk {
  tiles: BulkTile[];
}

const square = (at: Point): Rect => ({ x: at.x - T / 2, y: at.y - T / 2, width: T, height: T });

/**
 * The bulk of the building on this footprint (the town golden's, or a house the walls build)
 * under the roof it wears (`townHouseLook`): `planRoof`'s pieces in that roof's set, each slope
 * piece rising across its tile from its eave-side edge, the ridge row (the ridge pieces' tiles and
 * the two slope rows against them) raised to the ridge's height plus `ridgeAllowance(roof)`.
 */
export function bulkOf(footprint: Rect, roof: RoofSet): Bulk {
  const pieces = planRoof({ id: "bulk", ...footprint }, roof.prefix);
  const rise = BAKE.ROOF_RISE * BAKE.VPX;
  // the ridge by the set's own sheet name: a bare "roof_ridge" would miss the chapel's
  const ridgeSheet = `${roof.prefix}roof_ridge`;
  const ridge = pieces.find((p) => p.sheet === ridgeSheet);
  if (!ridge) throw new Error(`hubCover: planRoof laid no ${ridgeSheet}`);
  const ridgeTop = ridge.lift + ridgeAllowance(roof);
  const alongX = footprint.width >= footprint.height;
  const ridgeLine = alongX ? footprint.y + footprint.height / 2 : footprint.x + footprint.width / 2;

  const tiles = pieces.map((piece): BulkTile => {
    const { at, lift } = piece;
    // the ridge piece, and the slope row on either side of it (centred half a tile off the ridge)
    const inRidgeRow = Math.abs((alongX ? at.y : at.x) - ridgeLine) < T;
    const climb = (p: Point): number => {
      if (piece.sheet === ridgeSheet) return 0;
      // how far across the tile from its low (eave-side) edge toward the ridge, 0..1
      switch (piece.animation) {
        case "s":
          return (at.y + T / 2 - p.y) / T;
        case "n":
          return (p.y - (at.y - T / 2)) / T;
        case "e":
          return (at.x + T / 2 - p.x) / T;
        default:
          return (p.x - (at.x - T / 2)) / T;
      }
    };
    return {
      square: square(at),
      heightAt: (p) => {
        const surface = lift + climb(p) * rise;
        return inRidgeRow ? Math.max(surface, ridgeTop) : surface;
      },
    };
  });
  return { tiles };
}

/**
 * Where the screen column through `p` (the world line p + (t, t)) crosses a square, as its
 * t range, or undefined when it misses.
 */
function crossing(p: Point, r: Rect): [number, number] | undefined {
  const lo = Math.max(r.x - p.x, r.y - p.y);
  const hi = Math.min(r.x + r.width - p.x, r.y + r.height - p.y);
  return lo <= hi ? [lo, hi] : undefined;
}

/**
 * Whether the bulk is drawn over the point `p`: some point of it on `p`'s screen column, in front
 * of `p`, is drawn up to `p`'s screen height. Each tile's height is linear along the column, so
 * its two ends decide.
 */
export function hiddenBehind(p: Point, bulk: Bulk): boolean {
  for (const tile of bulk.tiles) {
    const range = crossing(p, tile.square);
    if (!range) continue;
    const from = Math.max(range[0], 1e-9);
    const to = range[1];
    if (to < from) continue;
    for (const t of [from, to]) {
      const f = { x: p.x + t, y: p.y + t };
      // F is drawn t · DOWN_PER_STEP below p on screen, its top h(F) + overdraw above that
      if (tile.heightAt(f) + ROOF_OVERDRAW >= t * DOWN_PER_STEP) return true;
    }
  }
  return false;
}

/**
 * Whether a person standing at `p` is drawn hidden behind the bulk: at their point, or
 * `NPC_BODY_HALF` either side of it along screen x (at the same depth).
 */
export function bodyHiddenBehind(p: Point, bulk: Bulk): boolean {
  const d = NPC_BODY_HALF * WORLD_PER_SCREEN_X;
  return [p, { x: p.x - d, y: p.y + d }, { x: p.x + d, y: p.y - d }].some((q) => hiddenBehind(q, bulk));
}
