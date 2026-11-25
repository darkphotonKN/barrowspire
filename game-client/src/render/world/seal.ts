/**
 * A sealed floor's seal pieces and barriers on the canvas (FS-5FZ4J §J R51, R52, R56): every
 * listed piece drawn from its baked sheet at its server position, every gate and pit cell at its
 * cell's centre, each in the frame its state names. The broadcast is the whole truth: a piece no
 * longer listed (the stair key taken) goes. A stone block slides between cells over the push time
 * rather than snapping. A piece or barrier kind this client does not know draws nothing.
 *
 * The looks are `sealLooks.ts`'s; this set only places them. It drives the scene's objects through
 * {@link SealStage}, the narrow slice of Phaser it needs, so it is tested without a canvas, as
 * `StairsSet` and `SummoningSet` are. A detected secret door (also a barrier) draws its cracks as
 * a decal over each wall piece of its face while it is shut, and is the Search target; open, it
 * draws nothing here: the floor map re-sent with its cells walkable draws the doorway (R56).
 */

import { BASE_MOVE_SPEED, BLOCK_PUSH_SPEED_SHARE } from "@/data/pace";
import type { Point } from "@/render/iso/projection";
import type { FixedLightKind } from "./floorLights";
import {
  knownBarrier,
  knownSealPiece,
  type BarrierState,
  type CellState,
  type SealPieceKind,
  type SealPieceState,
} from "@/types/gameState";
import { bridgeLook, cracksLook, gateLook, glowsWhileActive, pieceLooks, pitLook, type CellAxis, type SealLook } from "./sealLooks";
import { INTERACT_RANGE } from "./stairs";
import type { WallPiece } from "./walls";

/**
 * World px a second a block slides at: the server's push speed, a player's paced walk at its push
 * share (`DefaultSpeed` × `BlockPushSpeedShare`, FS-5FZ4J §C R19), read from the pace golden
 * (FS-TAGWA R10), so a slide of one cell takes the push time at any pace.
 */
export const BLOCK_SLIDE_SPEED = BASE_MOVE_SPEED * BLOCK_PUSH_SPEED_SHARE;

/**
 * The ground band's depth for a pit, a bridge and a plate: over the floor's ground (`GROUND_DEPTH`,
 * -1), under the mist (-0.5) and the trails' beds (0), and under every body standing in the world band.
 */
export const SEAL_GROUND_DEPTH = -0.75;

/**
 * Farther than this, world px, a block's move is a jump (a reconnect's first sight), not a slide:
 * two of the server's 80 px cells. A push moves a block one cell.
 */
const SLIDE_MAX = 160;

/** The floor's cell grid as the set reads it: its cell size, and which cells are ground. */
export interface SealGrid {
  readonly cell: number;
  walkable(cx: number, cy: number): boolean;
}

/**
 * A wall piece of the floor as drawn: where it stands, what it sorts by, its axis and height. What a
 * secret door's cracks are laid over, from the floor's wall plan (`dungeonWalls`).
 */
export type WallFace = Pick<WallPiece, "at" | "depthAt" | "axis" | "height">;

/** Where a sprite sorts: on the ground under every body (a pit, a bridge, a plate), or standing among them. */
export type SealBand = "ground" | "standing";

/** A seal brazier's flame among the floor's fixed lights: a brazier, as the dressing's are (FS-8RBQY §C.6). */
const PIECE_LIGHT: FixedLightKind = "brazier";

/** What the set asks of the scene. `layer` stacks a piece's parts at one spot (a lever's glyph over it). */
export interface SealStage<S extends { destroy(): void }> {
  add(look: SealLook, at: Point, band: SealBand, layer: number): S;
  show(sprite: S, look: SealLook): void;
  stand(sprite: S, at: Point, layer: number): void;
  /**
   * Light or put out the flame a piece's sheet declares, as one of the floor's fixed lights of
   * `kind`: the seal's brazier while it is lit, the hallowed altar's candles while it is dormant.
   */
  glow(sprite: S, at: Point, on: boolean, kind: FixedLightKind): void;
  /** A decal over a wall piece at its own spot, sorted just over it by `depthAt`: a secret door's cracks. */
  decal(look: SealLook, at: Point, depthAt: Point): S;
}

