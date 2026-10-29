/**
 * The class ability card on the run's HUD (FS-8AY7S req 29–32): which card, whether it is lit,
 * and when it is up at all. Pure, so the rules are tested without a canvas; `AbilityHud` draws
 * what `abilityCard` returns. The copy lives in `./abilityCopy`.
 */

import type { ClientGameState, PlayerState, ResourceState } from "@/types/gameState";
import { ABILITY_COPY, type AbilityCopy } from "./abilityCopy";
import { resolved } from "./party";
import { abilityAffordable } from "./resources";

/** The card as the HUD draws it. */
export interface AbilityCardView extends AbilityCopy {
  /** The ability cannot fire right now (req 31). */
  greyed: boolean;
}

/** What the scene knows that the broadcast does not. */
export interface AbilityCardContext {
  /** The client's own cast lockout after a right-click is running (req 31). */
  lockedOut: boolean;
  /** The dead spectator's leave button holds the bottom-right corner (req 32). */
  leaveUp: boolean;
}

/** The class's row, or null for a class with none (req 30). */
export function abilityCopy(cls: string | undefined): AbilityCopy | null {
  if (!cls) return null;
  return ABILITY_COPY[cls.toLowerCase()] ?? null;
}

/**
 * Whether the ability cannot fire (req 31): the pool is short of the cost (`abilityAffordable`,
 * the rule the Shadow Shot hold reads too), or the lockout runs.
 */
export function abilityGreyed(
  resource: ResourceState | undefined,
  lockedOut: boolean,
): boolean {
  return lockedOut || !abilityAffordable(resource);
}

/**
 * Whether the server would refuse the Mercenary's parry now (FS-MAMHR req 35, 37): the stance is
 * already open, or the whiff lockout runs. The one judgement, read by the right-click gate and by
 * the card's greying, so the two never disagree. Another class carries neither field: never.
 */
export function parryRefused(
  me: Pick<PlayerState, "parry_open" | "parry_lockout"> | null | undefined,
): boolean {
  return me?.parry_open === true || (me?.parry_lockout ?? 0) > 0;
}

/**
 * The card to draw, or none (req 29–32): none in the hub, none before the delver's first state,
 * none once they are out of the delve (so never while they spectate), none while the leave
 * button holds the corner, and none for a class with no row.
 */
export function abilityCard(
  state: Pick<ClientGameState, "world_type" | "current_player">,
  ctx: AbilityCardContext,
): AbilityCardView | null {
  const me = state.current_player;
  if (state.world_type === "hub" || !me || resolved(me) || ctx.leaveUp)
    return null;
  const copy = abilityCopy(me.class);
  if (!copy) return null;
  return {
    ...copy,
    greyed: abilityGreyed(me.resource, ctx.lockedOut) || parryRefused(me),
  };
}
