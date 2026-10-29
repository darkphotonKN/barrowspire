/**
 * The player's own attacks, shared by every world that has monsters (FS-X2F2H §Requirements 56):
 * the targeted strike on a clicked monster (FS-77AB6 req 39) and the class casts on the left and
 * right click (FS-2325V §E.4, FS-KYPQ9 §D), with each class's kit (FS-8AY7S, FS-JTNPR, FS-MAMHR):
 * the archer's Shadow Shot hold, the Mercenary's cut, riposte and parry, and the ability lockout
 * the ability card greys by. What is sent, which effect plays and the cooldowns live here; whether
 * the player may act at all (a menu open, fallen, escaped, the satchel under the pointer) is the
 * scene's to decide before it asks.
 */

import { ActionType } from "@/assets/types/client";
import type { socketManager } from "@/utils/class/SocketManager";
import type { PlayerState, ResourceState } from "@/types/gameState";
import type { Point } from "@/render/iso";
import { CHARGE_MS } from "@/render/effects/charge";
import { riposteArmed } from "@/render/effects/riposte";
import { parryRefused } from "@/ui/abilityCard";
import { SHADOW_SHOT_COOLDOWN_MS, ShadowShotAim } from "@/scenes/shadowShotAim";

/**
 * A targeted `attack`'s reach, centre to centre in world px, and its cooldown in ms: the server's
 * (`targetedAttackRange`, 0.5 s). A click out of reach sends nothing.
 */
export const STRIKE_RANGE = 60;
export const STRIKE_COOLDOWN_MS = 500;
/**
 * How long a left-click cast, and a right-click one, hold the next cast back. The right-click's
 * is the ability lockout: the ability card is grey while it runs (FS-8AY7S req 31).
 */
export const PRIMARY_COOLDOWN_MS = 250;
export const SPECIAL_COOLDOWN_MS = 400;
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
}

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
  /** Shadow Shot's release at the bow (FS-JTNPR req 14). */
  shadowShot(from: Point, to: Point): void;
  /**
   * The archer's hold, drawn once a frame (FS-JTNPR req 10, 11): the figure turned to the cursor
   * now and the line from the bow toward it, faint until a release would fire.
   */
  aim(from: Point, ready: boolean): void;
  /** The hold ended: no line left behind, the figure let go to its idle (req 15). */
  endAim(): void;
  /** The class attack clip, aimed; `holdMs` keeps the pose while a charge carries the player. */
  attackClip(aim: Point, holdMs?: number): void;
  /** The ability lockout started or ended: the ability card redraws (FS-8AY7S req 31). */
  lockout?(): void;
}

/** This client's player as the latest state reported them: the parry, riposte and resource gates. */
export type CombatSelf = () => Pick<PlayerState, "parry_open" | "parry_lockout" | "resource"> | null | undefined;

export class PlayerCombat {
  private canStrike = true;
  private canCast = true;
  private abilityLockedOut = false;
  /** The archer's Shadow Shot hold (FS-JTNPR req 8–17): client presentation only (ADR-0030). */
  private readonly hold = new ShadowShotAim();

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
   * Whether the client's own lockout after an ability runs (FS-8AY7S req 31): the right-click's,
   * or Shadow Shot's cooldown mirror from a fired shot (FS-JTNPR req 13).
   */
  get lockedOut(): boolean {
    return this.abilityLockedOut;
  }