/** What E reaches here (R52): a piece to work, the shut gate, or a detected shut secret door to Search. */
export type SealTarget = { kind: SealPieceKind | "gate" | "secret_door"; entityId: string };

/** A shut gate as the minimap strokes it (R56): a cell of it, and its run through its cells' middle, in cell units. */
export interface GateStroke {
  at: Point;
  points: Point[];
}

interface DrawnPiece<S> {
  kind: SealPieceKind;
  sprites: S[];
  looks: SealLook[];
  /** Where it is drawn now; a sliding block's is on its way to `goal`. */
  pos: Point;
  goal: Point;
  active: boolean;
}

interface DrawnCell<S> {
  sprite: S;
  pos: Point;
  look: SealLook;
}

interface DrawnBarrier<S> {
  kind: "gate" | "pit";
  open: boolean;
  cells: CellState[];
  drawn: DrawnCell<S>[];
  axis: CellAxis;
}

interface DrawnDoor<S> {
  cells: CellState[];
  open: boolean;
  drawn: DrawnCell<S>[];
}

/** Whether E has anything to do at a piece in this state. A plate and a block are pressed and pushed with the body. */
function reachable(kind: SealPieceKind, active: boolean): boolean {
  switch (kind) {
    case "lever":
    case "brazier":
    case "bridge_lever":
      return !active;
    case "stair_key":
    case "mural":
    case "shrine":
      return true;
    case "plate":
    case "block":
      return false;
  }
}

const sameLook = (a: SealLook, b: SealLook) => a.sheet === b.sheet && a.frame === b.frame;

export class SealSet<S extends { destroy(): void }> {
  private readonly pieces = new Map<string, DrawnPiece<S>>();
  private readonly barriers = new Map<string, DrawnBarrier<S>>();
  private readonly doors = new Map<string, DrawnDoor<S>>();
  /** The grid the barriers were laid over: a new one (the floor map re-sent) lays them again. */
  private laidOver?: SealGrid;
  /** The wall faces the secret doors' cracks were laid over: new ones (the walls rebuilt) lay them again. */
  private crackedOver?: readonly WallFace[];
  /** The cells of each shut secret door the latest broadcast says was revealed (FS-4EC7Z §F R28). */
  private revealedShut: CellState[][] = [];

  constructor(private readonly stage: SealStage<S>) {}

  /**
   * Make the canvas match the broadcast. The barriers wait for the floor's `grid`, which places
   * their cells, and a secret door's cracks for its wall `faces` too; the pieces stand on their own
   * positions.
   */
  sync(
    state: { seal_pieces?: SealPieceState[]; barriers?: BarrierState[] },
    grid: SealGrid | undefined,
    faces?: readonly WallFace[],
  ): void {
    this.syncPieces(state.seal_pieces ?? []);
    this.syncBarriers(state.barriers ?? [], grid);
    this.syncDoors(state.barriers ?? [], grid, faces);
  }

  /** A frame gone, `dtMs` long: each sliding block on toward its cell at the push speed. */
  step(dtMs: number): void {
    const reach = (BLOCK_SLIDE_SPEED * dtMs) / 1000;
    for (const p of this.pieces.values()) {
      const dx = p.goal.x - p.pos.x;
      const dy = p.goal.y - p.pos.y;
      const left = Math.hypot(dx, dy);
      if (left === 0) continue;
      p.pos = left <= reach ? p.goal : { x: p.pos.x + (dx / left) * reach, y: p.pos.y + (dy / left) * reach };
      this.standPiece(p);
    }
  }

  /** The nearest piece or shut gate the interact key reaches from `me`, or `null` (R52). */
  nearby(me: Point): SealTarget | null {
    return this.reach(me)?.target ?? null;
  }

  /** {@link nearby}'s target with how far it stands from `me`: what E weighs against the other targets in reach. */
  reach(me: Point): { target: SealTarget; distance: number } | null {
    const inReach: { target: SealTarget; d: number }[] = [];
    for (const [entityId, p] of this.pieces)
      if (reachable(p.kind, p.active)) inReach.push({ target: { kind: p.kind, entityId }, d: Math.hypot(me.x - p.pos.x, me.y - p.pos.y) });
    const grid = this.laidOver;
    for (const [entityId, b] of this.barriers)
      if (grid && b.kind === "gate" && !b.open) inReach.push({ target: { kind: "gate", entityId }, d: rectDistance(me, b.cells, grid.cell) });
    for (const [entityId, door] of this.doors)
      if (grid && !door.open) inReach.push({ target: { kind: "secret_door", entityId }, d: rectDistance(me, door.cells, grid.cell) });
    let best: { target: SealTarget; d: number } | undefined;
    for (const c of inReach) if (c.d < INTERACT_RANGE && (!best || c.d < best.d)) best = c;
    return best ? { target: best.target, distance: best.d } : null;
  }

