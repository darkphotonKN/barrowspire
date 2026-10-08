/**
 * Death dust (FS-KYPQ9 §G.2): when a character's baked death clip completes, a low dust settle at
 * the body's feet over the table's 600 ms. Nothing else: no flash, no burst, no marks on the
 * corpse.
 *
 * Signal, unchanged: the `isDead` transition already plays the death clip (FS-2325V §E); this
 * plays off that clip's completion. A character with no baked sheet plays no clip, so no dust.
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey } from "./runtime";

/**
 * Whether an animation key (`sheet/animation/direction`, library `animationName`) is a death
 * clip, under any palette variant (`death_<variant>`).
 */
export function isDeathClip(key: string): boolean {
  const animation = key.split("/")[1];
  return animation === "death" || (animation?.startsWith("death_") ?? false);
}

/** The sub-layer over the corpse (`standAt(…, 1)`), so the body never hides its own dust. */
export const DUST_LAYER = 2;

/** Plays the dust settle on the ground at the body's world position, sorted in front of it. */
export function playDeathDust(
  fx: Pick<EffectsRuntime, "play">,
  owner: OwnerKey,
  at: Point,
): void {
  fx.play(owner, "deathDust", at, { layer: DUST_LAYER });
}

/**
 * Settles dust once per death. `CharacterAnimator.show` replays the death clip whenever its key
 * changes, and the key carries the facing, so a corpse that turns completes the clip again. Each
 * character is marked dusted on its first death clip and cleared when it is alive again. Keyed
 * weakly by the character's sprite, so a destroyed sprite takes its mark with it.
 */
export class DeathDust {
  private readonly dusted = new WeakSet<object>();

  /** A clip completed on `character`: dust settles if it is a death clip not yet dusted. */
  clipComplete(
    fx: Pick<EffectsRuntime, "play">,
    owner: OwnerKey,
    character: object,
    key: string,
    at: Point,
  ): void {
    if (!isDeathClip(key) || this.dusted.has(character)) return;
    this.dusted.add(character);
    playDeathDust(fx, owner, at);
  }

  /** The character is alive (again): its next death settles dust. */
  alive(character: object): void {
    this.dusted.delete(character);
  }
}
