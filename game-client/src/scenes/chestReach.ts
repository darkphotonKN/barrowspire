/**
 * When a pending reach for a shut container is given up (FS-MQYEX R26, D13). The client only
 * gives up its own reach: whether the container opens is the server's to say. Pure, no Phaser.
 */

import type { Point } from "@/render/iso/projection";
import type { ClientGameState } from "@/types/gameState";

/** What the states have shown of a pending reach. */
export interface ReachSeen {
  /** Where the server had the player when they reached; unset when no state had placed them. */
  from?: Point;
  /** A state has shown the player's own timed open on the container reached for. */
  timed: boolean;
}

/** A reach as it is made: the player where `state` has them, and no timed open shown yet. */
export function reachMade(state: ClientGameState | undefined): ReachSeen {
  const from = state?.current_player?.position;
  return { from: from && { x: from.x, y: from.y }, timed: false };
}

/**
 * What `state` leaves of a pending reach for the shut container `entityId`, or undefined when it
 * gives the reach up: the container has left the state, the player's own position has changed, or
 * a state showed their timed open on it and this one shows none. A reach no state has answered is
 * kept: the reply is still on its way. Call it once the state's open containers are read, so a
 * state that shows the container open opens its view first.
 */
export function reachAfter(entityId: string, seen: ReachSeen, state: ClientGameState): ReachSeen | undefined {
  if (!state.containers?.some((c) => c.entity_id === entityId)) return undefined;
  const me = state.current_player;
  if (seen.from && me && (me.position.x !== seen.from.x || me.position.y !== seen.from.y)) return undefined;
  const timed = me?.timed_open?.entity_id === entityId;
  if (seen.timed && !timed) return undefined;
  return { ...seen, timed };
}