  /** Each sprite drawn, with where it stands: what the hide rule and the blackout read. */
  placed(): { readonly sprite: S; readonly pos: Point }[] {
    const out: { sprite: S; pos: Point }[] = [];
    for (const p of this.pieces.values()) for (const sprite of p.sprites) out.push({ sprite, pos: p.pos });
    for (const b of this.barriers.values()) for (const { sprite, pos } of b.drawn) out.push({ sprite, pos });
    for (const d of this.doors.values()) for (const { sprite, pos } of d.drawn) out.push({ sprite, pos });
    return out;
  }

  /** The sprites drawn for one listed entity: a piece's parts, a barrier's cells, a secret door's cracks. */
  drawnFor(entityId: string): S[] {
    const piece = this.pieces.get(entityId);
    if (piece) return [...piece.sprites];
    const drawn = this.barriers.get(entityId)?.drawn ?? this.doors.get(entityId)?.drawn ?? [];
    return drawn.map((d) => d.sprite);
  }

  /**
   * Each shut secret door the Cutthroats' tip revealed (FS-4EC7Z §F R28, §G R35), for the minimap's
   * door glyph: at its first cell's centre. None before the floor's grid stands.
   */
  revealedDoors(): { at: Point }[] {
    const grid = this.laidOver;
    if (!grid) return [];
    return this.revealedShut.filter((cells) => cells.length > 0).map((cells) => ({ at: cellCentre(cells[0], grid.cell) }));
  }

