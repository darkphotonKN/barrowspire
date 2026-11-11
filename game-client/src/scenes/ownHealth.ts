/**
 * The local player's health from one state to the next, and whether a state cost them health
 * (FS-1D6BX §Change: The container view closes when its player is hit, R19–R22). The state
 * carries no hit event: a landed hit costs at least 1 health (FS-MQYEX D4). Pure, no Phaser.
 */

/** A player's health as one state had it. */
export interface HealthSeen {
  current: number;
  /** Absent when the state sent none. */
  max?: number;
}

/** What `player`'s state says of their health, or undefined when it says nothing. */
export function healthIn(player: { current_health?: number; max_health?: number } | null | undefined): HealthSeen | undefined {
  if (player?.current_health === undefined) return undefined;
  return { current: player.current_health, max: player.max_health };
}

/**
 * Whether the player lost health to a hit between `before` and `now`, two states of one start:
 * health fell, and by more than max health fell, since gear taken off lowers both together.
 * Nothing seen before (the first state of a start) is no hit.
 */
export function costHealth(before: HealthSeen | undefined, now: HealthSeen): boolean {
  if (!before) return false;
  const maxFell = before.max !== undefined && now.max !== undefined ? Math.max(0, before.max - now.max) : 0;
  return before.current - now.current > maxFell;
}
