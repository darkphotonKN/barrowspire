/**
 * The run HUD's potion cell (FS-P9G8R §C): how many health potions the player carries, and the
 * key that drinks one. Pure, so the count, the dimming and when the cell shows at all are tested
 * without a canvas; `PotionHud` draws what this returns.
 */

import type { ClientGameState, EquipmentState } from "@/types/gameState";
import { RUN_ACTIONS } from "@/scenes/runActions";
import { resolved } from "./party";
import { barsOf, hudBars, type HudBar } from "./resources";

/** The cell's width, and its gap from the resource bars it stands right of (R24). */
export const POTION_CELL_W = 72;
export const POTION_CELL_GAP = 6;

/** The slots a potion is drunk from, in the order the server tries them (R5). */
const CONSUMABLE_SLOTS = [
  "consumable_1",
  "consumable_2",
  "consumable_3",
] as const;

/** The cell as drawn: the count, the drink key's label, and whether it is dimmed (count 0). */
export interface PotionCellView {
  count: number;
  /** `[<key>]`, read from the `drinkPotion` mapping (R26). */
  keyLabel: string;
  dimmed: boolean;
}

/**
 * The health potions worn in the consumable slots, 0 to 3 (R23): an item that heals (R1), so a
 * mana-only potion is not one. Nothing worn, or no equipment on the wire, is 0.
 */
export function healthPotionCount(
  equipment: EquipmentState | null | undefined,
): number {
  if (!equipment) return 0;
  return CONSUMABLE_SLOTS.filter(
    (slot) => (equipment[slot]?.healing_amount ?? 0) > 0,
  ).length;
}

/**
 * The cell, or null when it is down (R24, R25): up exactly when the Health / resource bars are,
 * dimmed and reading 0 when no health potion is worn. The player's own equipment only.
 */
export function potionCell(
  state: Pick<ClientGameState, "world_type" | "current_player">,
): PotionCellView | null {
  if (hudBars(state).length === 0) return null;
  return cellOf(state.current_player?.equipment);
}

function cellOf(equipment: EquipmentState | null | undefined): PotionCellView {
  const count = healthPotionCount(equipment);
  return {
    count,
    keyLabel: `[${RUN_ACTIONS.drinkPotion.label}]`,
    dimmed: count === 0,
  };
}

/** The run's own bars and the potion cell beside them, as the HUD draws them. */
export interface OwnHud {
  bars: HudBar[];
  cell: PotionCellView | null;
}

/**
 * The run's own bars and potion cell for `state`, and what to hold from now on (FS-QPDKN § Change: The party
 * death flow and the spectate switcher, R168; the owner, 「左上角的個人血量魔量不用隱藏 就顯示死亡時的狀態就好了」):
 * in the delve, as `hudBars` and `potionCell` say; from the first state that shows the player out of it, dead
 * or escaped, the bars and the cell as that state drew them, held unchanged whatever later states say (one
 * that drops the player's own included). The cell stands with the bars, as R24 has it.
 */
export function runOwnHud(
  state: Pick<ClientGameState, "world_type" | "current_player">,
  held: OwnHud | undefined,
): OwnHud {
  if (held) return held;
  const me = state.current_player;
  if (state.world_type === "hub" || !me || !resolved(me)) return { bars: hudBars(state), cell: potionCell(state) };
  const bars = barsOf(me);
  return { bars, cell: bars.length === 0 ? null : cellOf(me.equipment) };
}