  /** Every shut gate's run, for the minimap's wall stroke (R56). */
  shutGates(): GateStroke[] {
    const grid = this.laidOver;
    if (!grid) return [];
    const strokes: GateStroke[] = [];
    for (const b of this.barriers.values()) {
      if (b.kind !== "gate" || b.open || b.cells.length === 0) continue;
      const xs = b.cells.map((c) => c.x);
      const ys = b.cells.map((c) => c.y);
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs) + 1, Math.min(...ys), Math.max(...ys) + 1];
      const points =
        b.axis === "x"
          ? [{ x: x0, y: (y0 + y1) / 2 }, { x: x1, y: (y0 + y1) / 2 }]
          : [{ x: (x0 + x1) / 2, y: y0 }, { x: (x0 + x1) / 2, y: y1 }];
      strokes.push({ at: cellCentre(b.cells[0], grid.cell), points });
    }
    return strokes;
  }

  /** Destroy every piece and barrier and forget them. */
  clear(): void {
    for (const p of this.pieces.values()) this.dropPiece(p);
    for (const b of this.barriers.values()) for (const { sprite } of b.drawn) sprite.destroy();
    for (const d of this.doors.values()) for (const { sprite } of d.drawn) sprite.destroy();
    this.forget();
  }

  /** Forget everything without touching it: the scene has already destroyed its objects. */
  forget(): void {
    this.pieces.clear();
    this.barriers.clear();
    this.doors.clear();
    this.laidOver = undefined;
    this.crackedOver = undefined;
    this.revealedShut = [];
  }

  private syncPieces(listed: SealPieceState[]): void {
    const present = new Set(listed.map((p) => p.entity_id));
    for (const [id, p] of this.pieces) {
      if (present.has(id)) continue;
      this.dropPiece(p);
      this.pieces.delete(id);
    }
    for (const wire of listed) {
      const kind = knownSealPiece(wire.kind);
      if (!kind) continue;
      const looks = pieceLooks(kind, wire.active, wire.glyph);
      const goal = { x: wire.position.x, y: wire.position.y };
      const held = this.pieces.get(wire.entity_id);
      if (!held || held.kind !== kind || held.looks.length !== looks.length) {
        if (held) this.dropPiece(held);
        this.pieces.set(wire.entity_id, this.addPiece(kind, looks, goal, wire.active));
        continue;
      }
      this.turnPiece(held, looks, wire.active);
      this.movePiece(held, goal);
    }
  }

  private addPiece(kind: SealPieceKind, looks: SealLook[], at: Point, active: boolean): DrawnPiece<S> {
    const band: SealBand = kind === "plate" ? "ground" : "standing";
    const sprites = looks.map((look, layer) => this.stage.add(look, at, band, layer));
    if (active && glowsWhileActive(kind)) this.stage.glow(sprites[0], at, true, PIECE_LIGHT);
    return { kind, sprites, looks, pos: at, goal: at, active };
  }

  /** Each part to the frame its state names, and a brazier's flame lit or put out with it. */
  private turnPiece(p: DrawnPiece<S>, looks: SealLook[], active: boolean): void {
    looks.forEach((look, i) => {
      if (sameLook(look, p.looks[i])) return;
      this.stage.show(p.sprites[i], look);
    });
    p.looks = looks;
    if (p.active !== active && glowsWhileActive(p.kind)) this.stage.glow(p.sprites[0], p.pos, active, PIECE_LIGHT);
    p.active = active;
  }

  /** A block slides to its new place (stepped each frame); any other piece stands there at once, as does a block's jump. */
  private movePiece(p: DrawnPiece<S>, goal: Point): void {
    if (p.goal.x === goal.x && p.goal.y === goal.y) return;
    p.goal = goal;
    const jump = Math.hypot(goal.x - p.pos.x, goal.y - p.pos.y) > SLIDE_MAX;
    if (p.kind === "block" && !jump) return;
    p.pos = goal;
    this.standPiece(p);
  }

  private standPiece(p: DrawnPiece<S>): void {
    p.sprites.forEach((sprite, layer) => this.stage.stand(sprite, p.pos, layer));
  }

  private dropPiece(p: DrawnPiece<S>): void {
    if (p.active && glowsWhileActive(p.kind)) this.stage.glow(p.sprites[0], p.pos, false, PIECE_LIGHT);
    for (const sprite of p.sprites) sprite.destroy();
  }

  private syncBarriers(listed: BarrierState[], grid: SealGrid | undefined): void {
    if (grid !== this.laidOver) {
      for (const b of this.barriers.values()) for (const { sprite } of b.drawn) sprite.destroy();
      this.barriers.clear();
      this.laidOver = grid;
    }
    const drawable = listed.filter((b) => {
      const kind = knownBarrier(b.kind);
      return kind === "gate" || kind === "pit";
    });
    const present = new Set(drawable.map((b) => b.entity_id));
    for (const [id, b] of this.barriers) {
      if (present.has(id)) continue;
      for (const { sprite } of b.drawn) sprite.destroy();
      this.barriers.delete(id);
    }
    if (!grid) return;

    // a pit cell's neighbour is floor only if it is ground and no pit's, bridged or not
    const pits = new Set(drawable.filter((b) => b.kind === "pit").flatMap((b) => b.cells.map(cellKey)));
    const floorAt = (x: number, y: number) => grid.walkable(x, y) && !pits.has(`${x},${y}`);
    for (const wire of drawable) {
      const kind = wire.kind as "gate" | "pit";
      const axis = kind === "gate" ? gateAxis(wire.cells, grid) : laneAxis(wire.cells, pits);
      const looks = wire.cells.map((c) =>
        kind === "gate"
          ? gateLook(axis, wire.open)
          : wire.open
            ? bridgeLook(axis)
            : pitLook({ north: floorAt(c.x, c.y - 1), west: floorAt(c.x - 1, c.y) }),
      );
      const held = this.barriers.get(wire.entity_id);
      if (!held || !sameCells(held.cells, wire.cells)) {
        if (held) for (const { sprite } of held.drawn) sprite.destroy();
        const band: SealBand = kind === "gate" ? "standing" : "ground";
        const drawn = wire.cells.map((c, i) => {
          const pos = cellCentre(c, grid.cell);
          return { sprite: this.stage.add(looks[i], pos, band, 0), pos, look: looks[i] };
        });
        this.barriers.set(wire.entity_id, { kind, open: wire.open, cells: wire.cells, drawn, axis });
        continue;
      }
      held.drawn.forEach((d, i) => {
        if (sameLook(d.look, looks[i])) return;
        d.look = looks[i];
        this.stage.show(d.sprite, looks[i]);
      });
      held.open = wire.open;
      held.axis = axis;
    }
  }

  /**
   * Each detected secret door, shut: its cracks over every wall piece standing in its cells (a
   * piece's centre lies in its wall cell); open, none. Laid again over new faces or a new grid.
   */
  private syncDoors(listed: BarrierState[], grid: SealGrid | undefined, faces: readonly WallFace[] | undefined): void {
    const drop = (d: DrawnDoor<S>) => d.drawn.forEach(({ sprite }) => sprite.destroy());
    if (faces !== this.crackedOver || !grid) {
      this.doors.forEach(drop);
      this.doors.clear();
      this.crackedOver = faces;
    }
    const doors = listed.filter((b) => knownBarrier(b.kind) === "secret_door");
    this.revealedShut = doors.filter((b) => b.revealed === true && !b.open).map((b) => b.cells);
    const present = new Set(doors.map((b) => b.entity_id));
    for (const [id, d] of this.doors) {
      if (present.has(id)) continue;
      drop(d);
      this.doors.delete(id);
    }
    if (!grid || !faces) return;
    for (const wire of doors) {
      const held = this.doors.get(wire.entity_id);
      if (held && held.open === wire.open && sameCells(held.cells, wire.cells)) continue;
      if (held) drop(held);
      const cells = new Set(wire.cells.map(cellKey));
      const drawn = wire.open
        ? []
        : faces
            .filter((f) => cells.has(`${Math.floor(f.at.x / grid.cell)},${Math.floor(f.at.y / grid.cell)}`))
            .map((f) => {
              const look = cracksLook(f.height, f.axis);
              return { sprite: this.stage.decal(look, f.at, f.depthAt), pos: f.at, look };
            });
      this.doors.set(wire.entity_id, { cells: wire.cells, open: wire.open, drawn });
    }
  }
}

