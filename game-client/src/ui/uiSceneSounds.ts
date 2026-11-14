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
const NONE_OPEN: WorldWindows = { letter: false };

/** The UI scene's own windows the rule reads beside its menu slot (§ Change: Phase 2, R39; § Change: Phase 3, R55). */
export interface UiWindows {
  /** Whether the party panel is open now. */
  party(): boolean;
  /** Whether the gear overlay's inventory is open now. */
  inventory(): boolean;
  /** Whether the gear overlay's character panel is open now. */
  character(): boolean;
}

/** None of the UI scene's own windows: none open. */
const NO_WINDOWS: UiWindows = { party: () => false, inventory: () => false, character: () => false };

/**
 * Makes the game's one player and lends it to `bridge` (R22). Its window state is the UI scene's own
 * menu slot (the UI's reported state, R10), party panel (§ Change: Phase 2: the party, R39) and gear
 * overlay (§ Change: Phase 3, R55), and the reported world's letter panel; with no world reported, it is
 * shut.
 */
export function mountInterfaceSounds(
  bridge: Pick<UiBridge, "world" | "ui" | "lendSounds">,
  stage: UiSoundStage,
  store: SfxSettingStore,
  /** The hover cooldown's clock (§ Change M4); the page's, unless a test hands its own. */
  now?: () => number,
  /** The UI scene's own windows, read now; none, never open. */
  own: UiWindows = NO_WINDOWS,
): UiSounds {
  const windows = (): WindowState => ({
    ...(bridge.world?.windows() ?? NONE_OPEN),
    party: own.party(),
    inventory: own.inventory(),
    character: own.character(),
    menu: bridge.ui.menuOpen,
  });
  const sounds = new UiSounds(stage, store, windows, now);
  bridge.lendSounds(sounds);
  return sounds;
}
