/**
 * The player's own attacks, shared by every world that has monsters (FS-X2F2H §Requirements 56):
 * the targeted strike on a clicked monster (FS-77AB6 req 39) and the class casts on the left and
 * right click (FS-2325V §E.4, FS-KYPQ9 §D), with each class's kit (FS-8AY7S, FS-JTNPR, FS-MAMHR):
 * the archer's Shadow Shot hold, the Mercenary's cut, riposte and parry, and the ability lockout
 * the ability bar's square greys by. What is sent, which effect plays and the cooldowns live here; whether
 * the player may act at all (a menu open, fallen, escaped, the satchel under the pointer) is the
 * scene's to decide before it asks.
 */

import { ActionType } from "@/assets/types/client";
import type { socketManager } from "@/utils/class/SocketManager";
import type { PlayerState, ResourceState } from "@/types/gameState";
import type { Point } from "@/render/iso";
import { CHARGE_MS } from "@/render/effects/charge";
import type { Swing } from "@/render/art/character";
import { riposteArmed } from "@/render/effects/riposte";
import { parryRefused } from "@/ui/abilityBarView";
import { SHADOW_SHOT_COOLDOWN_MS, ShadowShotAim } from "@/scenes/shadowShotAim";
import { ArrowRainAim, arrowRainCentre } from "@/scenes/arrowRainAim";
import { wearsShadow } from "@/render/effects/heavyShot";
import { treeAbilityOf, treeAbilityReady } from "./treeAbility";

/**
 * A targeted `attack`'s reach, centre to centre in world px, and its cooldown in ms: the server's
 * (`targetedAttackRange`, 0.5 s). A click out of reach sends nothing.
 */
export const STRIKE_RANGE = 60;
export const STRIKE_COOLDOWN_MS = 500;
/**
 * How long a left-click cast, and a right-click one, hold the next cast back. The right-click's
 * is the ability lockout: the ability bar's right-click square is grey while it runs (FS-Q18Q3 R22).
 */
export const PRIMARY_COOLDOWN_MS = 250;
export const SPECIAL_COOLDOWN_MS = 400;
/**
 * The client's mirror of the server's attack pin (FS-JS7C8 R61): every attack sent holds the next
 * one back this long, fixed whatever gear is worn (D17), so it errs long and never short. Nothing
 * on the wire carries it (D9). The parry and the dash never start it.
 */
export const ATTACK_PIN_MS = 600;
/** How far from the warrior a primary slash lands, at most, in world px. */
const SLASH_REACH = 50;
/** The pointer button that is the right one. */
const RIGHT_BUTTON = 2;

/** Which click asked: the left's primary attack (free) or the right's class ability (priced by the server). */
export type CastButton = "primary" | "special";

/** What the combat says to the server, and the clock its cooldowns run on. */
export interface CombatPort {
  sendMessage: (typeof socketManager)["sendMessage"];
  later(ms: number, fn: () => void): void;
  /** The scene's clock now, ms: the Shadow Shot hold is timed on it. */
  now(): number;
  /**
   * Told the moment a cast that can strike has been sent: every primary, the right-click ability
   * that casts at once, a fired Shadow Shot, an Earthbreaker, an Arrow Rain or a Settle the Debt (FS-04EEA R40).
   * Never the archer's right-press, which sends nothing, the parry or a Blink, which strike nothing,
   * or a strike, whose `attack` names its own monster. The scene
   * names the hovered monster the last-hit one by it (FS-48CTQ §C.6).
   */
  castSent?(): void;
}

/** The four class abilities a player casts, by the skill each sends (FS-AND39 R4). */
export type AbilityCast = "dash" | "triple_fireball" | "shadow_shot" | "parry";

