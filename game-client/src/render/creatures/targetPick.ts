/**
 * Which monster the target frame names (FS-48CTQ §C.5–7), as pure rules the scene feeds.
 *
 * The frame names, highest first: the hovered monster, else an engaged boss (FS-48CTQ §D,
 * {@link BossEngagement}), else the monster the local player last hit, else nothing. Only a living
 * monster whose sprite is shown can be named: a corpse, one hidden by the dark or the fog, one gone
 * from the broadcast and every player are passed over, since only monsters are ever among the
 * shown.
 *
 * The wire carries no attacker (FS-48CTQ "Facts"), so "the player's own hit" is read from what the
 * client knows: its own intents. An `attack` names its monster; a cast sent while a living, shown
 * monster is hovered names that one ({@link castTarget}). A drop in the named monster's health
 * within {@link HIT_WINDOW_MS} of an intent naming it is the player's hit. A drop with no such
 * intent, a teammate's or a cast's with nothing hovered, restarts nothing.
 *
 * Nor does the wire carry an aggro target (FS-48CTQ "Facts"), so "the boss is fighting us" is read
 * from what it does send: its health, its action and where it stands against the run's players,
 * and latched, since its action alone flickers between `move` and `idle` (review S2).
 */

import type { MonsterState, PlayerState } from "@/types/gameState";
import { resolved } from "@/ui/party";

/** How long the last-hit monster holds the frame after the player's last hit on it (§C.5.3). */
export const LAST_HIT_HOLD_MS = 3000;
/** How soon after an intent a drop in its monster's health counts as the player's hit (§C.6). */
export const HIT_WINDOW_MS = 1000;

/**
 * A boss's aggro radius, in px: how near a delver must come before it hunts. Both bosses share it,
 * the demon and the blood demon (`game-service/internal/game/monster_tuning.go`,
 * `MonsterArchetypeDemon.AggroRadius`; FS-VHGE7 §A). Unaggroed a boss wanders and still reports
 * `move` (`internal/systems/monster_ai.go:113-115`, `:233-236`), so only a `move` this near a
 * living member engages it (§D.10).
 */
export const BOSS_AGGRO_PX = 320;

/**
 * A boss's leash radius, in px: how far it follows before giving up. Both bosses share it, as they
 * do the aggro radius (`monster_tuning.go`, `MonsterArchetypeDemon.LeashRadius`; FS-VHGE7 §A). A
 * strike within it of a living member, an `attack` or a demon's `claw` (FS-VHGE7 §D R34), engages
 * it; at full health beyond it of every living member it lets go (§D.10).
 */
export const BOSS_LEASH_PX = 700;

const alive = (monster: MonsterState) => monster.action !== "dead";

/** The slice of a run's player the engaged rule reads: where they stand, and whether still in. */
export type PartyMember = Pick<
  PlayerState,
  "position" | "escape" | "current_health"
>;

/** Whether a living member stands within `px` of `boss`; an escaped or fallen one is not near. */
const memberWithin = (
  boss: MonsterState,
  members: readonly PartyMember[],
  px: number,
) =>
  members.some(
    (member) =>
      !resolved(member) &&
      Math.hypot(
        member.position.x - boss.position.x,
        member.position.y - boss.position.y,
      ) <= px,
  );

/** Below its maximum health: only the party can hurt it. A missing maximum reads as unhurt. */
const damaged = (boss: MonsterState) => boss.current_health < boss.max_health;

/**
 * Whether this broadcast engages `boss` (FS-48CTQ §D.10): alive, and either below its maximum
 * health, or moving within {@link BOSS_AGGRO_PX} of a living member, or striking (`attack`, or a
 * demon's `claw`, FS-VHGE7 §D R34) within {@link BOSS_LEASH_PX} of one. `members` are the run's
 * players, the local one among them. Idle engages nothing: the server reports it between wander
 * legs and between swings alike
 * (`monster_ai.go:124-128`, `:233-235`).
 */
export function engages(
  boss: MonsterState,
  members: readonly PartyMember[],
): boolean {
  if (!alive(boss)) return false;
  if (damaged(boss)) return true;
  if (boss.action === "move") return memberWithin(boss, members, BOSS_AGGRO_PX);
  if (boss.action === "attack" || boss.action === "claw")
    return memberWithin(boss, members, BOSS_LEASH_PX);
  return false;
}

/** Whether an engaged `boss` lets go: dead, or back at full health beyond its leash of everyone. */
const releases = (boss: MonsterState, members: readonly PartyMember[]) =>
  !alive(boss) ||
  (!damaged(boss) && !memberWithin(boss, members, BOSS_LEASH_PX));

/**
 * The engaged boss (FS-48CTQ §D.10–11), latched across broadcasts so its flickering action does
 * not flip the frame: once {@link engages} holds, it stays engaged until it is back at full health
 * and beyond {@link BOSS_LEASH_PX} of every living member, or dies, or leaves the snapshot. Fed
 * the snapshot's monsters, not only the shown: a boss merely hidden by fog keeps its latch, and the
 * picker passes it over while it is not shown.
 */
export class BossEngagement {
  private readonly engaged = new Set<string>();

  /**
   * This broadcast's monsters and the run's players: the `entity_id` of the first engaged boss
   * among `shown` (the monsters whose sprites are shown; by default all of them), if any.
   */
  observe(
    monsters: readonly MonsterState[],
    members: readonly PartyMember[],
    shown: readonly MonsterState[] = monsters,
  ): string | undefined {
    const present = new Set(monsters.map((m) => m.entity_id));
    for (const id of this.engaged)
      if (!present.has(id)) this.engaged.delete(id);
    for (const boss of monsters) {
      if (!boss.boss) continue;
      const id = boss.entity_id;
      const held = this.engaged.has(id)
        ? !releases(boss, members)
        : engages(boss, members);
      if (held) this.engaged.add(id);
      else this.engaged.delete(id);
    }
    return shown.find((m) => this.engaged.has(m.entity_id))?.entity_id;
  }

  /** Forget every latch: a new floor or a new run. */
  clear(): void {
    this.engaged.clear();
  }
}

/** What the frame may name this frame: each slot by `entity_id`, and the monsters shown. */
export interface TargetSlots {
  /** The living monsters whose sprites are shown, as the latest broadcast has them. */
  shown: readonly MonsterState[];
  /** The monster under the pointer (the strike-mark cursor's hit test). */
  hovered?: string;
  /** An engaged boss (FS-48CTQ §D, {@link BossEngagement}). */
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
 * The monster a cast names (FS-48CTQ §C.6): the one hovered as the cast is sent, while it lives
 * and is shown, as the latest broadcast has it; nothing with nothing hovered. A primary or ability
 * cast names no monster on the wire, so the pointer's is the player's intent.
 */
export function castTarget(
  hovered: string | undefined,
  shown: readonly MonsterState[],
): MonsterState | undefined {
  if (!hovered) return undefined;
  return shown.find((m) => m.entity_id === hovered && alive(m));
}

/**
 * The last-hit monster (§C.6): named by the latest intent (an `attack`, or a cast over it) the moment it is sent, held
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

  /** The local player sent an intent naming `monster` at `now`: an `attack`, or a cast over it. */
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
