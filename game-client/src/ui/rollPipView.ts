/**
 * The roll cooldown pip's pure half (FS-7P736 §B R16): what the pip beside the ability bar shows, as the
 * run judges it from its latest state and hands it to the UI scene as plain data through the run HUD
 * message, and where it stands. Ready, it is lit; while `roll_cooldown` runs it is swept, as FS-Q18Q3's
 * squares are (`cooldownSwept`), from the wire's cooldown and never a client clock (R14). Its label is
 * `RUN_ACTIONS.roll.label`. `RollPip` on the UI scene draws what this returns.
 */

import { RUN_ACTIONS } from "@/scenes/runActions";
import type { ClientGameState, CooldownState } from "@/types/gameState";
import { ABILITY_SQUARE_GAP, abilityBarFrame } from "./abilityBarLayout";
import type { Rect } from "./hudCornerLayout";
import { resolved } from "./party";
import type { XpBarView } from "./xpBarLayout";

/** The pip as the run hands it to the UI scene. */
export interface RollPipView {
  /** The key, as the HUD reads it: "Space". */
  label: string;
  /** Lit: no roll cooldown runs on the wire, and the player is still in the delve. */
  ready: boolean;
  /** The roll cooldown as the state carried it, for the sweep; none while none runs, or out of the delve. */
  cooldown: CooldownState | null;
}

/**
 * The pip, or none (R16): up in a run from the player's first state, unlit and unswept once they are out
 * of the delve (as the ability bar is held), swept while `roll_cooldown` runs, lit otherwise.
 */
export function rollPipView(state: Pick<ClientGameState, "world_type" | "current_player">): RollPipView | null {
  const me = state.current_player;
  if (state.world_type === "hub" || !me) return null;
  const label = RUN_ACTIONS.roll.label;
  if (resolved(me)) return { label, ready: false, cooldown: null };
  const cooldown = me.roll_cooldown && me.roll_cooldown.remaining > 0 ? { ...me.roll_cooldown } : null;
  return { label, ready: cooldown === null, cooldown };
}

/** The pip's well, logical px: small beside the bar's 44 px squares. */
export const ROLL_PIP_SIZE = 24;
/** The label's slot: wide enough for "Space" in the bar's 12 px serif. */
const LABEL_W = 44;

export interface RollPipFrame {
  /** The pip's well, the sweep's square. */
  well: Rect;
  /** Its label's slot under it, on the bar's cost line. */
  label: Rect;
}

/**
 * Where the pip stands in `view` (R16): one gap right of the ability bar's last square, its foot on the
 * squares' foot, its label on the bar's cost line under it; read from the bar's own layout, never restated.
 */
export function rollPipFrame(view: XpBarView): RollPipFrame {
  const last = abilityBarFrame(view).squares.tree;
  const x = last.well.x + last.well.width + ABILITY_SQUARE_GAP;
  const well = { x, y: last.well.y + last.well.height - ROLL_PIP_SIZE, width: ROLL_PIP_SIZE, height: ROLL_PIP_SIZE };
  const label = { x: x + ROLL_PIP_SIZE / 2 - LABEL_W / 2, y: last.cost.y, width: LABEL_W, height: last.cost.height };
  return { well, label };
}
