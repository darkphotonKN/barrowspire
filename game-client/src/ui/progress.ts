/**
 * A character's progress as the HUD and the menus show it (FS-BDA7X req 42–45): the level, how
 * far the experience bar has filled, the cue when the level rises, and a refused equip's words.
 * (Every item view's "Requires level N" is `@/items/itemLines`, FS-4R9M9 R59.)
 * Pure, so the arithmetic and the copy are tested without a canvas; the views draw what these
 * return. The client never holds the experience curve: the server sends the floor and the next
 * threshold, and the bar is the distance between them.
 */

import type { Character } from "@/characters/roster";
import type { PlayerState } from "@/types/gameState";

/** Where a character stands, in the world state's own field names. */
export interface Progress {
  level: number;
  experience: number;
  /** Total experience at which the current level began. */
  level_floor: number;
  /** Total experience that reaches the next level; absent at the cap. */
  next_level_at?: number;
}

/**
 * How full the experience bar is, 0 to 1: the share of the current level already earned. Full at
 * the cap, where there is no next level.
 */
export function xpFraction(
  p: Pick<Progress, "experience" | "level_floor" | "next_level_at">,
): number {
  if (p.next_level_at === undefined) return 1; // the cap
  const span = p.next_level_at - p.level_floor;
  if (span <= 0) return 1;
  return Math.min(1, Math.max(0, (p.experience - p.level_floor) / span));
}

/** Whether the character stands at the level cap: the server sends no next threshold there. */
export function atCap(p: Pick<Progress, "next_level_at">): boolean {
  return p.next_level_at === undefined;
}

/** "Level 7", or "Level 20 · Cap" where the bar is full for good. */
export function levelLabel(
  p: Pick<Progress, "level" | "next_level_at">,
): string {
  return atCap(p) ? `Level ${p.level} · Cap` : `Level ${p.level}`;
}

/**
 * A delver's progress from the world state, or null while the server sends no level (a world
 * that does not carry progress yet draws no bar rather than a wrong one).
 */
export function progressOf(
  player: Partial<
    Pick<PlayerState, "level" | "experience" | "level_floor" | "next_level_at">
  >,
): Progress | null {
  if (player.level === undefined) return null;
  return progress(
    player.level,
    player.experience ?? 0,
    player.level_floor ?? 0,
    player.next_level_at,
  );
}

/** A server character's progress (the gateway's camelCase), for the character list (req 44). */
export function characterProgress(
  c: Pick<Character, "level" | "experience" | "levelFloor" | "nextLevelAt">,
): Progress {
  return progress(c.level, c.experience, c.levelFloor, c.nextLevelAt);
}

/** A Progress with `next_level_at` left out at the cap, rather than present and undefined. */
function progress(
  level: number,
  experience: number,
  level_floor: number,
  next_level_at: number | undefined,
): Progress {
  return next_level_at === undefined
    ? { level, experience, level_floor }
    : { level, experience, level_floor, next_level_at };
}

/**
 * Whether the level rose between two states (req 43). With no previous level (the first state
 * after a start or a reconnect) the incoming level is the baseline and raises no cue.
 */
export function levelRose(
  previous: number | undefined,
  incoming: number | undefined,
): boolean {
  return (
    previous !== undefined && incoming !== undefined && incoming > previous
  );
}

/** The cue's words when the level rises. */
export function levelUpCue(level: number): string {
  return `Risen to level ${level}`;
}

/** The server's reply to an `equip` (an error frame on refusal, FS-BDA7X req 32). */
export interface EquipReply {
  success?: boolean;
  message?: string;
}

/** What a refused equip says, in the server's own words (req 45); null for anything else. */
export function equipRefusal(reply: EquipReply): string | null {
  if (reply.success !== false || !reply.message) return null;
  return reply.message;
}

/** "50 / 130": experience earned into this level against what the level takes; null at the cap. */
export function xpCount(
  p: Pick<Progress, "experience" | "level_floor" | "next_level_at">,
): string | null {
  if (p.next_level_at === undefined) return null; // the cap
  return `${p.experience - p.level_floor} / ${p.next_level_at - p.level_floor}`;
}
