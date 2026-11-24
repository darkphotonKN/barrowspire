/**
 * The sealed floor's art lookups (FS-5FZ4J §J R51, §K R57): which baked sheet and frame each seal
 * piece and barrier shows for its server state. Kept apart from the set that places them
 * (`seal.ts`) so a look is swapped here alone. Every sheet is on the resident `sealed` group.
 *
 * How the bake lays the cell pieces (I-5FZ4J-8's closing note): a lever's glyph is its own frame
 * drawn over the lever at the same spot; the gate is one piece per gate cell, `gate_x` for a gate
 * running along world x; a pit cell shows the rock face of a floor edge to its north or west; a
 * lowered lane's cell is a bridge cell in its pit's place.
 */

import type { SealPieceKind } from "@/types/gameState";

/** A sheet and the frame it shows. */
export interface SealLook {
  sheet: string;
  frame: string;
}

/** The glyphs a lever bears, each baked as a `glyph_<name>` frame (the server's `LeverGlyphs`). */
export const GLYPHS = ["crow", "key", "flame", "eye", "serpent", "moon"] as const;

/** Which way a gate or a bridge runs along the world: `x` for one running along world x. */
export type CellAxis = "x" | "y";

const LEVER = "seal_lever";

/** Each piece's sheet, and the frames for its `active` off and on (one frame for a piece with no state). */
const PIECES: Record<SealPieceKind, { sheet: string; off: string; on: string }> = {
  lever: { sheet: LEVER, off: "up", on: "down" },
  plate: { sheet: "pressure_plate", off: "up", on: "pressed" },
  brazier: { sheet: "seal_brazier", off: "cold", on: "lit" },
  bridge_lever: { sheet: "bridge_lever", off: "up", on: "down" },
  block: { sheet: "stone_block", off: "default", on: "default" },
  stair_key: { sheet: "stair_key", off: "default", on: "default" },
  mural: { sheet: "mural", off: "default", on: "default" },
  shrine: { sheet: "lore_shrine", off: "default", on: "default" },
};

/** Every sheet and frame this module names: what the shipped manifest is pinned against. */
export const SEALED_SHEETS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries(Object.values(PIECES).map(({ sheet, off, on }) => [sheet, [...new Set([off, on])]])),
  [LEVER]: ["up", "down", ...GLYPHS.map((g) => `glyph_${g}`)],
  gate_x: ["shut", "open"],
  gate_y: ["shut", "open"],
  pit_cell: ["open", "n", "w", "nw"],
  bridge_cell: ["x", "y"],
};

/**
 * What a piece shows, bottom first: its frame for `active`, and a lever's glyph over it. A glyph
 * the bake has no frame for draws no glyph.
 */
export function pieceLooks(kind: SealPieceKind, active: boolean, glyph?: string): SealLook[] {
  const { sheet, off, on } = PIECES[kind];
  const looks = [{ sheet, frame: active ? on : off }];
  if (kind === "lever" && glyph && (GLYPHS as readonly string[]).includes(glyph)) looks.push({ sheet, frame: `glyph_${glyph}` });
  return looks;
}

/** One gate cell's piece, shut or open. */
export function gateLook(axis: CellAxis, open: boolean): SealLook {
  return { sheet: `gate_${axis}`, frame: open ? "open" : "shut" };
}

/** A pit cell's ground: the rock face falls from a floor edge to its north and west; south and east never show one. */
export function pitLook(floorAt: { north: boolean; west: boolean }): SealLook {
  const frame = floorAt.north ? (floorAt.west ? "nw" : "n") : floorAt.west ? "w" : "open";
  return { sheet: "pit_cell", frame };
}

/** A lowered lane's cell, in its pit's place. */
export function bridgeLook(axis: CellAxis): SealLook {
  return { sheet: "bridge_cell", frame: axis };
}

/** Whether a piece's sheet declares a light that burns only while it is active: the seal's brazier, lit. */
export function glowsWhileActive(kind: SealPieceKind): boolean {
  return kind === "brazier";
}
