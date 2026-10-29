/**
 * What stands on a field's ground (FS-X2F2H §Requirements 52, 54): a tree cluster or a rock on
 * each of the server's keep-out areas, and the road home with its signpost at the entrance gate.
 *
 * Placed from the server's own state (its keep-out walls and its entrance gate), never from a
 * table of the client's, so a change to the server's map moves the dressing with it. Every
 * choice is a hash of the keep-out's position and a seed, never `Math.random`: every client
 * plants the same trees. Pure planning, no Phaser; `FieldScene` draws it.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import { WORLD_PX_PER_TILE, type Point, type Rect } from "@/render/iso/projection";
import { tileHash, type Apron } from "./ground";

/** The baked sheets a field dresses its keep-outs with, chosen between by hash. */
export interface FieldDressingLook {
  /** A cluster's trees; repeat a sheet to weight it. */
  trees: readonly string[];
  /** Low growth at a cluster's foot. */
  undergrowth: readonly string[];
  /** A small keep-out's stones. */
  rocks: readonly string[];
}

/** One baked prop on a world position. */
export interface FieldPiece {
  sheet: string;
  /** Variant within the sheet; the art library wraps it, so a raw hash is fine. */
  index: number;
  at: Point;
  /** Tall enough to stand over a player behind it: joins the occluders. */
  tall: boolean;
}

/** A keep-out narrower than this, either way, is a rock outcrop rather than a grove. */
const ROCK_MAX_SIDE = 100;
/** World px² of keep-out per tree in a grove, and per stone in an outcrop. */
const TREE_AREA = 7000;
const ROCK_AREA = 1600;
/** Sparse: at most this many trees in a grove, stones in an outcrop. */
const MAX_TREES = 4;
const MAX_ROCKS = 3;
/** How far in from a keep-out's edge a piece's foot stands, as a share of the side. */
const INSET = 0.15;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pick = <T>(list: readonly T[], h: number): T => list[h % list.length];

/**
 * `count` feet spread through `rect`: one per cell along its longer side, each jittered inside
 * its cell and across the shorter side, all kept `INSET` in from the edge.
 */
function spread(rect: Rect, count: number, seed: number): Point[] {
  const alongX = rect.width >= rect.height;
  const long = alongX ? rect.width : rect.height;
  const short = alongX ? rect.height : rect.width;
  const feet: Point[] = [];
  for (let i = 0; i < count; i++) {
    const h = tileHash(Math.round(rect.x) + i, Math.round(rect.y), seed);
    const cell = long / count;
    const a = (h & 0xff) / 0xff;
    const b = ((h >>> 8) & 0xff) / 0xff;
    const along = i * cell + cell * (INSET + a * (1 - 2 * INSET));
    const across = short * (INSET + b * (1 - 2 * INSET));
    feet.push(
      alongX
        ? { x: rect.x + along, y: rect.y + across }
        : { x: rect.x + across, y: rect.y + along },
    );
  }
  return feet;
}

/**
 * The dressing on each keep-out: a small one is a rock outcrop of one to three stones; a larger
 * one is a grove of two to four trees with a bush at its foot. Every piece's foot lies inside its
 * keep-out, so nothing stands on ground the server lets anyone walk.
 */
export function planKeepOutDressing(
  keepOuts: readonly Rect[],
  look: FieldDressingLook,
  seed: number,
): FieldPiece[] {
  const pieces: FieldPiece[] = [];
  for (const rect of keepOuts) {
    const area = rect.width * rect.height;
    const rocky = Math.min(rect.width, rect.height) < ROCK_MAX_SIDE;
    if (rocky) {
      const count = clamp(Math.round(area / ROCK_AREA), 1, MAX_ROCKS);
      spread(rect, count, seed + 1).forEach((at, i) => {
        const h = tileHash(Math.round(at.x), Math.round(at.y), seed + 2 + i);
        pieces.push({ sheet: pick(look.rocks, h), index: h >>> 4, at, tall: false });
      });
      continue;
    }
    const count = clamp(Math.round(area / TREE_AREA), 2, MAX_TREES);
    spread(rect, count, seed + 3).forEach((at, i) => {
      const h = tileHash(Math.round(at.x), Math.round(at.y), seed + 4 + i);
      pieces.push({ sheet: pick(look.trees, h >>> 3), index: h >>> 8, at, tall: true });
    });
    if (look.undergrowth.length > 0) {
      // one bush toward the grove's near corner, where it reads in front of the trunks
      const h = tileHash(Math.round(rect.x), Math.round(rect.y), seed + 5);
      const at = {
        x: rect.x + rect.width * (1 - INSET - ((h & 0xff) / 0xff) * 0.2),
        y: rect.y + rect.height * (1 - INSET - (((h >>> 8) & 0xff) / 0xff) * 0.2),
      };
      pieces.push({ sheet: pick(look.undergrowth, h >>> 16), index: h >>> 4, at, tall: false });
    }
  }
  return pieces;
}

const T = WORLD_PX_PER_TILE;

/** Half the road's width, world px: one tile of dirt, edged by the grass-to-dirt blend. */
export const ROAD_HALF_WIDTH = T / 2;
/** How far the road runs on into the field past the gate, and past the edge out of it, fading. */
const ROAD_IN = 160;
const ROAD_OUT = 4 * T;
/** Where the signpost stands from the gate: further in, on the road's north side. */
const SIGNPOST_FROM_GATE = { x: 90, y: -60 } as const;

/** The road home at a field's entrance gate (FS-X2F2H §Requirements 51, 54). */
export interface RoadHome {
  /** Trodden ground, laid as dirt: through the gate and out past the west edge. */
  paths: Rect[];
  /** The road's own row past the edge, fading; no grass is laid beyond the map. */
  aprons: Apron[];
  /** Where the signpost reading the way home stands. */
  signpost: Point;
}

/**
 * The road from the field's west-edge gate back toward the hub: dirt from inside the gate, through
 * it, and off the edge, fading into the land beyond. Only the road runs on past the edge: the map's
 * grass ends on its own clean edge against the horizon. The signpost stands beside the road inside
 * the gate's reach, mirroring the hub's own signpost at the Meadows gate.
 */
export function planRoadHome(gate: Point): RoadHome {
  return {
    paths: [
      {
        x: -ROAD_OUT,
        y: gate.y - ROAD_HALF_WIDTH,
        width: ROAD_OUT + gate.x + ROAD_IN,
        height: 2 * ROAD_HALF_WIDTH,
      },
    ],
    aprons: [
      {
        x: -ROAD_OUT,
        y: gate.y - ROAD_HALF_WIDTH,
        width: ROAD_OUT,
        height: 2 * ROAD_HALF_WIDTH,
        from: { x: 0, y: gate.y },
        fade: ROAD_OUT,
        along: "y",
      },
    ],
    signpost: { x: gate.x + SIGNPOST_FROM_GATE.x, y: gate.y + SIGNPOST_FROM_GATE.y },
  };
}
