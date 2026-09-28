/**
 * The ground: decorative, client-side, and the same on every client (FS-2325V §C.1).
 *
 * Every choice is a hash of world tile coordinates and a per-world seed, never `Math.random`,
 * so two delvers looking at the same place see the same tiles and decals. Pure planning: the
 * result names sheets from the sprite manifest and world positions; drawing is `scene.ts`.
 */

import { WORLD_PX_PER_TILE, type Point, type Rect } from "@/render/iso";
import type { House } from "./houses";

/** Which kind of world is being dressed. Mirrors `ClientGameState.world_type`. */
export type WorldKind = "hub" | "run";

/** One ground tile, decal or floor tile to draw: a manifest sheet and frame, at a world point. */
export interface GroundPiece {
  sheet: string;
  animation: string;
  /** Frame within the animation; the art library wraps it, so a raw hash is fine. */
  index: number;
  /** World position of the tile's centre (or the decal's footprint). */
  at: Point;
}

const T = WORLD_PX_PER_TILE;

/** A well-mixed 32-bit hash of a world tile. Deterministic across clients and sessions. */
export function tileHash(tx: number, ty: number, seed: number): number {
  let h =
    Math.imul(tx | 0, 0x27d4eb2d) ^
    Math.imul(ty | 0, 0x165667b1) ^
    Math.imul(seed | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** The seed each kind of world scatters its ground with. */
export function worldSeed(kind: WorldKind): number {
  return kind === "hub" ? 0x4855_4231 : 0x5255_4e31;
}

/** World n = -y, e = +x: the edge a transition tile's second material intrudes from. */
export type Edge = "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw";

/**
 * The edge of a tile that a neighbouring material intrudes from, given which of the eight
 * neighbours carry it. Two adjacent sides make a corner; a lone diagonal makes a corner too.
 * Undefined when no neighbour carries it.
 */
export function transitionEdge(
  other: (dx: number, dy: number) => boolean,
): Edge | undefined {
  const n = other(0, -1);
  const s = other(0, 1);
  const e = other(1, 0);
  const w = other(-1, 0);
  if (n && e) return "ne";
  if (n && w) return "nw";
  if (s && e) return "se";
  if (s && w) return "sw";
  if (n) return "n";
  if (e) return "e";
  if (s) return "s";
  if (w) return "w";
  if (other(1, -1)) return "ne";
  if (other(-1, -1)) return "nw";
  if (other(1, 1)) return "se";
  if (other(-1, 1)) return "sw";
  return undefined;
}

type Material = "grass" | "dirt";

const within = (p: Point, r: Rect) =>
  p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

const centreOf = (tx: number, ty: number): Point => ({
  x: (tx + 0.5) * T,
  y: (ty + 0.5) * T,
});

export interface GroundOptions {
  width: number;
  height: number;
  kind: WorldKind;
  /** Trodden ground (world rects), laid as dirt. The hub's paths. */
  paths?: readonly Rect[];
}

/**
 * The outdoor ground over `[0, width] × [0, height]`, one tile per world tile. A run is barrow
 * dirt; the hub is grass with dirt paths, and grass bordering dirt takes the blend tile.
 */
export function planGround({
  width,
  height,
  kind,
  paths = [],
}: GroundOptions): GroundPiece[] {
  const seed = worldSeed(kind);
  const cols = Math.ceil(width / T);
  const rows = Math.ceil(height / T);
  const base: Material = kind === "hub" ? "grass" : "dirt";
  const material = (tx: number, ty: number): Material =>
    paths.some((p) => within(centreOf(tx, ty), p)) ? "dirt" : base;

  const tiles: GroundPiece[] = [];
  for (let tx = 0; tx < cols; tx++)
    for (let ty = 0; ty < rows; ty++) {
      const at = centreOf(tx, ty);
      const index = tileHash(tx, ty, seed);
      const m = material(tx, ty);
      const edge =
        m === "grass"
          ? transitionEdge((dx, dy) => material(tx + dx, ty + dy) === "dirt")
          : undefined;
      tiles.push(
        edge
          ? { sheet: "ground_grass_dirt", animation: edge, index: 0, at }
          : { sheet: `ground_${m}`, animation: "variants", index, at },
      );
    }
  return tiles;
}

/**
 * Flagstone under each house: a tile grid centred on the house, so any part-tile overhang is
 * split evenly and hides under the walls' footprint and baked contact shadow.
 */
export function planFloors(
  houses: readonly House[],
  seed: number,
): GroundPiece[] {
  const tiles: GroundPiece[] = [];
  for (const h of houses) {
    const cols = Math.ceil(h.width / T - 1e-6);
    const rows = Math.ceil(h.height / T - 1e-6);
    const x0 = h.x - (cols * T - h.width) / 2;
    const y0 = h.y - (rows * T - h.height) / 2;
    for (let i = 0; i < cols; i++)
      for (let j = 0; j < rows; j++) {
        const at = { x: x0 + (i + 0.5) * T, y: y0 + (j + 0.5) * T };
        tiles.push({
          sheet: "ground_flagstone",
          animation: "variants",
          index: tileHash(Math.floor(at.x / T), Math.floor(at.y / T), seed + 7),
          at,
        });
      }
  }
  return tiles;
}

/** Share of tiles that carry a decal, in percent. */
const DECAL_DENSITY: Record<WorldKind, number> = { hub: 14, run: 10 };
/** Share of those decals that are grass tufts rather than pebbles, in percent. */
const TUFT_SHARE: Record<WorldKind, number> = { hub: 70, run: 15 };
/** How far a decal may sit from its tile's centre, in world px. */
const DECAL_JITTER = 14;

export interface DecalOptions {
  width: number;
  height: number;
  kind: WorldKind;
  houses: readonly House[];
}

/** Grass tufts and pebbles scattered on the ground, never inside or against a house. */
export function planDecals({
  width,
  height,
  kind,
  houses,
}: DecalOptions): GroundPiece[] {
  const seed = worldSeed(kind) + 1;
  const keepOut = houses.map((h) => ({
    x: h.x - T,
    y: h.y - T,
    width: h.width + 2 * T,
    height: h.height + 2 * T,
  }));
  const decals: GroundPiece[] = [];
  for (let tx = 0; tx < Math.ceil(width / T); tx++)
    for (let ty = 0; ty < Math.ceil(height / T); ty++) {
      const h = tileHash(tx, ty, seed);
      if (h % 100 >= DECAL_DENSITY[kind]) continue;
      const c = centreOf(tx, ty);
      if (keepOut.some((r) => within(c, r))) continue;
      const jx = (((h >>> 8) & 0xff) / 255 - 0.5) * 2 * DECAL_JITTER;
      const jy = (((h >>> 16) & 0xff) / 255 - 0.5) * 2 * DECAL_JITTER;
      decals.push({
        sheet:
          (h >>> 24) % 100 < TUFT_SHARE[kind]
            ? "decal_grass_tuft"
            : "decal_pebbles",
        animation: "variants",
        index: h >>> 4,
        at: { x: c.x + jx, y: c.y + jy },
      });
    }
  return decals;
}
