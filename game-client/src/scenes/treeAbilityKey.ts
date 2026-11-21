/**
 * Key 3, the tree ability's (FS-04EEA R35, R36), bound in each world scene that fights (the run, a field)
 * as key 1 is: a keydown event read from `RUN_ACTIONS`, never an added key or a `JustDown` poll, because
 * the UI scene polls 1–3 for its menu rows (ADR-0084 Decision 4) and a second poll would steal its press.
 * Never bound in the UI scene: the cast is world play (ADR-0085 Decision 1).
 */

import type { UiState } from "@/ui/uiBridge";
import { RUN_ACTIONS } from "./runActions";

/** The keyboard a world scene binds key 3 on: Phaser's, or a test's. */
export interface TreeKeyboard {
  on(event: string, fn: (event?: KeyboardEvent) => void): unknown;
}

/**
 * Whether the UI scene's reported state holds key 3 back from the world (R36): its menu open, which reads
 * 3 as its third row, chat typing, or a gear-overlay panel open (the inventory, the character panel, the
 * passive tree).
 */
export function treeKeyHeldBack(ui: UiState): boolean {
  return ui.menuOpen || !!ui.typing || !!ui.inventory || !!ui.character || !!ui.tree;
}

/** What letting go of key 3 asks of the world: the Arrow Rain aim cast, or ended with nothing sent (R38). */
export interface TreeKeyLetGo {
  release(): void;
  cancel(): void;
}

/**
 * Binds key 3 on `keyboard`: a press the UI scene's state `ui` does not hold back is handed to `cast`,
 * with whether it is the keyboard's auto-repeat, which the combat sends nothing for (R36). With `letGo`, the
 * key's release is bound too, for the archer's Arrow Rain aim (R38): a release while nothing holds the key
 * back is handed to `letGo.release`; one while the UI scene holds it back (chat typing began mid-aim, say)
 * only cancels.
 */
export function bindTreeAbilityKey(
  keyboard: TreeKeyboard | null | undefined,
  ui: () => UiState,
  cast: (repeat: boolean) => void,
  letGo?: TreeKeyLetGo,
): void {
  keyboard?.on(`keydown-${RUN_ACTIONS.treeAbility.key}`, (event?: KeyboardEvent) => {
    if (treeKeyHeldBack(ui())) return;
    cast(event?.repeat === true);
  });
  if (!letGo) return;
  keyboard?.on(`keyup-${RUN_ACTIONS.treeAbility.key}`, () => {
    if (treeKeyHeldBack(ui())) letGo.cancel();
    else letGo.release();
  });
}