/** How an attack is seen: each effect from the player toward its target, both world positions. */
export interface CombatLook {
  slash(from: Point, to: Point): void;
  dash(from: Point, to: Point): void;
  arrow(from: Point, to: Point): void;
  fireball(from: Point, to: Point): void;
  /** The Mercenary's cut (FS-MAMHR §G.32), and the riposte slice it becomes when armed (§G.33). */
  cut(from: Point, to: Point): void;
  riposte(from: Point, to: Point): void;
  /** The Mercenary's stance tell, raised as `parry` is sent (FS-MAMHR §G.35). */
  parry(): void;
  /**
   * The archer's right-click release at the bow, as `shadow_shot` is sent (FS-JTNPR req 14):
   * the Shadow Shot's for a Shadow Ranger (`shadow`), the Heavy Shot's otherwise (FS-1J1CB §F R41).
   */
  shadowShot(from: Point, to: Point, shadow: boolean): void;
  /**
   * The archer's hold, drawn once a frame (FS-JTNPR req 10, 11): the figure turned to the cursor
   * now and the line from the bow toward it, faint until a release would fire; umbra for a Shadow
   * Ranger (`shadow`), vellum for any other archer (FS-1J1CB §F R42).
   */
  aim(from: Point, ready: boolean, shadow: boolean): void;
  /** The hold ended: no line left behind, the figure let go to its idle (req 15). */
  endAim(): void;
  /**
   * The class attack clip, aimed; `swing` marks a charge, its pose held while the server carries
   * the player (`CharacterMotion.attack`).
   */
  attackClip(aim: Point, swing?: Swing): void;
  /**
   * The ability's own client state changed: its lockout or the Shadow Shot hold started or ended, so the
   * ability bar's right-click square is judged again (FS-Q18Q3 R22, R23, R40).
   */
  abilityChanged?(): void;
  /**
   * A class ability was just sent, once per send (FS-AND39 R4): its own hook, since the mage's
   * Triple Fireball draws with the primary's `fireball`. Never a primary, a strike, the archer's
   * press, or a cast held back.
   */
  abilityCast?(ability: AbilityCast): void;
  /**
   * The tree abilities' looks, each as its cast is sent (FS-04EEA §H R42–R46), beside the attack clip: the slam
   * round the warrior, the blink-out where the mage stands, the flurry round the mercenary for the parry
   * charges it spends. A scene that sets none plays nothing.
   */
  earthbreaker?(from: Point): void;
  blink?(from: Point, to: Point): void;
  settleTheDebt?(from: Point, charges: number): void;
  /**
   * The Arrow Rain sent from `from` onto the circle centred at `centre` (FS-04EEA §H R45): its volleys. A
   * scene that sets none plays nothing.
   */
  arrowRain?(from: Point, centre: Point): void;
  /**
   * The archer's Arrow Rain aim, drawn once a frame (FS-04EEA R38): the ground circle centred at `centre`, a
   * world point already pulled in to the server's reach. Local only (ADR-0030).
   */
  rainAim?(centre: Point): void;
  /** The Arrow Rain aim ended, cast or cancelled: no circle left behind. */
  endRainAim?(): void;
}

/**
 * This client's player as the latest state reported them: the parry, riposte and resource gates,
 * and the specialization the archer's right-click is drawn by (FS-1J1CB §F R41, R42).
 */
export type CombatSelf = () =>
  | Pick<
      PlayerState,
      "parry_open" | "parry_lockout" | "resource" | "specialization" | "passive_ranks" | "tree_ability_cooldown"
    >
  | null
  | undefined;

export class PlayerCombat {
  private canStrike = true;
  private canCast = true;
  private abilityLockedOut = false;
  /** When the tracked attack pin ends, on the port's clock; none running before then. */
  private pinnedUntil = -Infinity;
  /** The archer's Shadow Shot hold (FS-JTNPR req 8–17): client presentation only (ADR-0030). */
  private readonly hold = new ShadowShotAim();
  /** The archer's Arrow Rain aim on key 3 (FS-04EEA R38): client presentation only (ADR-0030). */
  private readonly rain = new ArrowRainAim();

  constructor(
    private readonly port: CombatPort,
    private readonly look: CombatLook,
    private readonly self: CombatSelf = () => undefined,
  ) {}

  /** Whether an archer is drawing a Shadow Shot: no other click is answered, the keys read released. */
  get aiming(): boolean {
    return this.hold.aiming;
  }

  /**
   * Whether an archer is aiming Arrow Rain (FS-04EEA R38): no click is answered, but the archer keeps
   * walking, so it is never {@link aiming}.
   */
  get rainAiming(): boolean {
    return this.rain.aiming;
  }

  /**
   * Whether the client's own lockout after an ability runs (FS-8AY7S req 31): the right-click's,
   * or Shadow Shot's cooldown mirror from a fired shot (FS-JTNPR req 13).
   */
  get lockedOut(): boolean {
    return this.abilityLockedOut;
  }

