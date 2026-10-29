/**
 * The delver's resource bars on the run's HUD (FS-8AY7S req 20–25): Health, and the class
 * resource under it, each labelled with its own name. Pure, so the labels, fills, pips and when
 * the bars show at all are tested without a canvas; `ResourceHud` draws what this returns.
 * Also the health bar over each teammate's head (req 27, 28), which the scene draws.
 */

import type {
  ClientGameState,
  PlayerState,
  ResourceKind,
  ResourceState,
} from "@/types/gameState";
import { resolved } from "./party";

/** How many pips a `parry_charges` resource is drawn as (req 22). */
export const PARRY_PIPS = 3;

/** Which colour channel a bar is drawn in: health, a known resource, or one the client does not know. */
export type HudChannel = "health" | "mana" | "stamina" | "parry" | "unknown";

/** One bar as the HUD draws it, top to bottom. */
export interface HudBar {
  channel: HudChannel;
  /** "Health:", "Mana:", ...; null for a resource kind the client does not know (no label). */
  label: string | null;
  /** How full, 0 to 1. */
  fill: number;
  /** Set only for parry charges: one entry per pip, lit for each charge held. */
  pips?: boolean[];
}

/**
 * A resource's own name and channel, per kind (req 21). The HUD labels a bar "<name>:"; the
 * creation lore card names a class's resource the same way (FS-MAMHR §G.30).
 */
export const RESOURCE_KINDS: Readonly<
  Record<ResourceKind, { channel: HudChannel; name: string }>
> = {
  mana: { channel: "mana", name: "Mana" },
  stamina: { channel: "stamina", name: "Stamina" },
  parry_charges: { channel: "parry", name: "Parry" },
};

/** The label and channel per kind, from `resource.kind`, never from a class table (req 21). */
const KINDS: Record<string, { channel: HudChannel; label: string }> =
  Object.fromEntries(
    Object.entries(RESOURCE_KINDS).map(([kind, { channel, name }]) => [
      kind,
      { channel, label: `${name}:` },
    ]),
  );

/** `current / max`, clamped to 0..1; a max of 0 or less is empty. */
function fillOf(current: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.max(0, Math.min(1, current / max));
}

/**
 * Whether the pool can pay for the delver's ability (FS-8AY7S req 31): the one affordability
 * judgement, read by the ability card's greying and by every client-side gate on a cast
 * (FS-JTNPR req 18), so the two never disagree. With no `resource` on the wire (an older server)
 * everything is affordable and the server's own refusal stands.
 */
export function abilityAffordable(resource: ResourceState | undefined): boolean {
  return resource === undefined || resource.current >= resource.ability_cost;
}

/**
 * The bars to draw, or none (req 24, 25): nothing in the hub, nothing before the delver's first
 * state, nothing once they are out of the delve (dead, escaped, left behind; so never while they
 * spectate). Health shows once the server has sent it; the resource bar only when `resource` is
 * on the wire, so an older server gets the health bar alone.
 */
export function hudBars(
  state: Pick<ClientGameState, "world_type" | "current_player">,
): HudBar[] {
  const me = state.current_player;
  if (state.world_type === "hub" || !me || resolved(me)) return [];

  const bars: HudBar[] = [];
  if (me.current_health !== undefined && me.max_health !== undefined)
    bars.push({
      channel: "health",
      label: "Health:",
      fill: fillOf(me.current_health, me.max_health),
    });

  const res = me.resource;
  if (res) {
    const known = KINDS[res.kind];
    const bar: HudBar = {
      channel: known?.channel ?? "unknown",
      label: known?.label ?? null,
      fill: fillOf(res.current, res.max),
    };
    if (bar.channel === "parry")
      bar.pips = Array.from({ length: PARRY_PIPS }, (_, i) => i < res.current);
    bars.push(bar);
  }
  return bars;
}

/**
 * How full a teammate's overhead health bar is (req 27, 28), or null when none is drawn: none in
 * the hub, none over a teammate out of the delve (a corpse, or one who has escaped), and none
 * before the server has sent their health. Health only: a teammate's resource is not on the wire.
 */
export function teammateHealthFill(
  worldType: ClientGameState["world_type"],
  mate: Pick<PlayerState, "escape" | "current_health" | "max_health">,
): number | null {
  if (worldType === "hub" || resolved(mate)) return null;
  if (mate.current_health === undefined || mate.max_health === undefined)
    return null;
  return fillOf(mate.current_health, mate.max_health);
}
