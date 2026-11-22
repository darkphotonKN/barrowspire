/**
 * The gear and stats overlay's left panel as words and numbers (FS-HRH2J §C R24–30): the
 * character's class, name, level and experience, health and class resource, the class card's
 * base numbers, what worn gear adds and what the passive tree adds (FS-8RZ51 R44). Phaser-free,
 * so the summing and the rows are tested without a canvas; `GearOverlay` draws what this returns.
 *
 * It reads only what the client already holds (R24): the player's own world state, the worn
 * items the overlay draws, and the static class card. Nothing is fetched.
 */

import type { EquippedItems, PlayerState } from "@/types/gameState";
import { CLASS_LORE, type ClassKey, type ClassStats } from "@/data/classLore";
import { affixLine } from "@/items/itemLines";
import { itemStats, type StatLine } from "@/marketplace/detail";
import { atCap, progressOf, xpCount, xpFraction } from "./progress";
import { RESOURCE_KINDS, type HudChannel } from "./resources";
import { PASSIVE_NODES, nodeCopy, rankEffect } from "@/data/passiveTree";
import { characterTitle } from "@/data/specializations";

/** What the panel reads off the player's own world state (R24); every number may be absent. */
export type CharacterSource = Pick<PlayerState, "username" | "class"> &
  Partial<
    Pick<
      PlayerState,
      | "level"
      | "experience"
      | "level_floor"
      | "next_level_at"
      | "current_health"
      | "max_health"
      | "resource"
      // the passive tree's, read by the tree overlay from the same character (FS-8RZ51 R41)
      | "passive_ranks"
      | "passive_points"
      // the header's title (FS-E1ZDG §K.41)
      | "specialization"
    >
  >;

/** The left panel, top to bottom. */
export interface CharacterSheet {
  /** The class's display name, as the menus show it, or the character's title where they hold a spec (FS-E1ZDG §K.41). */
  className: string;
  name: string;
  /** The level; absent from the state means 1 (R25). */
  level: number;
  /** The experience bar: how full, and its count ("50 / 130", "Max level", or none). */
  xp: { fraction: number; text: string | null };
  /** Health, then the class resource; a field the state lacks has no row (R27). */
  resources: ResourceRow[];
  /** The class card's level-1 numbers (R28); none for a class the card does not know. */
  classStats: StatLine[];
  gear: GearStats;
  /** What the passive tree's held ranks add (FS-8RZ51 R44). */
  passives: PassiveStats;
}

/** One `current / max` row, drawn with a thin bar in its HUD channel's colour. */
export interface ResourceRow {
  label: string;
  channel: HudChannel;
  text: string;
  /** How full, 0 to 1. */
  fill: number;
}

/** The left panel from the player's state and what they wear (R25–29). */
export function characterSheet(
  player: CharacterSource,
  worn: EquippedItems,
): CharacterSheet {
  const key = (player.class ?? "").toLowerCase();
  const lore = Object.hasOwn(CLASS_LORE, key)
    ? CLASS_LORE[key as ClassKey]
    : undefined;
  const progress = progressOf(player);
  return {
    // the header sets its line in capitals, and keeps doing so for the title (FS-E1ZDG §K.37)
    className: characterTitle(key, player.specialization)?.toUpperCase() ?? lore?.name ?? (player.class ?? "").toUpperCase(),
    name: player.username,
    level: progress?.level ?? 1,
    xp: !progress
      ? { fraction: 0, text: null }
      : {
          fraction: xpFraction(progress),
          text: atCap(progress) ? "Max level" : xpCount(progress),
        },
    resources: resourceRows(player),
    classStats: lore ? classStatLines(lore.stats) : [],
    gear: gearStats(worn),
    passives: passiveStats(player.passive_ranks ?? {}),
  };
}

