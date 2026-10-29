/**
 * How the player's own class kit is drawn, shared by every world that has monsters (FS-X2F2H
 * §Requirements 56): the Mercenary's cut, riposte slice, armed tell, stance tell and parry flash
 * (FS-MAMHR §G.32–§G.36), and the archer's Shadow Shot aim line (FS-JTNPR req 11). Each piece is
 * made on its first use, fed every state and every frame, and taken down with the world. Only
 * this client's own player is ever drawn by it: a teammate's kit is never (FS-MAMHR §G.38).
 */

import type * as Phaser from "phaser";
import type { PlayerState } from "@/types/gameState";
import type { Point } from "@/render/iso";
import { CutFx } from "@/render/effects/cut";
import { ParryFx } from "@/render/effects/parry";
import { RiposteFx, riposteArmed } from "@/render/effects/riposte";
import { AimLine } from "@/render/effects/aimLine";

export class ClassKitFx {
  /** The Mercenary's own stance tell and parry flash (FS-MAMHR §G.35, §G.36); made on first use. */
  parry?: ParryFx;
  /** The Mercenary's own armed tell and riposte slice (FS-MAMHR §G.33, §G.34); made on first use. */
  riposte?: RiposteFx;
  /** The Mercenary's own cut (FS-MAMHR §G.32); made on first use, so a teardown can take it down. */
  cut?: CutFx;
  /** The Shadow Shot hold's aim line (FS-JTNPR req 11); made on the hold's first draw. */
  aimLine?: AimLine;

  constructor(private readonly scene: Phaser.Scene) {}

  playCut(from: Point, toward: Point): void {
    this.cut ??= new CutFx(this.scene);
    this.cut.play(from, toward);
  }

  playRiposte(from: Point, toward: Point): void {
    this.riposte ??= new RiposteFx(this.scene);
    this.riposte.play(from, toward);
  }

  /** The right-click that sent `parry`: the stance tell shows at once. */
  raiseParry(now: number): void {
    this.parry ??= new ParryFx(this.scene);
    this.parry.raise(now);
  }

  /**
   * This client's own latest state (null: out of the world): the merc's stance and parries, and
   * their armed riposte from their own parry charges alone. Another class draws nothing.
   */
  sync(me: PlayerState | null | undefined, now: number): void {
    if (this.parry || me?.parry_open !== undefined || me?.parries !== undefined) {
      this.parry ??= new ParryFx(this.scene);
      this.parry.sync(me, now);
    }
    if (this.riposte || riposteArmed(me)) {
      this.riposte ??= new RiposteFx(this.scene);
      this.riposte.sync(me, now);
    }
  }

  /** Each frame: the tells and flashes ride on the drawn body (the stance never roots: FS-MAMHR §C.13). */
  follow(at: Point, now: number): void {
    this.parry?.follow(at, now);
    this.riposte?.follow(at, now);
  }

  /** The hold's line from the bow toward `toward`, faint until a release would fire. */
  aim(from: Point, toward: Point, ready: boolean): void {
    this.aimLine ??= new AimLine(() => this.scene.add.graphics());
    this.aimLine.draw(from, toward, ready);
  }

  /** The hold ended: no line left behind. */
  endAim(): void {
    this.aimLine?.clear();
  }

  /**
   * The world is torn down (a restart, which a reconnect is, or leaving a field): everything
   * drawn goes, and the next first state is a fresh baseline, so a reconnect flashes nothing.
   */
  forget(): void {
    this.parry?.forget();
    this.parry = undefined;
    // the slice and the tell are drawn, not table effects: clearAll never sees them
    this.riposte?.forget();
    this.riposte = undefined;
    // nor a cut still fading
    this.cut?.forget();
    this.cut = undefined;
    this.aimLine?.forget();
    this.aimLine = undefined;
  }
}
