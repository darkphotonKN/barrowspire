/**
 * What the screen tells a contract's taker (FS-4EC7Z §G R34): while it is active, the mark's heading
 * as a small line under the HUD's notices, updated as the heading turns; its end, settled or lost,
 * as a HUD notice in its tone. Read off `current_player.contract`, which only the taker carries
 * (§F R25). The ends are said against the previous broadcast, a first broadcast (a connect, a
 * reconnect) being the baseline that says nothing, as `StatusWatch` does. Pure, so the copy is tested
 * without a canvas; the run scene hands the line to the UI scene's HUD (ADR-0086: screen-fixed).
 */

import type { ContractState } from "@/types/gameState";
import type { SealNotice } from "./sealLines";
import { sealWindowFrame } from "./sealWindow";

/** Screen px between the Braziers window's place and the line under it. */
const UNDER_WINDOW = 6;

/**
 * Where the heading line stands on a view `viewWidth` wide, its top centre: under the run's notices,
 * below where the Braziers window's countdown stands, so the two never cover each other.
 */
export function contractLineAt(viewWidth: number): { x: number; y: number } {
  const { panel } = sealWindowFrame(viewWidth);
  return { x: Math.round(viewWidth / 2), y: panel.y + panel.height + UNDER_WINDOW };
}

/** The heading line while the contract is active and a heading is known, else none. */
export function contractLine(contract: ContractState | undefined): string | null {
  if (contract?.state !== "active" || !contract.heading) return null;
  return `Mark: last seen to the ${contract.heading}`;
}

export class ContractWatch {
  /** The last broadcast's contract state, `null` for none, or `undefined` before the first: the baseline. */
  private last?: string | null;

  /**
   * This broadcast's notices. `contract` is the player's own; `null` is no player (escaped, or out of
   * the delve), and the next broadcast after it is a first.
   */
  see(contract: ContractState | undefined | null): SealNotice[] {
    const before = this.last;
    this.last = contract === null ? undefined : (contract?.state ?? null);
    if (before === undefined || contract === null || contract?.state === before) return [];
    if (contract?.state === "settled") return [{ text: "Contract Settled.", tone: "done" }];
    if (contract?.state === "lost") return [{ text: "Contract lost.", tone: "refused" }];
    return [];
  }

  /** Forget the last broadcast: the next one is a first. */
  reset(): void {
    this.last = undefined;
  }
}
