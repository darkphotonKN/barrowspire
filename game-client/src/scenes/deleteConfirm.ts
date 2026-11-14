/**
 * The main menu's delete-character confirm, the browser's own `confirm()` (FS-WDM0X § Change: Menu,
 * dialog and notice sounds, M11, M13, M14): `dialog_open` as it asks, then `dialog_confirm_heavy` on OK
 * (a deletion cannot be undone) or `dialog_cancel` on Cancel. Phaser-free: the main menu hands it the
 * browser's ask and its own player.
 */

import type { UiEffect } from "@/audio/uiSounds";

export interface DeletionAsk {
  /** Asks the player, and answers OK (true) or Cancel (false): the browser's `confirm`. */
  ask(text: string): boolean;
  play(effect: UiEffect): void;
}

/** Asks whether to delete the character named `name`, with its sounds; whether to delete. */
export function confirmDeletion(name: string, { ask, play }: DeletionAsk): boolean {
  play("dialog_open");
  const yes = ask(`Delete character "${name}"?`);
  play(yes ? "dialog_confirm_heavy" : "dialog_cancel");
  return yes;
}
