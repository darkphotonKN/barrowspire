/**
 * The run's named actions and the keys that perform them (FS-P9G8R R26): the one place a key is
 * mapped to an action, so a future rebinding changes this table and nothing else. Whatever binds
 * an action reads `key` (a Phaser key name: `keydown-${key}`, `KeyCodes[key]`); whatever shows
 * it to the player reads `label`. Neither is typed again anywhere.
 *
 * Phaser-free (a type import only), so the HUD's pure views read it under test.
 */

import type Phaser from "phaser";

/** A key as Phaser names it in `KeyCodes` and in its `keydown-<NAME>` events. */
export type RunKeyName = keyof typeof Phaser.Input.Keyboard.KeyCodes;

export interface RunKeyBinding {
  key: RunKeyName;
  /** How the key reads on the HUD and in the controls panel. */
  label: string;
}

export const RUN_ACTIONS = {
  /** Drink a health potion from the consumable slots (FS-P9G8R R27). */
  drinkPotion: { key: "ONE", label: "1" },
} as const satisfies Record<string, RunKeyBinding>;
