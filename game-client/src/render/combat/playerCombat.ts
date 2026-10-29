/**
 * The player's own attacks, shared by every world that has monsters (FS-X2F2H §Requirements 56):
 * the targeted strike on a clicked monster (FS-77AB6 req 39) and the class casts on the left and
 * right click (FS-2325V §E.4, FS-KYPQ9 §D). What is sent, which effect plays and the cooldowns
 * live here; whether the player may act at all (a menu open, fallen, escaped, the satchel under
 * the pointer) is the scene's to decide before it asks.
 */

import { ActionType } from "@/assets/types/client";
import type { socketManager } from "@/utils/class/SocketManager";
import type { Point } from "@/render/iso";
import { CHARGE_MS } from "@/render/effects/charge";

/**
 * A targeted `attack`'s reach, centre to centre in world px, and its cooldown in ms: the server's
 * (`targetedAttackRange`, 0.5 s). A click out of reach sends nothing.
 */
export const STRIKE_RANGE = 60;
export const STRIKE_COOLDOWN_MS = 500;
/** How long a left-click cast, and a right-click one, hold the next cast back. */
export const PRIMARY_COOLDOWN_MS = 250;
export const SPECIAL_COOLDOWN_MS = 400;
/** How far from the warrior a primary slash lands, at most, in world px. */
const SLASH_REACH = 50;

/** Which click asked: the left's primary attack (0 MP) or the right's class special (10 MP). */
export type CastButton = "primary" | "special";

/** What the combat says to the server, and the clock its cooldowns run on. */
export interface CombatPort {
  sendMessage: (typeof socketManager)["sendMessage"];
  later(ms: number, fn: () => void): void;
}

/** How an attack is seen: each effect from the player toward its target, both world positions. */
export interface CombatLook {
  slash(from: Point, to: Point): void;
  dash(from: Point, to: Point): void;
  arrow(from: Point, to: Point): void;
  fireball(from: Point, to: Point): void;
  /** The class attack clip, aimed; `holdMs` keeps the pose while a charge carries the player. */
  attackClip(aim: Point, holdMs?: number): void;
}

export class PlayerCombat {
  private canStrike = true;
  private canCast = true;

  constructor(
    private readonly port: CombatPort,
    private readonly look: CombatLook,
  ) {}

  /**
   * A targeted `attack` on the monster standing at world point `them`, from `me`: sent only off
   * cooldown and within reach, as the server would refuse anything else. Whether it was sent.
   */
  strike(me: Point, entityId: string, them: Point): boolean {
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
   * The class cast a click asks for, from `me` toward the world point `target`, off cooldown.
   * The class attack clip rides the same trigger as the effect (FS-2325V §E.4). Whether it was
   * cast.
   */
  cast(button: CastButton, playerClass: string, from: Point, target: Point): boolean {
    if (!this.canCast) return false;
    // a copy: the effects are handed where the player stood, never the drawn position itself
    const me = { x: from.x, y: from.y };
    const aim = { x: target.x - me.x, y: target.y - me.y };

    if (button === "primary") {
      this.primary(playerClass, me, target);
      this.look.attackClip(aim, undefined);
    } else {
      this.special(playerClass, me, target);
      // a warrior's charge holds the pose for as long as the server carries them (§D.2)
      this.look.attackClip(aim, playerClass === "warrior" ? CHARGE_MS : undefined);
    }

    this.canCast = false;
    this.port.later(button === "primary" ? PRIMARY_COOLDOWN_MS : SPECIAL_COOLDOWN_MS, () => {
      this.canCast = true;
    });
    return true;
  }

  /** Ready to strike and cast at once: a new world or a new run. */
  reset(): void {
    this.canStrike = true;
    this.canCast = true;
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
    this.port.sendMessage(ActionType.CastSkill, { skill_id: "fireball", target_x: target.x, target_y: target.y });
    this.look.fireball(me, target);
  }

  private special(playerClass: string, me: Point, target: Point): void {
    const at = { target_x: target.x, target_y: target.y };
    if (playerClass === "warrior") {
      this.port.sendMessage(ActionType.CastSkill, { skill_id: "dash", ...at });
      this.look.dash(me, target);
    } else if (playerClass === "mage") {
      this.port.sendMessage(ActionType.CastSkill, { skill_id: "triple_fireball", ...at });
      this.look.fireball(me, target);
    } else if (playerClass === "archer") {
      this.port.sendMessage(ActionType.CastSkill, { skill_id: "triple_arrow", ...at });
      this.look.arrow(me, target);
    }
  }
}