  /**
   * A targeted `attack` on the monster standing at world point `them`, from `me`: sent only off
   * cooldown, out of the attack pin and within reach, as the server would refuse anything else. An archer's right button
   * is the Shadow Shot hold, and a hold answers no click (FS-JTNPR req 8, 16): `button` is the
   * pointer button that pressed. Whether it was sent.
   */
  strike(me: Point, entityId: string, them: Point, playerClass?: string, button?: number): boolean {
    if (this.hold.aiming || this.rain.aiming) return false;
    if (button === RIGHT_BUTTON && playerClass === "archer") return false;
    if (!this.canStrike || this.pinned()) return false;
    // world positions, never the sprites' screen positions
    if (Math.hypot(them.x - me.x, them.y - me.y) > STRIKE_RANGE) return false;

    this.port.sendMessage(ActionType.Attack, { enemy_entity_id: entityId });
    this.pin();
    this.look.slash({ x: me.x, y: me.y }, { x: them.x, y: them.y });
    this.look.attackClip({ x: them.x - me.x, y: them.y - me.y });
    this.canStrike = false;
    this.port.later(STRIKE_COOLDOWN_MS, () => {
      this.canStrike = true;
    });
    return true;
  }

  /**
   * The class cast a click asks for, from `me` toward the world point `target`. The archer's
   * right-press only starts the Shadow Shot hold, and the Mercenary's sends `parry`, gated by the
   * latest state alone (FS-JTNPR req 8; FS-MAMHR §C.10, §G.35); every other cast waits out the
   * cooldown and the attack pin (FS-JS7C8 R62), and the class attack clip rides the same trigger as the effect (FS-2325V §E.4).
   * Whether anything was cast or begun.
   */
  cast(button: CastButton, playerClass: string, from: Point, target: Point): boolean {
    // one hold at a time: a click during an Arrow Rain aim is ignored (FS-04EEA R38, R39)
    if (this.hold.aiming || this.rain.aiming) return false;
    // a copy: the effects are handed where the player stood, never the drawn position itself
    const me = { x: from.x, y: from.y };

    // a hold may begin at any time; its release is what the cooldown gates (ADR-0030)
    if (button === "special" && playerClass === "archer") {
      if (this.hold.press(this.port.now())) {
        this.aimFrame(me);
        // the square is active while the hold lasts (FS-Q18Q3 R23)
        this.look.abilityChanged?.();
      }
      return true;
    }
    // the parry costs nothing and has no cooldown: never the cut's own lockout
    if (button === "special" && playerClass === "mercenary") return this.parry(target);
    if (!this.canCast || this.pinned()) return false;

    const aim = { x: target.x - me.x, y: target.y - me.y };
    if (button === "primary") {
      this.primary(playerClass, me, target);
      this.pin();
      this.port.castSent?.();
      this.look.attackClip(aim, undefined);
      this.lockFor(PRIMARY_COOLDOWN_MS, false);
    } else {
      this.special(playerClass, me, target);
      // a warrior's charge holds the whole pose for as long as the server carries them (§D.2),
      // never split over the walk (FS-3V7GC R6)
      this.look.attackClip(aim, playerClass === "warrior" ? { charge: true, holdMs: CHARGE_MS } : undefined);
      this.lockFor(SPECIAL_COOLDOWN_MS, true);
    }
    return true;
  }

  /**
   * Key 3 pressed (FS-04EEA R35–R37, R39, R40): one `cast_skill` for a `playerClass` character's tree ability
   * at the world point `target`, from `me`, when the latest state shows it held, off cooldown and affordable
   * and no Shadow Shot hold is in progress; nothing on a key's auto-repeat (`repeat`). The archer's press sends
   * nothing: it starts the Arrow Rain aim, its circle drawn at `target` (R38), and {@link releaseTreeAbility}
   * casts. Whether the player may act at all (a menu open, resolved) is the scene's to decide before it asks.
   * Whether it was sent or an aim begun.
   */
  treeAbility(playerClass: string, me: Point, target: Point, repeat = false): boolean {
    if (repeat || this.hold.aiming || this.rain.aiming) return false;
    const ability = treeAbilityOf(playerClass);
    if (ability === null) return false;
    const self = this.self();
    if (!treeAbilityReady(playerClass, self)) return false;

    if (ability === "arrow_rain") {
      this.rain.press();
      this.look.rainAim?.(arrowRainCentre(me, target));
      return true;
    }

    // a pinned caster's casts are refused, so the send waits the pin out (FS-JS7C8 R62)
    if (this.pinned()) return false;
    // a copy: the effects are handed where the player stood, never the drawn position itself
    const from = { x: me.x, y: me.y };
    this.port.sendMessage(ActionType.CastSkill, { skill_id: ability, target_x: target.x, target_y: target.y });
    this.pin();
    // the class attack clip aimed at the target, on the send as every ability's (R42)
    this.look.attackClip({ x: target.x - from.x, y: target.y - from.y });
    if (ability === "blink") {
      this.look.blink?.(from, target);
      return true;
    }
    this.port.castSent?.();
    if (ability === "earthbreaker") this.look.earthbreaker?.(from);
    else this.look.settleTheDebt?.(from, self?.resource?.current ?? 0);
    return true;
  }

