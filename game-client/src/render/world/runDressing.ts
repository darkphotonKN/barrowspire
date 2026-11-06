/**
 * Run dressing (FS-8RBQY §C.4–§C.5, CONTEXT.md "Dressing"): rubble, bone piles, broken crates,
 * roots, chains and braziers strewn on a tower floor. Decoration only: never interactable, never
 * in physics, never in a message, so placement is all that keeps it out of the way.
 *
 * The keep-out is computed from the floor's own broadcast (R3), never hand-copied the way the
 * hub's is (`hubKeepOut.ts`): walls, door thresholds and their approach lanes, the things a player
 * uses, and the play area's edge. A candidate that breaks a rule is dropped, never nudged, and
 * every choice is a hash of the floor seed, so every client strews the same floor.
 *
 * Pure data and maths, no Phaser.
 */

// by path, not the barrel: the barrel pulls in the Phaser drawing helpers
import type { Point, Rect } from "@/render/iso/projection";
import { placedKind, type ClientGameState } from "@/types/gameState";
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
  /** …and by this more to the south, the lane a player walks up to it on. */
  lane: 60,
  /** No dressing this near the stairs, chest or sack, escape door or switch. */
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
  /** Where the stairs, the chest or sack, the escape door and the switch stand. */
  interactables: readonly Point[];
}

/** One piece of dressing: a manifest sheet and variant, on a footprint. */
export interface DressingPiece {
  sheet: DressingSheet;
  index: number;
  at: Point;
  r: number;
  /** Tall enough to stand over a player behind it: joins the occluders. */
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
      ...(state.containers ?? []).filter((c) => placedKind(c) !== "drop_pile"),
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

/**
 * Whether a piece stands within the keep-out a container at `at` would have set (§C.5): on a
 * dungeon floor the dressing is planned without the containers, which interest cuts (FS-KE075
 * §H.47), and a piece one turns out to stand by gives way when it is first seen.
 */
export function dressingStandsBy(piece: Pick<DressingPiece, "at" | "r">, at: Point): boolean {
  return reach(at, squareOf({ from: piece.at, to: piece.at, r: piece.r })) <= KEEP_OUT.use;
}

/** The floor's dressing: up to the lean's count of pieces, each clear of the keep-out. */
export function planDressing(
  lean: DressingLean,
  seed: number,
  statics: DressingStatics,
): DressingPiece[] {
  const count = Math.min(lean.count, DRESSING_MAX);
  const strewn = new Strewing(lean, statics);
  const span = (size: number, r: number, h: number) => {
    const lo = KEEP_OUT.edge + r;
    return lo + ((h & 0xffff) / 0xffff) * (size - 2 * lo);
  };
  for (let k = 0; k < CANDIDATES && strewn.placed.length < count; k++)
    strewn.try(k, seed, (r) => ({
      x: Math.round(span(statics.width, r, tileHash(k, 1, seed))),
      y: Math.round(span(statics.height, r, tileHash(k, 2, seed))),
    }));
  return strewn.placed;
}

/**
 * The floor area FS-8RBQY §C's dressing counts were tuned on, world px²: floors 2 and 3, 1440 ×
 * 960. A dungeon room is strewn at the same density for its own area (FS-KE075 §H.47).
 */
export const DRESSING_AREA = 1440 * 960;
/** How many places a dungeon room tries for each piece it wants; most fail the keep-out. */
const TRIES_PER_PIECE = 12;

/** Where a dungeon floor's dressing may stand: a room, its rect, and what it lets stand in it. */
export interface DressingArea {
  /** The room's region id: its own seed, so each room strews its own way. */
  id: number;
  /** The room's bounding rect, world px: candidates fall in it. */
  rect: Rect;
  /** Whether a footprint square (world px) may stand in the room (FS-KE075 §H.47). */
  clear(square: Rect): boolean;
}

/**
 * A dungeon floor's dressing (FS-KE075 §H.47): each room strewn at FS-8RBQY §C's density for its
 * area (the lean's count per {@link DRESSING_AREA}), only where the room lets a piece stand (never
 * in a corridor, never within a cell of a doorway) and clear of the keep-out. A sheet's `most` holds
 * across the whole floor, and pieces are spaced across rooms as on any floor.
 */
export function planRoomDressing(
  lean: DressingLean,
  seed: number,
  statics: DressingStatics,
  rooms: readonly DressingArea[],
): DressingPiece[] {
  const perFloor = Math.min(lean.count, DRESSING_MAX);
  const strewn = new Strewing(lean, statics);
  for (const room of rooms) {
    const quota = Math.round((perFloor * room.rect.width * room.rect.height) / DRESSING_AREA);
    const own = tileHash(room.id, 0x524f_4f4d, seed);
    const { x, y, width, height } = room.rect;
    const span = (from: number, size: number, r: number, h: number) =>
      Math.round(from + r + ((h & 0xffff) / 0xffff) * (size - 2 * r));
    const before = strewn.placed.length;
    for (let k = 0; k < quota * TRIES_PER_PIECE && strewn.placed.length - before < quota; k++)
      strewn.try(
        k,
        own,
        (r) => ({ x: span(x, width, r, tileHash(k, 1, own)), y: span(y, height, r, tileHash(k, 2, own)) }),
        room.clear,
      );
  }
  return strewn.placed;
}

/** The pieces strewn so far on one floor, and the rules each new one must pass. */
class Strewing {
  readonly placed: DressingPiece[] = [];
  private readonly used = new Map<DressingSheet, number>();

  constructor(
    private readonly lean: DressingLean,
    private readonly statics: DressingStatics,
  ) {}

  /**
   * Candidate `k` of `seed`: its sheet by the lean, its place by `spot`, kept when it clears the
   * keep-out, the area's own test and the spacing, dropped otherwise, never nudged (§C.5).
   */
  try(k: number, seed: number, spot: (r: number) => Point, clear?: (square: Rect) => boolean): void {
    const pick = tileHash(k, 3, seed);
    const sheet = this.lean.weights.find(([cut]) => pick % 100 < cut)?.[1];
    if (!sheet || (this.used.get(sheet) ?? 0) >= (this.lean.most?.[sheet] ?? Infinity)) return;
    const r = FOOTPRINT[sheet];
    const at = spot(r);
    const fp = { from: at, to: at, r };
    if (clear && !clear(squareOf(fp))) return;
    if (dressingBreaches(fp, this.statics).length > 0) return;
    const crowded = this.placed.some(
      (p) => Math.hypot(p.at.x - at.x, p.at.y - at.y) <= p.r + r + GAP,
    );
    if (crowded) return;
    this.placed.push({ sheet, index: pick >>> 8, at, r, tall: sheet === "brazier" });
    this.used.set(sheet, (this.used.get(sheet) ?? 0) + 1);
  }
}