const cellKey = (c: CellState) => `${c.x},${c.y}`;

const cellCentre = (c: CellState, size: number): Point => ({ x: (c.x + 0.5) * size, y: (c.y + 0.5) * size });

function sameCells(a: CellState[], b: CellState[]): boolean {
  return a.length === b.length && a.every((c, i) => c.x === b[i].x && c.y === b[i].y);
}

/** How many columns and rows the cells span. */
function span(cells: CellState[]): { cols: number; rows: number } {
  return { cols: new Set(cells.map((c) => c.x)).size, rows: new Set(cells.map((c) => c.y)).size };
}

/**
 * The way a gate runs: along its cells when they span more than one; a one-cell gate across the
 * corridor its walls stand beside, so walls east and west of it make a gate running along x.
 */
function gateAxis(cells: CellState[], grid: SealGrid): CellAxis {
  const { cols, rows } = span(cells);
  if (cols !== rows) return cols > rows ? "x" : "y";
  const c = cells[0];
  if (!c) return "x";
  return !grid.walkable(c.x - 1, c.y) && !grid.walkable(c.x + 1, c.y) ? "x" : "y";
}

/**
 * The way a lane crosses its chasm: along its cells when they span more than one; a one-cell lane
 * across the pit cells beside it, so pit north or south of it makes a crossing along x.
 */
function laneAxis(cells: CellState[], pits: ReadonlySet<string>): CellAxis {
  const { cols, rows } = span(cells);
  if (cols !== rows) return cols > rows ? "x" : "y";
  const c = cells[0];
  if (!c) return "y";
  return pits.has(`${c.x},${c.y - 1}`) || pits.has(`${c.x},${c.y + 1}`) ? "x" : "y";
}

/** World px from `me` to the nearest point of the cells' bounding rect, as the server measures a barrier's reach. */
function rectDistance(me: Point, cells: CellState[], size: number): number {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x0 = Math.min(...xs) * size;
  const x1 = (Math.max(...xs) + 1) * size;
  const y0 = Math.min(...ys) * size;
  const y1 = (Math.max(...ys) + 1) * size;
  const nx = Math.min(Math.max(me.x, x0), x1);
  const ny = Math.min(Math.max(me.y, y0), y1);
  return Math.hypot(me.x - nx, me.y - ny);
}