  /**
   * The hold, once a frame, from where the archer is drawn now (FS-JTNPR req 10, 11): never ready while the
   * attack pin runs, which gates the release as the cooldown does (FS-JS7C8 R63); and an Arrow Rain aim's
   * circle at the world point `cursor` under the cursor now, pulled in to the reach (FS-04EEA R38).
   */
  aimFrame(from: Point | undefined, cursor?: Point): void {
    if (!from) return;
    if (this.hold.aiming) this.look.aim(from, !this.pinned() && this.hold.ready(this.port.now(), this.resource()), this.shadow());
    if (this.rain.aiming && cursor) this.look.rainAim?.(arrowRainCentre(from, cursor));
  }

  /**
   * Key 3 let go (FS-04EEA R38, R40): an Arrow Rain aim sends one `arrow_rain` at the circle's centre, the
   * world point `cursor` pulled in to the reach from `me`, when the tree-ability gates still hold (R36), and
   * counts as a cast that can strike; any other release ends the aim with nothing sent. No circle is left
   * either way. Whether it was sent.
   */
  releaseTreeAbility(playerClass: string, me: Point, cursor: Point): boolean {
    const outcome = this.rain.release(!this.pinned() && treeAbilityReady(playerClass, this.self()));
    if (outcome === null) return false;
    this.look.endRainAim?.();
    if (outcome !== "cast") return false;

    const from = { x: me.x, y: me.y };
    const centre = arrowRainCentre(from, cursor);
    this.port.sendMessage(ActionType.CastSkill, { skill_id: "arrow_rain", target_x: centre.x, target_y: centre.y });
    this.pin();
    this.port.castSent?.();
    this.look.attackClip({ x: centre.x - from.x, y: centre.y - from.y });
    this.look.arrowRain?.(from, centre);
    return true;
  }

  /**
   * The right button let go (FS-JTNPR req 13, 14, 18): a ready, affordable hold sends exactly one
   * `shadow_shot` at the world point `target`, and plays the release and the attack clip on that
   * send; any other release, one during the attack pin included (FS-JS7C8 R63), ends the hold
   * with nothing sent or played. Whether it fired.
   */
  releaseAim(from: Point | undefined, target: Point): boolean {
    if (this.pinned()) {
      this.cancelAim();
      return false;
    }
    const outcome = this.hold.release(this.port.now(), this.resource());
    if (outcome === null) return false;
    this.look.endAim();
    if (outcome !== "fire" || !from) {
      this.look.abilityChanged?.();
      return false;
    }

    const me = { x: from.x, y: from.y };
    this.port.sendMessage(ActionType.CastSkill, {
      skill_id: "shadow_shot",
      target_x: target.x,
      target_y: target.y,
    });
    this.pin();
    this.port.castSent?.();
    this.look.abilityCast?.("shadow_shot");
    this.look.shadowShot(me, target, this.shadow());
    this.look.attackClip({ x: target.x - me.x, y: target.y - me.y });

    // the square greys for exactly the cooldown the next release is gated by, the hold over (FS-Q18Q3 R22)
    this.abilityLockedOut = true;
    this.look.abilityChanged?.();
    this.port.later(SHADOW_SHOT_COOLDOWN_MS, () => {
      this.abilityLockedOut = false;
      this.look.abilityChanged?.();
    });
    return true;
  }

  /**
   * Ends a hold, or an Arrow Rain aim, with nothing sent and no cooldown started (FS-JTNPR req 15, FS-04EEA
   * R38): death, a floor change, the menu or equipment panel, a release off the canvas, the window losing
   * focus. No line or circle is left behind.
   */
  cancelAim(): void {
    if (this.rain.cancel()) this.look.endRainAim?.();
    if (!this.hold.cancel()) return;
    this.look.endAim();
    this.look.abilityChanged?.();
  }

