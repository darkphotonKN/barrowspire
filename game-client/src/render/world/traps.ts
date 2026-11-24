/**
 * A floor's detected traps on the canvas (FS-5FZ4J §J R51): each listed trap drawn from its baked
 * sheet at its cell's centre, faint (its armed frame at reduced alpha) while it waits, and its
 * **spring** played at full strength when R48's events fire against the previous broadcast: its
 * `armed` falling, or a gas vent's `puffed_at` changing. A first sight is the baseline: a trap
 * first seen sprung shows sprung and plays nothing. The broadcast is the whole truth: a trap no
 * longer listed goes; a kind this client does not know draws nothing. Never on the minimap (R56).
 *
 * The looks are `sealLooks.ts`'s; this set only places them, through {@link TrapStage}, the slice
 * of Phaser it needs, so it is tested without a canvas, as `SealSet` is.
 */

import type { Point } from "@/render/iso/projection";
import { knownTrap, type TrapKind, type TrapState } from "@/types/gameState";
import { TRAP_FAINT, trapLook, type SealLook } from "./sealLooks";

/** What the set asks of the scene. */
export interface TrapStage<S extends { destroy(): void }> {
  /** A trap standing at `at`, in `look`, at `alpha`. */
  add(look: SealLook, at: Point, alpha: number): S;
  /** A still frame at an alpha. */
  show(sprite: S, look: SealLook, alpha: number): void;
  /** The spring, played once at full strength; with `settle`, the frame it comes back to when done (a puff). */
  spring(sprite: S, look: SealLook, settle?: { look: SealLook; alpha: number }): void;
}

interface DrawnTrap<S> {
  kind: TrapKind;
  sprite: S;
  pos: Point;
  armed: boolean;
  puffedAt?: number;
}

/** A trap's still frame for its state: faint and armed while it waits, full strength once sprung. */
function still(kind: TrapKind, armed: boolean): { look: SealLook; alpha: number } {
  return armed ? { look: trapLook(kind, "armed"), alpha: TRAP_FAINT } : { look: trapLook(kind, "sprung"), alpha: 1 };
}

export class TrapSet<S extends { destroy(): void }> {
  private readonly traps = new Map<string, DrawnTrap<S>>();

  constructor(private readonly stage: TrapStage<S>) {}

  /** Make the canvas match the broadcast; the traps wait for the floor's grid, which places their cells. */
  sync(listed: TrapState[] | undefined, grid: { readonly cell: number } | undefined): void {
    const wire = listed ?? [];
    const present = new Set(wire.map((t) => t.entity_id));
    for (const [id, t] of this.traps) {
      if (present.has(id)) continue;
      t.sprite.destroy();
      this.traps.delete(id);
    }
    if (!grid) return;
    for (const trap of wire) {
      const kind = knownTrap(trap.kind);
      if (!kind) continue;
      const held = this.traps.get(trap.entity_id);
      if (!held || held.kind !== kind) {
        held?.sprite.destroy();
        const pos = { x: (trap.cell.x + 0.5) * grid.cell, y: (trap.cell.y + 0.5) * grid.cell };
        const { look, alpha } = still(kind, trap.armed);
        this.traps.set(trap.entity_id, { kind, sprite: this.stage.add(look, pos, alpha), pos, armed: trap.armed, puffedAt: trap.puffed_at });
        continue;
      }
      this.turn(held, trap);
    }
  }

  /** Each sprite drawn, with where it stands: what the hide rule and the blackout read. */
  placed(): { readonly sprite: S; readonly pos: Point }[] {
    return [...this.traps.values()].map(({ sprite, pos }) => ({ sprite, pos }));
  }

  /** Destroy every trap and forget them: the next sight of each is a first. */
  clear(): void {
    for (const t of this.traps.values()) t.sprite.destroy();
    this.forget();
  }

  /** Forget everything without touching it: the scene has already destroyed its objects. */
  forget(): void {
    this.traps.clear();
  }

  /** A held trap against this broadcast: a spring on armed falling or a puff, a still frame on re-arming. */
  private turn(t: DrawnTrap<S>, wire: TrapState): void {
    const puffed = wire.puffed_at !== undefined && wire.puffed_at !== t.puffedAt;
    t.puffedAt = wire.puffed_at;
    if (t.armed && !wire.armed) this.stage.spring(t.sprite, trapLook(t.kind, "sprung"));
    else if (!t.armed && wire.armed) {
      const { look, alpha } = still(t.kind, true);
      this.stage.show(t.sprite, look, alpha);
    } else if (puffed && wire.armed) this.stage.spring(t.sprite, trapLook(t.kind, "puff"), still(t.kind, true));
    t.armed = wire.armed;
  }
}
