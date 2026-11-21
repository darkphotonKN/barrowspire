/**
 * The ability bar's view (FS-Q18Q3 §E, §G, §L R40): the three squares as the world judges them from its
 * latest state and what only its combat knows (the client's lockout, the Shadow Shot hold), handed to the
 * UI scene as plain data, with no function and no Phaser object (ADR-0086 Decision 3). Pure, so every rule
 * is tested without a canvas; `AbilityBar` on the UI scene draws what this returns. The copy lives in
 * `./abilityCopy`, and the UI side looks it up from the keys the view carries.
 */

import type { ClientGameState, CooldownState, PlayerState, ResourceState } from "@/types/gameState";
import { ABILITY_COPY, type AbilityCopy } from "./abilityCopy";
import type { AbilityIconKey } from "./abilityIcons";
import { resolved } from "./party";
import { healthPotionCount } from "./potions";
import { abilityAffordable, barsOf, hudBars, resourceBar, type HudBar, type HudChannel } from "./resources";

/** Each class's right-click ability, as its icon is keyed (R16). A class with none draws an empty well (R27). */
const CLASS_ABILITY_ICON: Readonly<Record<string, AbilityIconKey>> = {
  warrior: "dash",
  mage: "triple_fireball",
  archer: "shadow_shot",
  mercenary: "parry",
};

/** The right-click square (R22, R23): its icon, or none for a class with no row; its cost, or none to draw. */
export interface AbilitySquareView {
  icon: AbilityIconKey | null;
  greyed: boolean;
  active: boolean;
  cost: number | null;
}

/** The potion square (R24): the health potions worn, 0 to 3, and whether a press would drink nothing. */
export interface PotionSquareView {
  count: number;
  greyed: boolean;
}

/** The 3 square (R25): locked until the character holds its tree's ability (the held square is FS-Q18Q3 R26's). */
export interface TreeSquareView {
  locked: true;
}

/** The bar as the world hands it to the UI scene (R40). */
export interface AbilityBarView {
  potion: PotionSquareView;
  ability: AbilitySquareView;
  tree: TreeSquareView;
  /** The colour channel the costs are drawn in, from `resource.kind`; none with no resource on the wire (R15). */
  costChannel: HudChannel | null;
  /** The cooldowns as the state carried them, for the sweep (§D); none from an older server, or held (R30). */
  cooldowns: { ability: CooldownState | null; tree: CooldownState | null };
}

/** What the world knows that the broadcast does not (R40). */
export interface AbilityBarContext {
  /** Which world sends it: in a field a potion is never drunk (R29). */
  world: "run" | "field";
  /** The client's own cast lockout after a right-click is running (R22). */
  lockedOut: boolean;
  /** The archer is holding Shadow Shot (R23; FS-JTNPR). */
  aiming: boolean;
}

/** The class's ability copy, or null for a class with none (FS-8AY7S req 30). */
export function abilityCopy(cls: string | undefined): AbilityCopy | null {
  if (!cls) return null;
  return ABILITY_COPY[cls.toLowerCase()] ?? null;
}

/**
 * Whether the ability cannot fire for its pool or the lockout (FS-8AY7S req 31): the pool is short of the
 * cost (`abilityAffordable`, the rule the Shadow Shot hold reads too), or the lockout runs.
 */
export function abilityGreyed(resource: ResourceState | undefined, lockedOut: boolean): boolean {
  return lockedOut || !abilityAffordable(resource);
}

/**
 * Whether the server would refuse the Mercenary's parry now (FS-MAMHR req 35, 37): the stance is already
 * open, or the whiff lockout runs. The one judgement, read by the right-click gate and by the bar's
 * greying, so the two never disagree. Another class carries neither field: never.
 */
export function parryRefused(me: Pick<PlayerState, "parry_open" | "parry_lockout"> | null | undefined): boolean {
  return me?.parry_open === true || (me?.parry_lockout ?? 0) > 0;
}

/**
 * The live bar, or none (R29, R30): up exactly while the world's own Health and resource bars are (in the
 * delve, from the first state, never in the hub), so down while a field's player lies fallen.
 */
export function abilityBar(
  state: Pick<ClientGameState, "world_type" | "current_player">,
  ctx: AbilityBarContext,
): AbilityBarView | null {
  const me = state.current_player;
  if (!me || hudBars(state).length === 0) return null;
  return liveBar(me, ctx);
}

function liveBar(me: PlayerState, ctx: AbilityBarContext): AbilityBarView {
  const resource = me.resource;
  const cooling = (me.ability_cooldown?.remaining ?? 0) > 0;
  const count = healthPotionCount(me.equipment);
  return {
    potion: { count, greyed: count === 0 || ctx.world === "field" },
    ability: {
      icon: iconOf(me.class),
      greyed: abilityGreyed(resource, ctx.lockedOut) || cooling || parryRefused(me),
      active: ctx.aiming || me.parry_open === true,
      cost: costOf(resource),
    },
    tree: { locked: true },
    costChannel: resource ? resourceBar(resource).channel : null,
    cooldowns: { ability: me.ability_cooldown ?? null, tree: me.tree_ability_cooldown ?? null },
  };
}

/**
 * The bar held out of the delve (R30): every square greyed, nothing active and no sweep, the count and the
 * costs as the state that resolved the player showed them.
 */
function heldBar(me: PlayerState, ctx: AbilityBarContext): AbilityBarView {
  const live = liveBar(me, ctx);
  return {
    ...live,
    potion: { ...live.potion, greyed: true },
    ability: { ...live.ability, greyed: true, active: false },
    cooldowns: { ability: null, tree: null },
  };
}

function iconOf(cls: string | undefined): AbilityIconKey | null {
  return (cls && CLASS_ABILITY_ICON[cls.toLowerCase()]) || null;
}

/** The right-click's cost to draw under it: none for a cost of 0 (the parry) or no resource (R15). */
function costOf(resource: ResourceState | undefined): number | null {
  return resource && resource.ability_cost > 0 ? resource.ability_cost : null;
}

/** The run's own bars and the ability bar, as the HUD draws them. */
export interface OwnHud {
  bars: HudBar[];
  bar: AbilityBarView | null;
}

/**
 * The run's own bars and ability bar for `state`, and what to hold from now on (FS-QPDKN § Change: The party
 * death flow and the spectate switcher, R168; the owner, 「左上角的個人血量魔量不用隱藏 就顯示死亡時的狀態就好了」;
 * FS-Q18Q3 R30): in the delve, as `hudBars` and `abilityBar` say; from the first state that shows the player
 * out of it, dead or escaped, the bars and the held bar as that state drew them, held unchanged whatever
 * later states say (one that drops the player's own included). The bar stands with the bars.
 */
export function runOwnHud(
  state: Pick<ClientGameState, "world_type" | "current_player">,
  held: OwnHud | undefined,
  ctx: AbilityBarContext,
): OwnHud {
  if (held) return held;
  const me = state.current_player;
  if (state.world_type === "hub" || !me || !resolved(me)) return { bars: hudBars(state), bar: abilityBar(state, ctx) };
  const bars = barsOf(me);
  return { bars, bar: bars.length === 0 ? null : heldBar(me, ctx) };
}
