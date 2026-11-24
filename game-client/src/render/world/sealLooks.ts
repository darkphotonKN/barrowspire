/**
 * The sealed floor's art lookups (FS-5FZ4J §J R51, §K R57): which baked sheet and frame each seal
 * piece and barrier shows for its server state. Kept apart from the set that places them
 * (`seal.ts`) so a look is swapped here alone. Every sheet is on the resident `sealed` group.
 *
 * How the bake lays the cell pieces (I-5FZ4J-8's closing note): a lever's glyph is its own frame
 * drawn over the lever at the same spot; the gate is one piece per gate cell, `gate_x` for a gate
 * running along world x; a pit cell shows the rock face of a floor edge to its north or west; a
 * lowered lane's cell is a bridge cell in its pit's place. A trap bakes at full strength and is
 * drawn faint while it waits; a gas vent's puff is its own six-frame, unlooped clip. A secret
 * door's cracks are a decal laid over each wall piece of its face, by the piece's height and axis.
 */

import type { SealPieceKind, TrapKind } from "@/types/gameState";
import type { WallAxis, WallHeight } from "./walls";

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
  ...Object.fromEntries(
    (["spike_plate", "dart_wall", "fire_jet", "tripwire", "gas_vent"] satisfies TrapKind[]).map((kind) => [
      `trap_${kind}`,
      kind === "gas_vent" ? ["armed", "sprung", "puff"] : ["armed", "sprung"],
    ]),
  ),
  secret_cracks: ["x", "y", "front_x", "front_y"],
  healing_fountain: ["full", "dry"],
  hallowed_altar: ["dormant", "prayed"],
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

/**
 * The alpha a listed trap's armed frame is drawn at (FS-5FZ4J §J R51): faint, a thing the party
 * has spotted and not yet set off. Its spring shows at full strength.
 */
export const TRAP_FAINT = 0.45;

/** A trap's frame: `armed` waiting, `sprung` set off, and a gas vent's `puff`. */
export type TrapFrame = "armed" | "sprung" | "puff";

/** A trap's sheet and frame; every trap kind has its own sheet. */
export function trapLook(kind: TrapKind, frame: TrapFrame): SealLook {
  return { sheet: `trap_${kind}`, frame };
}

/** A secret door's cracks over one wall piece: `x`/`y` on a back piece, `front_x`/`front_y` on a cut-away one. */
export function cracksLook(height: WallHeight, axis: WallAxis): SealLook {
  return { sheet: "secret_cracks", frame: height === "back" ? axis : `front_${axis}` };
}

/** The healing fountain, full or dry once its pool is spent (R51). Its sheet declares no light. */
export function fountainLook(dry: boolean): SealLook {
  return { sheet: "healing_fountain", frame: dry ? "dry" : "full" };
}

/**
 * The hallowed altar, dormant or prayed (R51). Its sheet declares its candlelight, which burns only
 * while it is dormant (I-5FZ4J-8): the candles are cold stubs once it is prayed at.
 */
export function hallowedAltarLook(prayed: boolean): SealLook {
  return { sheet: "hallowed_altar", frame: prayed ? "prayed" : "dormant" };
}
