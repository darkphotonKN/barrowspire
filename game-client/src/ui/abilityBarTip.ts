/**
 * The ability bar's tooltips (FS-Q18Q3 §F R28, §L R40): which tooltip a hovered square shows, its words
 * looked up on the UI side from the keys the bar's view carries (never sent as words), and where it
 * stands, centred over its square and kept inside the view. Pure, so every rule is tested without a
 * canvas; `AbilityBar` draws what this returns.
 */

import { TREE_ABILITY } from "@/render/combat/treeAbility";
import {
  abilityCopy,
  POTION_COPY,
  POTION_FIELD_NOTE,
  POTION_NONE_NOTE,
  TREE_LOCKED_NOTE,
  treeAbilityCopy,
  type AbilityCopy,
} from "./abilityCopy";
import { CLASS_ABILITY_ICON, type AbilityBarView } from "./abilityBarView";
import type { AbilityBarFrame, AbilityBarSquare } from "./abilityBarLayout";
import type { AbilityIconKey } from "./abilityIcons";
import type { Point, XpBarView } from "./xpBarLayout";

/** A tooltip's widest, its words wrapping inside it (R28). */
export const ABILITY_TIP_MAX_W = 240;
/** Between the tooltip's foot and the bar's top (its plaques' top). */
const TIP_GAP = 6;
/** The nearest a tooltip comes to the view's edge. */
const VIEW_MARGIN = 4;

/**
 * A square's tooltip: its name (16 px, `hudText`), how it works (13 px, `hudLabel`) and a third line
 * (13 px, `hudFaint`), each there only where the square has it.
 */
export interface AbilityTip {
  name?: string;
  line?: string;
  note?: string;
}

/** The tooltip square `s` of `view` shows, or none (a class with no row, R27). A greyed square shows its own. */
export function abilityTip(s: AbilityBarSquare, view: AbilityBarView): AbilityTip | null {
  switch (s) {
    case "potion": {
      const { count, field } = view.potion;
      // in a field the field's line is the one that matters: nothing is drunk there, worn or not
      const note = field ? POTION_FIELD_NOTE : count === 0 ? POTION_NONE_NOTE : undefined;
      return { ...POTION_COPY, ...(note ? { note } : {}) };
    }
    case "ability": {
      const copy = view.ability.icon && copyOf(view.ability.icon, view.ability.specialization);
      return copy ? { ...copy } : null;
    }
    case "tree": {
      // held and locked alike, the class's tree ability's name and line (FS-04EEA R50); locked, a third line
      const { locked, ability } = view.tree;
      const copy = ability && treeAbilityCopy(classOf(TREE_ABILITY, ability));
      if (!locked) return copy ? { ...copy } : null;
      return { ...copy, note: TREE_LOCKED_NOTE };
    }
  }
}

/** The right-click copy of the class whose ability is keyed `icon`, as its `specialization` names it (FS-E1ZDG §L.43). */
function copyOf(icon: AbilityIconKey, specialization: string | undefined): AbilityCopy | null {
  return abilityCopy(classOf(CLASS_ABILITY_ICON, icon), specialization);
}

/** The class whose ability `byClass` keys as `icon`. */
function classOf(byClass: Readonly<Record<string, string>>, icon: AbilityIconKey): string | undefined {
  return Object.keys(byClass).find((c) => byClass[c] === icon);
}

/**
 * Where a `size` tooltip over square `s` stands (its top-left): centred over the square, its foot over the
 * bar's top, held inside `view` on every side, on whole pixels.
 */
export function abilityTipPlace(
  bar: AbilityBarFrame,
  s: AbilityBarSquare,
  size: { width: number; height: number },
  view: XpBarView,
): Point {
  const { well } = bar.squares[s];
  const x = Math.round(well.x + well.width / 2 - size.width / 2);
  const y = Math.round(bar.top - TIP_GAP - size.height);
  return {
    x: clamp(x, VIEW_MARGIN, view.width - VIEW_MARGIN - size.width),
    y: clamp(y, VIEW_MARGIN, view.height - VIEW_MARGIN - size.height),
  };
}

/** `n` held to [lo, hi]; where the view is too small to hold it, its low edge wins. */
function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(n, hi));
}
