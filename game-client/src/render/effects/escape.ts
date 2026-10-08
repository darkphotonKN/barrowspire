/**
 * Escape (FS-KYPQ9 §G.3): a quiet column of pale light where a delver leaves, a few slow rising
 * motes and a short-lived `vellum` pool, all fading over the table's 1000 ms. It replaces the
 * 30-particle radial burst.
 *
 * Signal, unchanged: `current_player` becomes null, or a rival drops out of `other_players`. A
 * rival leaving may be an escape, a death clean-up or a disconnect, so the effect reads as
 * *gone*, not as triumph.
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey } from "./runtime";

/** Plays the escape column at a world position. Off-screen, its light is culled like any other. */
export function playEscape(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  at: Point,
): void {
  fx.play(owner, "escape", at);
}
