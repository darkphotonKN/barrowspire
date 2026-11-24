/**
 * How the player's own class kit is drawn, shared by every world that has monsters (FS-X2F2H
 * §Requirements 56): the Mercenary's cut, riposte slice, armed tell, stance tell and parry flash
 * (FS-MAMHR §G.32–§G.36), the archer's Shadow Shot aim line (FS-JTNPR req 11) and Arrow Rain aim circle
 * (FS-04EEA R38), and the tree abilities' looks (FS-04EEA §H R43–R46): the Earthbreaker slam, the Blink out
 * and in, the Arrow Rain volleys and the Settle the Debt flurry. Each piece is made on its first use, fed
 * every state and every frame, and taken down with the world. Only this client's own player is ever drawn by
 * it: a teammate's kit is never (FS-MAMHR §G.38), nor a teammate's tree ability (FS-04EEA R42).
 *
 * The tree abilities play on the world's effects runtime, reached through `sources` since a world makes its
 * runtime after its kit; before there is one they play nothing.
 */

import type * as Phaser from "phaser";
import type { PlayerState } from "@/types/gameState";
import type { Point } from "@/render/iso";
import { CutFx } from "@/render/effects/cut";
import { ParryFx } from "@/render/effects/parry";
import { RiposteFx, riposteArmed } from "@/render/effects/riposte";
import { AimLine } from "@/render/effects/aimLine";
import { AimCircle } from "@/render/effects/aimCircle";
import { PageReticle } from "@/render/effects/pageReticle";
import type { Reticle } from "@/scenes/pageAim";
import type { EffectsRuntime, FxArt } from "@/render/effects/runtime";
import { Staged } from "@/render/effects/staged";
import { playEarthbreaker } from "@/render/effects/earthbreaker";
import { BlinkLanding, playBlinkIn, playBlinkOut } from "@/render/effects/blink";
import { playSettleTheDebt } from "@/render/effects/settleTheDebt";
import { ArrowRain } from "@/render/effects/arrowRain";
import { resolved } from "@/ui/party";

/** The world's effects runtime and art, as they stand now: a world makes them after its kit. */
export interface KitSources {
  fx?(): EffectsRuntime | undefined;
  art?(): FxArt | undefined;
}

/** The owner the tree abilities' one-shots play under: the player's own, as their other casts. */
const SELF = "self";