function resourceRows(player: CharacterSource): ResourceRow[] {
  const rows: ResourceRow[] = [];
  if (player.current_health !== undefined && player.max_health !== undefined)
    rows.push(
      row("Health", "health", player.current_health, player.max_health),
    );
  const r = player.resource;
  if (r) {
    const known = Object.hasOwn(RESOURCE_KINDS, r.kind)
      ? RESOURCE_KINDS[r.kind]
      : undefined;
    rows.push(
      row(
        known?.name ?? String(r.kind).replaceAll("_", " "),
        known?.channel ?? "unknown",
        r.current,
        r.max,
      ),
    );
  }
  return rows;
}

function row(
  label: string,
  channel: HudChannel,
  current: number,
  max: number,
): ResourceRow {
  const fill = max > 0 ? Math.min(1, Math.max(0, current / max)) : 0;
  return { label, channel, text: `${current} / ${max}`, fill };
}

/** The class card's numbers under "Class" (R28), the resource left to its own row above. */
function classStatLines(stats: ClassStats): StatLine[] {
  const lines: [string, number][] = [
    ["HP", stats.hp],
    ["Attack", stats.atk],
    ["Defense", stats.def],
    ["Range", stats.range],
    ["Speed", stats.speed],
  ];
  return lines.map(([label, value]) => ({ label, value: String(value) }));
}

/** What worn gear adds (R29). */
export interface GearStats {
  /** Attack, critical rate, defense and magic resistance, each summed; one a worn item lacks is left out. */
  stats: StatLine[];
  /** One line per affix stat a worn item carries, summed over every worn item. */
  affixes: string[];
  /** "Nothing worn" when every slot is empty; null otherwise. */
  note: string | null;
}

/** Each stat worn items carry, summed over them (R29). */
export function gearStats(worn: EquippedItems): GearStats {
  const base = {
    attackPower: 0,
    criticalRate: 0,
    defenseRating: 0,
    magicResistance: 0,
  };
  const affixTotals = new Map<string, number>();
  let wearing = false;
  for (const item of Object.values(worn)) {
    if (!item) continue;
    wearing = true;
    base.attackPower += item.attack_power ?? 0;
    base.criticalRate += item.critical_rate ?? 0;
    base.defenseRating += item.defense_rating ?? 0;
    base.magicResistance += item.magic_resistance ?? 0;
    for (const { stat, value } of item.affixes ?? [])
      affixTotals.set(stat, (affixTotals.get(stat) ?? 0) + value);
  }
  return {
    // the item tip's own words and order (a zero sum is left out there too)
    stats: itemStats(base),
    affixes: [...affixTotals].map(([stat, value]) =>
      affixLine({ stat, value }),
    ),
    note: wearing ? null : "Nothing worn",
  };
}

/** What the passive tree's held ranks add (FS-8RZ51 R44). */
export interface PassiveStats {
  /** One line per stat the held nodes raise, summed over every node that raises it. */
  stats: string[];
  /** One line per kicker held at its last rank (R29), by its name; its id where the copy lacks it (R42). */
  kickers: string[];
  /** "None yet" when the group has no line; null otherwise. */
  note: string | null;
}

/**
 * The held ranks' bonuses, from the golden's per-rank values (R6, R39), so a retuned number shows
 * without an edit. One line per stat, summed across nodes, in the tree's order; then each kicker
 * whose R3 rule is held.
 */
function passiveStats(ranks: Readonly<Record<string, number>>): PassiveStats {
  const totals = new Map<string, { amount: number; unit: string }>();
  const kickers: string[] = [];
  for (const node of PASSIVE_NODES) {
    const rank = Object.hasOwn(ranks, node.id) ? Math.min(ranks[node.id], node.maxRank) : 0;
    if (rank <= 0) continue;
    if (node.kind === "kicker" && rank === node.maxRank)
      kickers.push(nodeCopy(node.id)?.name ?? node.id);
    if (!node.perRank) continue;
    const { stat, amount, unit } = node.perRank;
    const total = totals.get(stat) ?? { amount: 0, unit };
    total.amount += amount * rank;
    totals.set(stat, total);
  }
  const stats = [...totals].map(([stat, { amount, unit }]) =>
    rankEffect({ stat, amount, unit }),
  );
  return {
    stats,
    kickers,
    note: stats.length || kickers.length ? null : "None yet",
  };
}
