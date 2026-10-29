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
