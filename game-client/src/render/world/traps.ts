/**
 * A floor's detected traps on the canvas (FS-5FZ4J §J R51): each listed trap drawn from its baked
 * sheet at its cell's centre, faint (its armed frame at reduced alpha) while it waits, and its
 * **spring** played at full strength when R48's events fire against the previous broadcast: its
 * `armed` falling, or a gas vent's `puffed_at` changing. A trap a book page revealed (`revealed`, FS-X2CMM
 * §J R49) waits clearer than one only detected, at {@link TRAP_REVEALED}, and washed as revealed for as long
 * as it is listed so, its spring included; a held trap turns revealed when the state says so, playing nothing. The floor's first sync (entering it, a
 * reconnect) is the baseline: a trap it lists sprung shows sprung and plays nothing. A trap newly
 * listed after it was just detected, and what it carries happened on the tick it was: one listed
 * sprung plays its spring, a gas vent listed with a puff plays it (the server detects a vent and
 * records its first, poisoning puff on one tick). The broadcast is the whole truth: a trap no
 * longer listed goes; a kind this client does not know draws nothing. Never on the minimap (R56).
 *
 * The looks are `sealLooks.ts`'s; this set only places them, through {@link TrapStage}, the slice
 * of Phaser it needs, so it is tested without a canvas, as `SealSet` is.
 */

import type { Point } from "@/render/iso/projection";
import { knownTrap, type TrapKind, type TrapState } from "@/types/gameState";
import { TRAP_FAINT, TRAP_REVEALED, trapLook, type SealLook } from "./sealLooks";

/** What the set asks of the scene. */
export interface TrapStage<S extends { destroy(): void }> {
  /** A trap standing at `at`, in `look`, at `alpha`. */
  add(look: SealLook, at: Point, alpha: number): S;
  /** A still frame at an alpha. */
  show(sprite: S, look: SealLook, alpha: number): void;
  /** The spring, played once at full strength; with `settle`, the frame it comes back to when done (a puff). */
  spring(sprite: S, look: SealLook, settle?: { look: SealLook; alpha: number }): void;
  /** Washed as a trap a page revealed, or not: kept over every frame it shows (FS-X2CMM R49). */
  reveal(sprite: S, revealed: boolean): void;
}

interface DrawnTrap<S> {
  kind: TrapKind;
  sprite: S;
  pos: Point;
  armed: boolean;
  revealed: boolean;
  puffedAt?: number;
}

/**
 * A trap's still frame for its state: armed while it waits, faint, or clearer once a page revealed it; full
 * strength once sprung.
 */
function still(kind: TrapKind, armed: boolean, revealed: boolean): { look: SealLook; alpha: number } {
  if (!armed) return { look: trapLook(kind, "sprung"), alpha: 1 };
  return { look: trapLook(kind, "armed"), alpha: revealed ? TRAP_REVEALED : TRAP_FAINT };
}

export class TrapSet<S extends { destroy(): void }> {
  private readonly traps = new Map<string, DrawnTrap<S>>();
  /** Whether the floor's first sync over its grid has run: after it, a newly listed trap's spring or puff plays. */
  private baseline = false;

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
        const revealed = trap.revealed === true;
        const { look, alpha } = still(kind, trap.armed, revealed);
        const sprite = this.stage.add(look, pos, alpha);
        if (revealed) this.stage.reveal(sprite, true);
        const drawn = { kind, sprite, pos, armed: trap.armed, revealed, puffedAt: trap.puffed_at };
        this.traps.set(trap.entity_id, drawn);
        if (this.baseline) this.firstSight(drawn);
        continue;
      }
      this.turn(held, trap);
    }
    this.baseline = true;
  }

  /** Each sprite drawn, with where it stands: what the hide rule and the blackout read. */
  placed(): { readonly sprite: S; readonly pos: Point }[] {
    return [...this.traps.values()].map(({ sprite, pos }) => ({ sprite, pos }));
  }

  /** Destroy every trap and forget them: the next sync is the floor's first again. */
  clear(): void {
    for (const t of this.traps.values()) t.sprite.destroy();
    this.forget();
  }

  /** Forget everything without touching it: the scene has already destroyed its objects. */
  forget(): void {
    this.traps.clear();
    this.baseline = false;
  }

  /** A trap newly listed past the floor's baseline: listed sprung, its spring; a vent listed with a puff, the puff. */
  private firstSight(t: DrawnTrap<S>): void {
    if (!t.armed) this.stage.spring(t.sprite, trapLook(t.kind, "sprung"));
    else if (t.puffedAt !== undefined) this.stage.spring(t.sprite, trapLook(t.kind, "puff"), still(t.kind, true, t.revealed));
  }

  /**
   * A held trap against this broadcast: its wash on turning revealed; then a spring on armed falling or a
   * puff, a still frame on re-arming, or, armed and newly revealed, its still frame at the revealed alpha.
   */
  private turn(t: DrawnTrap<S>, wire: TrapState): void {
    const revealed = wire.revealed === true;
    const turned = revealed !== t.revealed;
    t.revealed = revealed;
    if (turned) this.stage.reveal(t.sprite, revealed);
    const puffed = wire.puffed_at !== undefined && wire.puffed_at !== t.puffedAt;
    t.puffedAt = wire.puffed_at;
    const waiting = still(t.kind, true, revealed);
    if (t.armed && !wire.armed) this.stage.spring(t.sprite, trapLook(t.kind, "sprung"));
    else if (!t.armed && wire.armed) this.stage.show(t.sprite, waiting.look, waiting.alpha);
    else if (puffed && wire.armed) this.stage.spring(t.sprite, trapLook(t.kind, "puff"), waiting);
    else if (turned && wire.armed) this.stage.show(t.sprite, waiting.look, waiting.alpha);
    t.armed = wire.armed;
  }
}
