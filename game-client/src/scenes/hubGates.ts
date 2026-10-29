/**
 * Which hub gate a player stands in, and when they step in or out (FS-0XMCP §Requirements 7, 10,
 * 22). Pure: no Phaser, so it is tested without a canvas.
 *
 * The scene feeds it the player's last server-reported world position and the gates from the
 * hub's state, never a predicted position or a client copy of the gates, so the client opens a
 * gate's panel only where the server agrees the player is at it.
 */

import type { GateState, Position } from "@/types/gameState";

/**
 * The gate the player is at, if any: the server's rule, distance from the gate's position at most
 * its range. Gates never overlap, so the first match is the only one.
 */
export function gateAt(pos: Position, gates: readonly GateState[]): GateState | undefined {
  return gates.find(
    (gate) => Math.hypot(pos.x - gate.position.x, pos.y - gate.position.y) <= gate.range,
  );
}

/** What changed between two frames: the gate stepped into and the gate stepped out of. */
export interface GateEdges {
  entered: GateState | undefined;
  left: GateState | undefined;
}

/**
 * The enter and leave edges between the gate a player was at and the one they are at now.
 * Gates are compared by entity id, since each state carries fresh copies: lingering fires
 * nothing.
 */
export function gateEdges(before: GateState | undefined, now: GateState | undefined): GateEdges {
  if (before?.entity_id === now?.entity_id) return { entered: undefined, left: undefined };
  return { entered: now, left: before };
}

/** Where a field gate leads: every gate but the Spire's (FS-0XMCP §Requirements 21). */
export type FieldDestination = Exclude<GateState["destination"], "spire">;

/** What the screen calls each field, over its gate's signpost (CONTEXT.md, *Field world*). */
export const FIELD_NAMES: Record<FieldDestination, string> = {
  forest: "The Forlorn Forest",
  meadows: "Gentle Meadows",
};

/** The field a gate leads to, or undefined for the Spire's gate and for no gate at all. */
export function fieldOf(gate: GateState | undefined): FieldDestination | undefined {
  return gate && gate.destination !== "spire" ? gate.destination : undefined;
}

/**
 * Where a gate's signpost stands, for its name to hang over: the signpost in the hub's dressing
 * nearest the server's gate, or the gate itself when there is none. Presentation only: the gate
 * is still found by its server position.
 */
export function signpostOf(
  gate: GateState,
  dressing: readonly { sheet: string; at: Position }[],
): Position {
  const away = (at: Position) => Math.hypot(at.x - gate.position.x, at.y - gate.position.y);
  const posts = dressing.filter((spot) => spot.sheet === "signpost").map((spot) => spot.at);
  return posts.sort((a, b) => away(a) - away(b))[0] ?? gate.position;
}
