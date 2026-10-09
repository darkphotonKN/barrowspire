/**
 * Run dressing (FS-8RBQY §C.4–§C.5, CONTEXT.md "Dressing"): rubble, bone piles, broken crates,
 * roots, chains and braziers strewn on a tower floor. Decoration only: never interactable, never
 * in physics, never in a message, so placement is all that keeps it out of the way.
 *
 * The keep-out is computed from the floor's own broadcast (R3), never hand-copied the way the
 * hub's is (`hubKeepOut.ts`): walls, door thresholds and their approach lanes, the things a delver
 * uses, and the play area's edge. A candidate that breaks a rule is dropped, never nudged, and
 * every choice is a hash of the floor seed, so every client strews the same floor.
 *
 * Pure data and maths, no Phaser.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point, Rect } from "@/render/iso/projection";
import type { ClientGameState } from "@/types/gameState";
import { tileHash } from "./ground";
import type { Footprint } from "./hubKeepOut";
import { INTERACT_RANGE } from "./stairs";

/** The props run dressing is made of; banners and cobwebs are wall variants, not props. */
export type DressingSheet =
  | "rubble"
  | "bone_pile"
  | "broken_crate"
  | "roots"
  | "chains"
  | "brazier";

/** How a floor band leans its dressing: how much, and of what. */
export interface DressingLean {
  /** How many pieces to strew, at most; capped at {@link DRESSING_MAX}. */
  count: number;
  /** Share of each sheet, cumulative, in percent. */
  weights: readonly (readonly [number, DressingSheet])[];
  /** The most of a sheet one floor may carry (a brazier is a light, and lights are budgeted). */
  most?: Partial<Record<DressingSheet, number>>;
}

/** The most dressing one floor carries. */
export const DRESSING_MAX = 16;

/** Each prop's footprint, half the side of its square in world px. */
const FOOTPRINT: Record<DressingSheet, number> = {
  rubble: 16,
  bone_pile: 12,
  broken_crate: 14,
  roots: 12,
  chains: 12,
  brazier: 16,
};

/** The keep-out's distances, world px (§C.5). */
const KEEP_OUT = {
  /** A wall rect grows by this. */
  wall: 24,
  /** A door rect grows by this on every side… */
  door: 40,
  /** …and by this more to the south, the lane a delver walks up to it on. */
  lane: 60,
  /** No dressing this near the stairs, chest, escape door or switch. */
  use: INTERACT_RANGE,
  /** No dressing this near the play area's edge. */
  edge: 30,
};

/** Clear floor kept between two pieces, so dressing scatters rather than heaps. */
const GAP = 30;
/** How many places a floor tries; most fail the keep-out or the spacing. */
const CANDIDATES = 96;

/** What on a floor dressing keeps out of, from its broadcast. */
export interface DressingStatics {
  width: number;
  height: number;
  walls: readonly Rect[];
  doors: readonly Rect[];
  /** Where the stairs, the chest, the escape door and the switch stand. */
  interactables: readonly Point[];
}

/** One piece of dressing: a manifest sheet and variant, on a footprint. */
export interface DressingPiece {
  sheet: DressingSheet;
  index: number;
  at: Point;
  r: number;
  /** Tall enough to stand over a delver behind it: joins the occluders. */
  tall: boolean;
}

export type DressingRule = "wall" | "door" | "interactable" | "edge";

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
 * The keep-out a floor's broadcast sets. A drop pile is not in it: one landing on dressing later
 * is fine, since dressing never blocks.
 */
export function dressingStatics(
  state: Pick<
    ClientGameState,
    "walls" | "doors" | "containers" | "escape_doors" | "switches" | "stairs"
  >,
  width: number,
  height: number,
): DressingStatics {
  return {
    width,
    height,
    walls: (state.walls ?? []).map(rectOf),
    doors: (state.doors ?? []).map(rectOf),
    interactables: [
      ...(state.stairs ?? []),
      ...(state.containers ?? []).filter((c) => c.kind === "chest"),
      ...(state.escape_doors ?? []),
      ...(state.switches ?? []),
    ].map((e) => ({ x: e.position.x, y: e.position.y })),
  };
}

