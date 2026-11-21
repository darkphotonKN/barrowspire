/**
 * The stun tell (FS-04EEA §H R47–R48): over each monster the broadcast reports `stunned`, the
 * table's `stunTell` held at its head, for every viewer, since the stun is state on the wire and
 * not the caster's own effect (R42). It goes the frame the action changes, the monster dies or it
 * leaves the broadcast. A monster stunned mid-leap reports `stunned` for the rest of its flight;
 * the tell follows its body there, as drawn, and the leap's own ground mark lands as before.
 *
 *   const tells = new StunTells(fx);
 *   tells.show(roster.stunned()); // every frame, after the roster's update
 *   tells.clear();                // the world or the floor is going
 *
 * Drawn by the world scene that draws the monster (ADR-0086 2.1), never the UI scene. Each tell
 * plays under its own owner key, so releasing it never takes the monster's claw with it. The
 * runtime's `hideWhere` hides it with the monster's drawn position; its `clearAll` lets it go, and
 * the next {@link StunTells.show} draws it again.
 */

import type { Point } from "@/render/iso/projection";
import type { EffectsRuntime, OwnerKey, Played } from "./runtime";

/** A stunned monster as the tell needs it: its id, where it is drawn, and its head's height. */
export interface StunHead {
  id: string;
  /** World px, as drawn (eased). */
  at: Point;
  /** Screen px from its feet up to its head, where its marker stack begins. */
  lift: number;
}

/** The owner a monster's tell plays under: never the monster's own `entity_id`. */
export const stunOwner = (id: string): OwnerKey => `stun:${id}`;

export class StunTells {
  private readonly shown = new Map<string, Played>();

  constructor(private readonly fx: Pick<EffectsRuntime, "play" | "release" | "playing">) {}

  /** One frame: every head listed carries its tell, at its head; every other one goes. */
  show(heads: readonly StunHead[]): void {
    const listed = new Set(heads.map((h) => h.id));
    for (const id of this.shown.keys()) if (!listed.has(id)) this.drop(id);

    for (const { id, at, lift } of heads) {
      const owner = stunOwner(id);
      const held = this.shown.get(id);
      // the runtime may have let it go under us (a reset, a floor change): draw it again
      if (held && this.fx.playing(owner) > 0) {
        held.moveTo(at);
        continue;
      }
      // its lift is fixed at the play; a body does not change height while it stands stunned
      const played = this.fx.play(owner, "stunTell", at, { lift });
      if (played) this.shown.set(id, played);
      else this.shown.delete(id);
    }
  }

  /** Every tell taken away. */
  clear(): void {
    for (const id of [...this.shown.keys()]) this.drop(id);
  }

  private drop(id: string): void {
    this.fx.release(stunOwner(id), { now: true });
    this.shown.delete(id);
  }
}