export class ClassKitFx {
  /** The Mercenary's own stance tell and parry flash (FS-MAMHR §G.35, §G.36); made on first use. */
  parry?: ParryFx;
  /** The Mercenary's own armed tell and riposte slice (FS-MAMHR §G.33, §G.34); made on first use. */
  riposte?: RiposteFx;
  /** The Mercenary's own cut (FS-MAMHR §G.32); made on first use, so a teardown can take it down. */
  cut?: CutFx;
  /** The right-click hold's aim line (FS-JTNPR req 11, FS-1J1CB §F R42); made on the hold's first draw. */
  aimLine?: AimLine;
  /** Key 3's Arrow Rain aim circle (FS-04EEA R38); made on the aim's first draw. */
  aimCircle?: AimCircle;
  /** The armed class book page's reticle (FS-X2CMM R41); made on its first draw. */
  pageReticle?: PageReticle;
  /** The Arrow Rain volleys (FS-04EEA R45); made on the first rain. */
  private rain?: ArrowRain;
  /** The slam's rings and the flurry's cuts still to come (R43, R46); made on first use. */
  private steps?: Staged;
  /** Whether the own body's next jump is the Blink just sent (R44). */
  private readonly landing = new BlinkLanding();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sources: KitSources = {},
  ) {}

  /** Whether an Arrow Rain's volleys are still to land. */
  get raining(): boolean {
    return this.rain?.raining ?? false;
  }

  /**
   * Whether the merc's own parry stance is up, from the click's grace and then the server's word
   * (FS-MAMHR §G.35): the scene holds his guard clip for exactly as long.
   */
  get guarding(): boolean {
    return this.parry?.stanceShown ?? false;
  }

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

  /** Earthbreaker sent (R43): the slam round the warrior standing at `from`. */
  earthbreaker(from: Point): void {
    const fx = this.sources.fx?.();
    if (fx) playEarthbreaker(fx, this.staged(), SELF, from);
  }

  /** Blink sent at `now` (R44): the blink-out where the mage stands, and the next jump of the body is its landing. */
  blink(from: Point, now: number): void {
    const fx = this.sources.fx?.();
    if (!fx) return;
    playBlinkOut(fx, SELF, from);
    this.landing.arm(now);
  }

  /**
   * The jump rule placed the own body at `at` (R41): the blink-in there, when it is the Blink just sent
   * (R44). Any other jump plays nothing.
   */
  landed(at: Point, now: number): void {
    const fx = this.sources.fx?.();
    if (fx && this.landing.land(now)) playBlinkIn(fx, SELF, at);
  }

  /** Settle the Debt sent (R46): the flurry round the mercenary at `from`, for the `charges` it spends. */
  settleTheDebt(from: Point, charges: number): void {
    const fx = this.sources.fx?.();
    if (fx) playSettleTheDebt(fx, this.staged(), SELF, from, charges);
  }

  /** Arrow Rain sent from `from` onto the circle centred at `centre` (R45): its volleys. */
  arrowRain(from: Point, centre: Point): void {
    const fx = this.sources.fx?.();
    const art = this.sources.art?.();
    if (!fx || !art) return;
    this.rain ??= new ArrowRain(this.scene, art, fx);
    this.rain.start(from, centre);
  }

  /**
   * The floor is left (a climb): a rain stops drawing with the floor it fell on (R45), the slam's rings and
   * the flurry's cuts still to come are dropped, and a Blink still waiting lands nowhere.
   */
  leaveFloor(): void {
    this.rain?.stop();
    this.steps?.cancel();
    this.landing.forget();
  }

  /**
   * This client's own latest state (null: out of the world): the merc's stance and parries, and
   * their armed riposte from their own parry charges alone. Another class draws nothing. A player
   * out of the delve stops drawing their Arrow Rain (FS-04EEA R45, Edge States: Archer dies mid-rain).
   */
  sync(me: PlayerState | null | undefined, now: number): void {
    if (!me || resolved(me)) this.rain?.stop();
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

  /**
   * The hold's line from the bow toward `toward`, faint until a release would fire; umbra for a
   * Shadow Ranger (`shadow`), vellum for every other archer (FS-1J1CB §F R42).
   */
  aim(from: Point, toward: Point, ready: boolean, shadow: boolean): void {
    this.aimLine ??= new AimLine(() => this.scene.add.graphics());
    this.aimLine.draw(from, toward, ready, shadow);
  }

  /** The hold ended: no line left behind. */
  endAim(): void {
    this.aimLine?.clear();
  }

  /** The Arrow Rain aim's circle round `centre`, a world point already pulled in to the reach (FS-04EEA R38). */
  rainAim(centre: Point): void {
    this.aimCircle ??= new AimCircle(() => this.scene.add.graphics());
    this.aimCircle.draw(centre);
  }

  /** The Arrow Rain aim ended, cast or cancelled: no circle left behind. */
  endRainAim(): void {
    this.aimCircle?.clear();
  }

  /** The armed page's reticle this frame (FS-X2CMM R41), a world effect the run draws (ADR-0086 2.2). */
  reticle(reticle: Reticle): void {
    this.pageReticle ??= new PageReticle(() => this.scene.add.graphics());
    this.pageReticle.draw(reticle);
  }

  /** The page was cast or disarmed: no reticle left behind. */
  endReticle(): void {
    this.pageReticle?.clear();
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
    this.aimCircle?.forget();
    this.aimCircle = undefined;
    this.pageReticle?.forget();
    this.pageReticle = undefined;
    // the tree abilities' looks: a rain's volleys, the steps still to come, a Blink waiting to land
    this.rain?.stop();
    this.rain = undefined;
    this.steps?.cancel();
    this.steps = undefined;
    this.landing.forget();
  }

  /** The clock the slam's rings and the flurry's cuts are timed on, made on first use. */
  private staged(): Staged {
    this.steps ??= new Staged(this.scene.time);
    return this.steps;
  }
}