const squareOf = (fp: Footprint): Rect => {
  const x = Math.min(fp.from.x, fp.to.x) - fp.r;
  const y = Math.min(fp.from.y, fp.to.y) - fp.r;
  return {
    x,
    y,
    width: Math.abs(fp.to.x - fp.from.x) + 2 * fp.r,
    height: Math.abs(fp.to.y - fp.from.y) + 2 * fp.r,
  };
};

const grow = (r: Rect, by: number, south = 0): Rect => ({
  x: r.x - by,
  y: r.y - by,
  width: r.width + 2 * by,
  height: r.height + 2 * by + south,
});

/** Edges inclusive. */
const overlaps = (a: Rect, b: Rect) =>
  a.x + a.width >= b.x &&
  a.x <= b.x + b.width &&
  a.y + a.height >= b.y &&
  a.y <= b.y + b.height;

/** Distance from a point to the nearest point of a rect; 0 inside it. */
const reach = (p: Point, r: Rect) =>
  Math.hypot(
    Math.max(r.x - p.x, 0, p.x - r.x - r.width),
    Math.max(r.y - p.y, 0, p.y - r.y - r.height),
  );

/** The keep-out rules a footprint breaks (§C.5); empty when it clears them all. */
export function dressingBreaches(
  fp: Footprint,
  statics: DressingStatics,
): DressingRule[] {
  const sq = squareOf(fp);
  const out: DressingRule[] = [];
  if (statics.walls.some((w) => overlaps(sq, grow(w, KEEP_OUT.wall))))
    out.push("wall");
  if (
    statics.doors.some((d) =>
      overlaps(sq, grow(d, KEEP_OUT.door, KEEP_OUT.lane)),
    )
  )
    out.push("door");
  if (statics.interactables.some((p) => reach(p, sq) <= KEEP_OUT.use))
    out.push("interactable");
  const e = KEEP_OUT.edge;
  if (
    sq.x < e ||
    sq.y < e ||
    sq.x + sq.width > statics.width - e ||
    sq.y + sq.height > statics.height - e
  )
    out.push("edge");
  return out;
}

/** The floor's dressing: up to the lean's count of pieces, each clear of the keep-out. */
export function planDressing(
  lean: DressingLean,
  seed: number,
  statics: DressingStatics,
): DressingPiece[] {
  const count = Math.min(lean.count, DRESSING_MAX);
  const placed: DressingPiece[] = [];
  const used = new Map<DressingSheet, number>();
  const span = (size: number, r: number, h: number) => {
    const lo = KEEP_OUT.edge + r;
    return lo + ((h & 0xffff) / 0xffff) * (size - 2 * lo);
  };

  for (let k = 0; k < CANDIDATES && placed.length < count; k++) {
    const pick = tileHash(k, 3, seed);
    const sheet = lean.weights.find(([cut]) => pick % 100 < cut)?.[1];
    if (!sheet || (used.get(sheet) ?? 0) >= (lean.most?.[sheet] ?? Infinity))
      continue;
    const r = FOOTPRINT[sheet];
    const at = {
      x: Math.round(span(statics.width, r, tileHash(k, 1, seed))),
      y: Math.round(span(statics.height, r, tileHash(k, 2, seed))),
    };
    if (dressingBreaches({ from: at, to: at, r }, statics).length > 0) continue;
    const crowded = placed.some(
      (p) => Math.hypot(p.at.x - at.x, p.at.y - at.y) <= p.r + r + GAP,
    );
    if (crowded) continue;
    placed.push({ sheet, index: pick >>> 8, at, r, tall: sheet === "brazier" });
    used.set(sheet, (used.get(sheet) ?? 0) + 1);
  }
  return placed;
}
