/**
 * The interface sounds on the UI scene (FS-TQZ5J R22, FS-WDM0X): the game's one `UiSounds`, made as
 * the UI scene is created and lent to its game's UI bridge, which the worlds' player actions and
 * their minimap's step reach it through (R12). Phaser-free: the UI scene hands it the game's sound
 * as a `UiSoundStage` (`sceneUiSoundStage`), so the wiring is tested on its own.
 */

import { UiSounds, type UiSoundStage, type WindowState } from "@/audio/uiSounds";
import type { SfxSettingStore } from "@/audio/sfxSetting";
import type { UiBridge, WorldWindows } from "./uiBridge";

/** Every world window shut: what the rule reads while no world is reported. */
const NONE_OPEN: WorldWindows = { letter: false, party: false, inventory: false, character: false };

/**
 * Makes the game's one player and lends it to `bridge` (R22). Its window state is the UI scene's own
 * menu slot (the UI's reported state, R10) and the reported world's windows; with no world reported,
 * every world window is shut.
 */
export function mountInterfaceSounds(
  bridge: Pick<UiBridge, "world" | "ui" | "lendSounds">,
  stage: UiSoundStage,
  store: SfxSettingStore,
): UiSounds {
  const windows = (): WindowState => ({ ...(bridge.world?.windows() ?? NONE_OPEN), menu: bridge.ui.menuOpen });
  const sounds = new UiSounds(stage, store, windows);
  bridge.lendSounds(sounds);
  return sounds;
}