  /**
   * A targeted `attack` on the monster standing at world point `them`, from `me`: sent only off
   * cooldown and within reach, as the server would refuse anything else. An archer's right button
   * is the Shadow Shot hold, and a hold answers no click (FS-JTNPR req 8, 16): `button` is the
   * pointer button that pressed. Whether it was sent.
   */
  strike(me: Point, entityId: string, them: Point, playerClass?: string, button?: number): boolean {
    if (this.hold.aiming) return false;
    if (button === RIGHT_BUTTON && playerClass === "archer") return false;
    if (!this.canStrike) return false;
    // world positions, never the sprites' screen positions
    if (Math.hypot(them.x - me.x, them.y - me.y) > STRIKE_RANGE) return false;

    this.port.sendMessage(ActionType.Attack, { enemy_entity_id: entityId });
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
   * cooldown, and the class attack clip rides the same trigger as the effect (FS-2325V §E.4).
   * Whether anything was cast or begun.
   */
  cast(button: CastButton, playerClass: string, from: Point, target: Point): boolean {
    if (this.hold.aiming) return false;
    // a copy: the effects are handed where the player stood, never the drawn position itself
    const me = { x: from.x, y: from.y };

    // a hold may begin at any time; its release is what the cooldown gates (ADR-0030)
    if (button === "special" && playerClass === "archer") {
      if (this.hold.press(this.port.now())) this.aimFrame(me);
      return true;
    }
    // the parry costs nothing and has no cooldown: never the cut's own lockout
    if (button === "special" && playerClass === "mercenary") return this.parry(target);
    if (!this.canCast) return false;

    const aim = { x: target.x - me.x, y: target.y - me.y };
    if (button === "primary") {
      this.primary(playerClass, me, target);
      this.look.attackClip(aim, undefined);
      this.lockFor(PRIMARY_COOLDOWN_MS, false);
    } else {
      this.special(playerClass, me, target);
      // a warrior's charge holds the pose for as long as the server carries them (§D.2)
      this.look.attackClip(aim, playerClass === "warrior" ? CHARGE_MS : undefined);
      this.lockFor(SPECIAL_COOLDOWN_MS, true);
    }
    return true;
  }

  /** The hold, once a frame, from where the archer is drawn now (FS-JTNPR req 10, 11). */
  aimFrame(from: Point | undefined): void {
    if (!this.hold.aiming || !from) return;
    this.look.aim(from, this.hold.ready(this.port.now(), this.resource()));
  }

  /**
   * The right button let go (FS-JTNPR req 13, 14, 18): a ready, affordable hold sends exactly one
   * `shadow_shot` at the world point `target`, and plays the release and the attack clip on that
   * send; any other release ends the hold with nothing sent or played. Whether it fired.
   */
  releaseAim(from: Point | undefined, target: Point): boolean {
    const outcome = this.hold.release(this.port.now(), this.resource());
    if (outcome === null) return false;
    this.look.endAim();
    if (outcome !== "fire" || !from) return false;

    const me = { x: from.x, y: from.y };
    this.port.sendMessage(ActionType.CastSkill, {
      skill_id: "shadow_shot",
      target_x: target.x,
      target_y: target.y,
    });
    this.look.shadowShot(me, target);
    this.look.attackClip({ x: target.x - me.x, y: target.y - me.y });

    // the card greys for exactly the cooldown the next release is gated by (FS-8AY7S req 31)
    this.abilityLockedOut = true;
    this.look.lockout?.();
    this.port.later(SHADOW_SHOT_COOLDOWN_MS, () => {
      this.abilityLockedOut = false;
      this.look.lockout?.();
    });
    return true;
  }

  /**
   * Ends a hold with nothing sent and no cooldown started (FS-JTNPR req 15): death, a floor
   * change, the menu or equipment panel, a release off the canvas, the window losing focus.
   */
  cancelAim(): void {
    if (this.hold.cancel()) this.look.endAim();
  }

  /** Ready to strike and cast at once, no hold and no cooldown carried over: a new world or a new run. */
  reset(): void {
    this.canStrike = true;
    this.canCast = true;
    this.abilityLockedOut = false;
    this.hold.reset();
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
    this.look.parry();
    return true;
  }

  /** Holds the next cast back for `ms`; an ability's hold is the lockout the card greys for. */
  private lockFor(ms: number, ability: boolean): void {
    this.canCast = false;
    if (ability) {
      this.abilityLockedOut = true;
      this.look.lockout?.();
    }
    this.port.later(ms, () => {
      this.canCast = true;
      if (!ability) return;
      this.abilityLockedOut = false;
      this.look.lockout?.();
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
      // parry charges the server throws it as the riposte, so the riposte slice plays (§G.33)
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
      this.look.dash(me, target);
    } else if (playerClass === "mage") {
      this.port.sendMessage(ActionType.CastSkill, { skill_id: "triple_fireball", ...at });
      this.look.fireball(me, target);
    }
  }
}
