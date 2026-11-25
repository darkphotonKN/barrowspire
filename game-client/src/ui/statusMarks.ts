/**
 * The player's status marks on the run's HUD (FS-5FZ4J §J R55): a small mark per lasting status,
 * beside the player's own health bar, each with a hover line: the hallowed altar's Blessing and
 * Contract Settled (FS-4EC7Z §G R34), in that order (poison is the health bar's tint). Pure, so which marks show, their words and where they
 * stand are tested without a canvas; `StatusMarksHud` draws what this returns, on the UI scene
 * (ADR-0086: screen-fixed).
 */

import type { ClientGameState } from "@/types/gameState";
import { resolved } from "./party";
import { HUD_COLUMN_W, RESOURCE_HUD_AT, resourceHudRowMiddle } from "./ResourceHud";
import type { HudPoint } from "./uiSceneHud";

/** A lasting status the HUD marks. */
export type StatusMark = "blessed" | "contract_settled";

/** Each mark's hover line, in the client's words. */
export const STATUS_MARK_LINES: Readonly<Record<StatusMark, string>> = {
  blessed: "Blessed: better finds, quicker resource",
  contract_settled: "Contract Settled: +15% damage",
};

/** A mark's square, logical px. */
export const STATUS_MARK_SIZE = 16;
/** Between the bars' column and the first mark, and between marks. */
const GAP = 4;
/** Between a mark's foot and its hover line's top. */
const TIP_DROP = 6;

/** Where a run stands its first mark, its top-left: just right of the bars' column, on the health row's middle. */
export const STATUS_MARKS_AT: HudPoint = {
  x: RESOURCE_HUD_AT.run.x + HUD_COLUMN_W + GAP,
  y: resourceHudRowMiddle(RESOURCE_HUD_AT.run.y, 0) - STATUS_MARK_SIZE / 2,
};

export interface MarkRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The marks to draw, in order (R55), or none: none in the hub, before the player's first state, or
 * once they are out of the delve (the Blessing is lost at death and ends with the delve, §G R44).
 */
export function statusMarks(state: Pick<ClientGameState, "world_type" | "current_player">): StatusMark[] {
  const me = state.current_player;
  if (state.world_type === "hub" || !me || resolved(me)) return [];
  const marks: StatusMark[] = [];
  if (me.blessed === true) marks.push("blessed");
  if (me.contract_settled === true) marks.push("contract_settled");
  return marks;
}

/** `count` marks' squares from `at`, in a row left to right. */
export function statusMarkRects(at: HudPoint, count: number): MarkRect[] {
  return Array.from({ length: count }, (_, i) => ({
    x: at.x + i * (STATUS_MARK_SIZE + GAP),
    y: at.y,
    width: STATUS_MARK_SIZE,
    height: STATUS_MARK_SIZE,
  }));
}

/** Where a mark's hover line hangs, its top-left: just under the mark, from its left edge. */
export function statusTipAt(mark: MarkRect): HudPoint {
  return { x: mark.x, y: mark.y + mark.height + TIP_DROP };
}
