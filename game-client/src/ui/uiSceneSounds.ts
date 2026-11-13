/**
 * The interface sounds on the UI scene (FS-TQZ5J R22, FS-WDM0X): the game's one `UiSounds`, made as
 * the UI scene is created and lent to its game's UI bridge, which the worlds' player actions and
 * their minimap's step reach it through (R12). Phaser-free: the UI scene hands it the game's sound
 * as a `UiSoundStage` (`sceneUiSoundStage`), so the wiring is tested on its own.
 */

import { UiSounds, type UiSoundStage, type WindowState } from "@/audio/uiSounds";
import type { SfxSettingStore } from "@/audio/sfxSetting";
import type { UiBridge } from "./uiBridge";

/** Every window shut: what the rule reads while no world is reported. */
const NONE_OPEN: WindowState = { menu: false, letter: false, party: false, inventory: false, character: false };

/**
 * Makes the game's one player and lends it to `bridge` (R22). Its window state is the reported
 * world's windows, the ESC menu's slot among them until the menu moves into the UI scene
 * (I-TQZ5J-4); with no world reported, every window is shut.
 */
export function mountInterfaceSounds(
  bridge: Pick<UiBridge, "world" | "lendSounds">,
  stage: UiSoundStage,
  store: SfxSettingStore,
): UiSounds {
  const sounds = new UiSounds(stage, store, () => bridge.world?.windows() ?? NONE_OPEN);
  bridge.lendSounds(sounds);
  return sounds;
}
