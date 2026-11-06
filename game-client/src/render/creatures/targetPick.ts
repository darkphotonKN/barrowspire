/**
 * Which monster the target frame names (FS-48CTQ §C.5–7), as pure rules the scene feeds.
 *
 * The frame names, highest first: the hovered monster, else an engaged boss (FS-48CTQ §D,
 * {@link engagedBoss}), else the monster the local player last hit, else nothing. Only a living
 * monster whose sprite is shown can be named: a corpse, one hidden by the dark or the fog, one gone
 * from the broadcast and every player are passed over, since only monsters are ever among the
 * shown.
 *
 * The wire carries no attacker (FS-48CTQ "Facts"), so "the player's own hit" is read from what the
 * client knows: its own `attack` intents. A drop in the named monster's health within
 * {@link HIT_WINDOW_MS} of an intent naming it is the player's hit. A drop with no such intent, a
 * teammate's or an aimed skill's that names no monster, restarts nothing.
 *
 * Nor does the wire carry an aggro target (FS-48CTQ "Facts"), so "the boss is fighting us" is read
 * from what it does send: its health, its action and where it stands against the run's players.
 */

import type { MonsterState, PlayerState } from "@/types/gameState";
import { resolved } from "@/ui/party";

/** How long the last-hit monster holds the frame after the player's last hit on it (§C.5.3). */
export const LAST_HIT_HOLD_MS = 3000;
/** How soon after an intent a drop in its monster's health counts as the player's hit (§C.6). */
export const HIT_WINDOW_MS = 1000;

/**
 * The demon's leash radius, in px: how far it follows before giving up
 * (`game-service/internal/game/monster_tuning.go`, `MonsterArchetypeDemon.LeashRadius`). Within
 * it of a living member while moving or attacking, it is taken as engaged (§D.10).
 */
export const BOSS_LEASH_PX = 700;

const alive = (monster: MonsterState) => monster.action !== "dead";

/** The slice of a run's player the engaged rule reads: where they stand, and whether still in. */
export type PartyMember = Pick<
  PlayerState,
  "position" | "escape" | "current_health"
>;

/**
 * Whether `boss` is engaged (FS-48CTQ §D.10): alive, and either below its maximum health (only the
 * party can hurt it) or within {@link BOSS_LEASH_PX} of a living member while it moves or attacks.
 * `members` are the run's players, the local one among them; an escaped or fallen one is not near.
 */
export function engaged(
  boss: MonsterState,
  members: readonly PartyMember[],
): boolean {
  if (!alive(boss)) return false;
  if (boss.current_health < boss.max_health) return true;
  if (boss.action !== "move" && boss.action !== "attack") return false;
  return members.some(
    (member) =>
      !resolved(member) &&
      Math.hypot(
        member.position.x - boss.position.x,
        member.position.y - boss.position.y,
      ) <= BOSS_LEASH_PX,
  );
}

/** The engaged boss among the shown monsters, by `entity_id`: {@link TargetSlots.engagedBoss}. */
export function engagedBoss(
  shown: readonly MonsterState[],
  members: readonly PartyMember[],
): string | undefined {
  return shown.find((m) => m.boss && engaged(m, members))?.entity_id;
}

/** What the frame may name this frame: each slot by `entity_id`, and the monsters shown. */
export interface TargetSlots {
  /** The living monsters whose sprites are shown, as the latest broadcast has them. */
  shown: readonly MonsterState[];
  /** The monster under the pointer (the strike-mark cursor's hit test). */
  hovered?: string;
  /** An engaged boss (FS-48CTQ §D, {@link engagedBoss}). */
  engagedBoss?: string;
  /** The monster the local player last hit, while its hold lasts ({@link LastHitTracker}). */
  lastHit?: string;
}

/** The monster the frame names, or `null` to hide it (§C.5, §C.7). */
export function pickTarget(slots: TargetSlots): MonsterState | null {
  for (const id of [slots.hovered, slots.engagedBoss, slots.lastHit]) {
    if (!id) continue;
    const monster = slots.shown.find((m) => m.entity_id === id);
    if (monster && alive(monster)) return monster;
  }
  return null;
}

/**
 * The last-hit monster (§C.6): named by the latest `attack` intent the moment it is sent, held
 * {@link LAST_HIT_HOLD_MS} from then and from each drop in its health that arrives within
 * {@link HIT_WINDOW_MS} of an intent naming it. It lets go when the hold runs out, or at once when
 * its monster dies or leaves the broadcast. Times are the scene clock's, in ms.
 */
export class LastHitTracker {
  private target?: string;
  /** When the latest intent at {@link target} was sent. */
  private aimedAt = 0;
  /** When the hold runs out. */
  private holdUntil = 0;
  /** The target's health as last seen, to tell a drop. */
  private health = 0;

  /** The local player sent an `attack` naming `monster` at `now`. */
  aimed(monster: MonsterState, now: number): void {
    this.target = monster.entity_id;
    this.aimedAt = now;
    this.holdUntil = now + LAST_HIT_HOLD_MS;
    this.health = monster.current_health;
  }

  /** A broadcast's monsters at `now`: a drop that counts restarts the hold; death or absence ends it. */
  observe(monsters: readonly MonsterState[], now: number): void {
    if (!this.target) return;
    const monster = monsters.find((m) => m.entity_id === this.target);
    if (!monster || !alive(monster)) {
      this.clear();
      return;
    }
    const dropped = monster.current_health < this.health;
    this.health = monster.current_health;
    if (dropped && now - this.aimedAt <= HIT_WINDOW_MS)
      this.holdUntil = now + LAST_HIT_HOLD_MS;
  }

  /** The last-hit monster's `entity_id` at `now`, while its hold lasts. */
  current(now: number): string | undefined {
    return this.target && now < this.holdUntil ? this.target : undefined;
  }

  /** Forget the target: a new floor or a new run. */
  clear(): void {
    this.target = undefined;
    this.holdUntil = 0;
  }
}
