/**
 * When a pending reach for a shut container is given up (FS-MQYEX R26, D13). The client only
 * gives up its own reach: whether the container opens is the server's to say. Pure, no Phaser.
 */

import type { Point } from "@/render/iso/projection";
import type { ClientGameState } from "@/types/gameState";

/** The server's interact range, in world px: farther than this from a container is out of reach. */
const INTERACT_RANGE = 60;

/** What the states have shown of a pending reach. */
export interface ReachSeen {
  /**
   * Where the first state to show the player's own timed open on the container reached for had
   * them: the place a later state is judged against. Unset until a state has shown it.
   */
  from?: Point;
}

/** A reach as it is made: no state has answered it yet. */
export function reachMade(): ReachSeen {
  return {};
}

/**
 * What `state` leaves of a pending reach for the shut container `entityId`, or undefined when it
 * gives the reach up. Always: the container has left the state, or the player is out of reach of
 * it. Once a state has shown their timed open on it: this one shows none, or has them somewhere
 * other than where that first state did. Before that no change of position is judged: the reply
 * is still on its way. Call it once the state's open containers are read, so a state that shows
 * the container open opens its view first.
 */
export function reachAfter(entityId: string, seen: ReachSeen, state: ClientGameState): ReachSeen | undefined {
  const container = state.containers?.find((c) => c.entity_id === entityId);
  if (!container) return undefined;
  const me = state.current_player;
  if (me && Math.hypot(me.position.x - container.position.x, me.position.y - container.position.y) > INTERACT_RANGE)
    return undefined;
  const timed = me?.timed_open?.entity_id === entityId;
  if (!seen.from) return me && timed ? { from: { x: me.position.x, y: me.position.y } } : seen;
  if (!me || !timed) return undefined;
  return me.position.x === seen.from.x && me.position.y === seen.from.y ? seen : undefined;
}
