/**
 * Space, the roll's key (FS-7P736 §B R13, R14), bound in the run alone: a keydown event read from
 * `RUN_ACTIONS`, never an added key, so nothing captures Space and it types as a space in any field
 * (chat). The roll goes the held movement keys' way, the vector `move` sends, else the way the delver
 * faces; it is sent only when the client judges it allowed. The cooldown is never the client's: it
 * reads `roll_cooldown` off the wire (R14).
 *
 * Phaser-free, so the gate and the direction are tested without a scene.
 */

import type { RollPayload } from "@/assets/types/client";
import { facingVector, type Facing8 } from "@/render/iso/facing";
import type { PlayerState } from "@/types/gameState";
import { resolved } from "@/ui/party";
import type { UiState } from "@/ui/uiBridge";
import { RUN_ACTIONS } from "./runActions";

/** The keyboard the run binds Space on: Phaser's, or a test's. */
export interface RollKeyboard {
  on(event: string, fn: (event?: KeyboardEvent) => void): unknown;
}

/** What the run knows beside the state that holds a roll back (R13, R14). */
export interface RollGate {
  /** This player watches a teammate. */
  spectating: boolean;
  /** The client's own predicted roll is still in flight. */
  predicting: boolean;
  /** The UI scene's reported state: its menu reads the keys, or chat types. */
  ui: UiState;
}

/**
 * The direction to roll (R13): the held keys' vector unchanged, as `move` sends it (the server
 * normalises), else the facing's unit vector, so a well-behaved client never sends zero.
 */
export function rollDirection(held: { vx: number; vy: number }, facing: Facing8): RollPayload {
  if (held.vx !== 0 || held.vy !== 0) return { dir_x: held.vx, dir_y: held.vy };
  const v = facingVector(facing);
  return { dir_x: v.x, dir_y: v.y };
}

/**
 * Whether a press of Space rolls (R13, R14): a delver in play, not watching a teammate, with the menu
 * shut and chat not typing, no `roll_cooldown` running on the wire, and no roll under way, the
 * server's (`roll`) or the client's predicted one.
 */
export function rollAllowed(me: PlayerState | null | undefined, gate: RollGate): boolean {
  if (!me || resolved(me) || gate.spectating || gate.predicting) return false;
  if (gate.ui.menuOpen || gate.ui.typing) return false;
  if ((me.roll_cooldown?.remaining ?? 0) > 0) return false;
  return me.roll === undefined;
}

/** Binds Space on `keyboard`: each press, never the key's auto-repeat, handed to `roll`. */
export function bindRollKey(keyboard: RollKeyboard | null | undefined, roll: () => void): void {
  keyboard?.on(`keydown-${RUN_ACTIONS.roll.key}`, (event?: KeyboardEvent) => {
    if (event?.repeat) return;
    roll();
  });
}