  /** Ready to strike and cast at once, no hold, cooldown or pin carried over: a new world or a new run. */
  reset(): void {
    this.canStrike = true;
    this.canCast = true;
    this.abilityLockedOut = false;
    this.pinnedUntil = -Infinity;
    this.hold.reset();
    this.rain.cancel();
  }

  /** Whether the archer's right-click wears the shadow: a Shadow Ranger's alone (FS-1J1CB §F R39). */
  private shadow(): boolean {
    return wearsShadow(this.self()?.specialization);
  }

  /** Whether the tracked attack pin runs: every attack click but the parry is ignored (FS-JS7C8 R62). */
  private pinned(): boolean {
    return this.port.now() < this.pinnedUntil;
  }

  /** Starts the tracked attack pin, on the send of an attack that pins (FS-JS7C8 R61). */
  private pin(): void {
    this.pinnedUntil = this.port.now() + ATTACK_PIN_MS;
  }

  /** The class resource as last broadcast; none from an older server (FS-JTNPR req 18). */
  private resource(): ResourceState | undefined {
    return this.self()?.resource;
  }

  /**
   * A merc's right-click (FS-MAMHR §G.35): sends `parry` and raises the stance tell, unless the
   * latest state shows the stance open or the whiff lockout running, where the server would
   * refuse it and nothing is sent. The cast carries the cursor's world point as every cast does;
   * the stance is not directional and the server ignores it (§C.10). No attack clip.
   */
  private parry(target: Point): boolean {
    if (parryRefused(this.self())) return false;
    this.port.sendMessage(ActionType.CastSkill, { skill_id: "parry", target_x: target.x, target_y: target.y });
    this.look.abilityCast?.("parry");
    this.look.parry();
    return true;
  }

  /** Holds the next cast back for `ms`; an ability's hold is the lockout the bar's square greys for. */
  private lockFor(ms: number, ability: boolean): void {
    this.canCast = false;
    if (ability) {
      this.abilityLockedOut = true;
      this.look.abilityChanged?.();
    }
    this.port.later(ms, () => {
      this.canCast = true;
      if (!ability) return;
      this.abilityLockedOut = false;
      this.look.abilityChanged?.();
    });
  }

  private primary(playerClass: string, me: Point, target: Point): void {
    if (playerClass === "warrior") {
      // the blade reaches no further than SLASH_REACH toward the pointer
      const angle = Math.atan2(target.y - me.y, target.x - me.x);
      const reach = Math.min(Math.hypot(target.x - me.x, target.y - me.y), SLASH_REACH);
      const hit = { x: me.x + Math.cos(angle) * reach, y: me.y + Math.sin(angle) * reach };
      this.look.slash(me, hit);
      this.port.sendMessage(ActionType.CastSkill, { skill_id: "slash", target_x: hit.x, target_y: hit.y });
      return;
    }
    if (playerClass === "archer") {
      this.port.sendMessage(ActionType.CastSkill, { skill_id: "arrow", target_x: target.x, target_y: target.y });
      this.look.arrow(me, target);
      return;
    }
    if (playerClass === "mercenary") {
      // the cut, toward the cursor; the server resolves its cone (FS-MAMHR §B.6, §G.32). At 3
      // parry charges (a Duelist's 2, never for a Sellsword: FS-E1ZDG §L R45) the server throws
      // it as the riposte, so the riposte slice plays (§G.33)
      const riposte = riposteArmed(this.self());
      this.port.sendMessage(ActionType.CastSkill, { skill_id: "cut", target_x: target.x, target_y: target.y });
      if (riposte) this.look.riposte(me, target);
      else this.look.cut(me, target);
      return;
    }
    this.port.sendMessage(ActionType.CastSkill, { skill_id: "fireball", target_x: target.x, target_y: target.y });
    this.look.fireball(me, target);
  }

  /** The right-click ability of a class that casts at once; the archer's and the merc's are above. */
  private special(playerClass: string, me: Point, target: Point): void {
    const at = { target_x: target.x, target_y: target.y };
    if (playerClass === "warrior") {
      this.port.sendMessage(ActionType.CastSkill, { skill_id: "dash", ...at });
      this.port.castSent?.();
      this.look.abilityCast?.("dash");
      this.look.dash(me, target);
    } else if (playerClass === "mage") {
      this.port.sendMessage(ActionType.CastSkill, { skill_id: "triple_fireball", ...at });
      this.pin();
      this.port.castSent?.();
      this.look.abilityCast?.("triple_fireball");
      this.look.fireball(me, target);
    }
  }
}
