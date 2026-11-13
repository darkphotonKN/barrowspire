/**
 * Which hub gate a player stands in, and when they step in or out (FS-0XMCP §Requirements 7, 10,
 * 22). Pure: no Phaser, so it is tested without a canvas.
 *
 * The scene feeds it the player's last server-reported world position and the gates from the
 * hub's state, never a predicted position or a client copy of the gates, so the client opens a
 * gate's panel only where the server agrees the player is at it.
 */

import type { FieldId } from "@/assets/types/client";
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

/**
 * Where a field gate leads: every hub gate but the Spire's (FS-0XMCP §Requirements 21). A field's
 * own entrance gate (`hub`, the road home, FS-X2F2H §Requirements 3) leads to no field, nor does
 * the endgame test run's, which starts a run (FS-BDRTJ §Change: Endgame test run, R21).
 */
export type FieldDestination = Exclude<GateState["destination"], "spire" | "hub" | "dev_endgame_run">;

/** What the screen calls each field, over its gate's signpost (CONTEXT.md, *Field world*). */
export const FIELD_NAMES: Record<FieldDestination, string> = {
  forest: "The Forlorn Forest",
  meadows: "Gentle Meadows",
  dev_test_room: "Dev Test Room",
};

/** The dev-only gates, which a production build ignores (FS-BDRTJ §Requirements 2, 3; R23). */
export type DevDestination = Extract<GateState["destination"], "dev_test_room" | "dev_endgame_run">;

/** The plain label each dev gate stands under (FS-BDRTJ §Requirements 5; R20). */
export const DEV_GATE_LABELS: Record<DevDestination, string> = {
  dev_test_room: FIELD_NAMES.dev_test_room,
  dev_endgame_run: "Endgame Test Run",
};

const isDevGate = (gate: GateState): boolean => Object.hasOwn(DEV_GATE_LABELS, gate.destination);

/**
 * The field id `enter_field` names for each field gate (FS-X2F2H §Requirements 2, 11; FS-3QHQZ).
 * A gate with no id here sends nothing.
 */
export const FIELD_IDS: Partial<Record<FieldDestination, FieldId>> = {
  forest: "forlorn_forest",
  meadows: "gentle_meadows",
  dev_test_room: "dev_test_room",
};

/**
 * The gates this build acts on, given its `NODE_ENV`: all of them, but a production build ignores
 * the dev gates (FS-BDRTJ §Requirements 2, 3; R23), since it can meet a server with them on.
 */
export function gatesInThisBuild(
  gates: readonly GateState[],
  nodeEnv: string | undefined,
): readonly GateState[] {
  if (nodeEnv !== "production") return gates;
  return gates.filter((gate) => !isDevGate(gate));
}

/**
 * The field a gate leads to, or undefined for the Spire's gate, a road home, the endgame test
 * run's gate, and no gate at all.
 */
export function fieldOf(gate: GateState | undefined): FieldDestination | undefined {
  if (!gate) return undefined;
  const { destination } = gate;
  if (destination === "spire" || destination === "hub" || destination === "dev_endgame_run") return undefined;
  return destination;
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
