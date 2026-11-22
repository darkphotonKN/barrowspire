/**
 * Each class's tree ability, by the skill id key 3 sends (FS-04EEA R35, R37), and whether the server would
 * take one now as the latest state shows it (R36): the character holds its tree's tier-3 node (FS-8RZ51
 * R23, `passive_ranks`), the cooldown is over and the class resource covers the cost (FS-Q18Q3 §A R4, R5,
 * `tree_ability_cooldown` and `resource.tree_ability_cost`). Pure, so the gate is tested without a canvas;
 * the server judges every cast again (R3).
 */

import { classNodes } from "@/data/passiveTree";
import type { PlayerState } from "@/types/gameState";

/** A tree ability, by the skill id its cast sends. */
export type TreeAbilityCast = "earthbreaker" | "blink" | "arrow_rain" | "settle_the_debt";

/** Each class's tree ability (FS-04EEA §B, §D, §E, §F), keyed by the lower-cased class. */
export const TREE_ABILITY: Readonly<Record<string, TreeAbilityCast>> = {
  warrior: "earthbreaker",
  mage: "blink",
  archer: "arrow_rain",
  mercenary: "settle_the_debt",
};

/** What the gate reads of the player's own state; every field may be absent. */
export type TreeAbilitySelf = Pick<PlayerState, "passive_ranks" | "tree_ability_cooldown" | "resource">;

/** The tree ability of a `cls` character, or none for a class without one. */
export function treeAbilityOf(cls: string | undefined): TreeAbilityCast | null {
  const key = cls?.toLowerCase();
  return key && Object.hasOwn(TREE_ABILITY, key) ? TREE_ABILITY[key] : null;
}

/** Whether a `cls` character holds its tree's ability: the class's tier-3 node at rank 1 (FS-8RZ51 R2, R23). */
export function treeAbilityHeld(cls: string | undefined, ranks: Readonly<Record<string, number>> | undefined): boolean {
  const node = cls ? classNodes(cls.toLowerCase()).find((n) => n.kind === "ability") : undefined;
  return node !== undefined && (ranks?.[node.id] ?? 0) >= 1;
}

/**
 * Whether the server would take a `cls` character's tree-ability cast now (R36): held, off cooldown and
 * affordable. A cost missing from the wire is left to the server. Settle the Debt's reads 1 (R5).
 */
export function treeAbilityReady(cls: string | undefined, me: TreeAbilitySelf | null | undefined): boolean {
  if (!me || !treeAbilityHeld(cls, me.passive_ranks)) return false;
  if ((me.tree_ability_cooldown?.remaining ?? 0) > 0) return false;
  const cost = me.resource?.tree_ability_cost;
  return cost === undefined || (me.resource?.current ?? 0) >= cost;
}
